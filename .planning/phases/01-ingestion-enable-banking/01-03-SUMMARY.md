---
phase: 01-ingestion-enable-banking
plan: 03
status: complete
requirements: [ING-01, ING-02, ING-05]
completed: 2026-06-22
tags: [ingestion, enable-banking, jwt, zod, consent, supabase, service_role]
provides:
  - signEbJwt (RS256 EB app credential)
  - Enable Banking typed zod-validated client + ConsentExpiredError
  - eb-connect consent persistence (connections + accounts + heartbeat)
requires:
  - 01-01 (spike findings + RED tests + spike-form eb-connect)
  - 01-02 (ingestion schema: cost_centers, connections/accounts columns, import_batches)
affects:
  - 01-04 (cron: reads ConsentExpiredError + the persisted virtual investing row)
  - 01-05 (freshness/reconnect banner reads connections.consent_status / last_pull_at)
key-files:
  created:
    - src/lib/ingestion/enable-banking/jwt.ts
    - src/lib/ingestion/enable-banking/schemas.ts
    - src/lib/ingestion/enable-banking/client.ts
  modified:
    - scripts/eb-connect.ts
    - test/connect.test.ts
    - vitest.config.ts (un-quarantine test/jwt.test.ts)
metrics:
  duration_min: 9
  tasks: 3
  files: 6
---

# Phase 01 Plan 03: Enable Banking signer, client & consent-persisting connect — Summary

JWT signer + zod-validated EB client + the production `pnpm eb:connect` that persists the
live consent (connections + accounts + heartbeat) with `expires_at` read from the real
`access.valid_until` — making ING-05 structurally true.

## What was built

- **`src/lib/ingestion/enable-banking/jwt.ts`** — `signEbJwt(appId, privateKeyPem)`: RS256
  via `jose`, protected header `{typ:"JWT", alg:"RS256", kid:appId}`, `iss=enablebanking.com`,
  `aud=api.enablebanking.com`, 1h TTL (ING-02, T-01-10). Key passed in as PEM, never logged.
- **`src/lib/ingestion/enable-banking/schemas.ts`** — zod boundary schemas (V5, T-01-06) for
  `/aspsps`, `/auth`, `/sessions`, transactions (`continuation_key` paging), and balances.
  `.passthrough()` so extra Revolut fields survive; shaped to accept the live PII-scrubbed
  `test/fixtures/eb-sessions.json` (A3 only `entry_reference`, A4 BOOK-only, A6 IBANs present).
- **`src/lib/ingestion/enable-banking/client.ts`** — typed fetch wrapper over `EB_BASE`:
  `aspsps()`, `auth()`, `sessions()`, async-gen `fetchTransactions()` (paginates via
  `continuation_key`), `balances()`. Every response is `.parse()`d at the boundary; 401/403
  throws **`ConsentExpiredError`** (drives the fail-soft banner in 01-04/01-05, T-01-12).
  Server-plane only; never logs JWT/IBAN/amount/description (V7).
- **`scripts/eb-connect.ts`** — extended the 01-01 spike form (PII-scrubbed fixture writing
  preserved) to use the audited jwt/client/schemas and to **persist the consent** via
  `createServiceClient()` (`persistSession`): one `connections` row, one `accounts` row per
  returned account, a virtual investing row, and one `import_batches` heartbeat.
- **`vitest.config.ts`** — deleted the `test/jwt.test.ts` quarantine line, re-arming it GREEN.

## Account-identity → default_cost_center mapping (decision)

Inferred from the account `name` (per the spike's identities), with an interactive operator
confirmation fallback for any account whose owner cannot be inferred:

| EB account identity (spike)   | default_cost_center |
| ----------------------------- | ------------------- |
| Lorenzo — personal            | `lorenzo`           |
| Fernanda — personal           | `fernanda`          |
| Joint (shared)                | `compartilhado`     |
| (uninferrable)                | operator prompt → one of lorenzo/fernanda/compartilhado |

Values are the seeded `cost_centers` codes (D-24). `cost_center` is an analytical label, never
an access boundary (D-15). The operator override is passed to `persistSession` as a
`uid → cost_center` map, so the account name is never mutated.

## Virtual investing-account row

**Yes — `eb:connect` creates one.** The spike confirmed the Revolut investing pocket is **NOT
exposed over PSD2** (A2), so when no returned account looks investing, `persistSession` upserts a
virtual `accounts` row: `is_investment=true`, `enable_banking_id=null`, `is_synced=false`
(D-22). The daily pull skips it (`is_synced=false`); Phase-1 rules match `investimento` on the
OUTGOING leg against it (counterparty signature wired in 01-04).

## Requirements

- **ING-02** ✓ — RS256 `signEbJwt` (kid=appId, iss/aud, exp−iat=3600); `jwt.test.ts` GREEN.
- **ING-01** ✓ — `eb-connect` persists `connections` + one `accounts` row per session account
  (+ virtual investing row) + a heartbeat via the server-only `service_role` client.
- **ING-05** ✓ — `connections.expires_at` is read from the real `access.valid_until`, never
  hardcoded; `connect.test.ts` asserts it against both an explicit mock and the live fixture.

## Verification

- `pnpm test -- test/jwt.test.ts` → 4 passed (JWT-GREEN, after un-quarantine).
- `pnpm test -- test/connect.test.ts` → 3 passed (CONNECT-GREEN; in-memory writer, no live DB).
- `pnpm test` (full) → **5 files / 28 tests passed** (was 3/21; +jwt +connect). The
  normalize/dedupe/rules + ingest.* suites remain quarantined for 01-04/01-05 — expected.
- `pnpm build` → clean; ingestion modules compile and do not leak into the client bundle.
- `pnpm lint` → clean.
- Task greps: `ConsentExpiredError`/`continuation_key`/`.parse(` in client.ts;
  `createServiceClient`/`valid_until` in eb-connect.ts — all present.

## Deviations from Plan (incl. live-run integration fixes)

The unit tests (mocked writer) passed, but the LIVE run surfaced integration issues the mocks
could not — each fixed on the branch after the executor's commits:

- **DB client: `supabase-js` → `postgres` driver** (`createServiceWriter`). Writing via
  `src/lib/supabase/service.ts` hit two Node walls in sequence: `import "server-only"` throws
  outside a Next RSC build (a lazy import only deferred the throw to the live run), and the
  `supabase-js` client eagerly inits a Realtime **WebSocket**, absent on Node 20. Rewrote the
  writer to use the `postgres` driver + `DATABASE_URL` (the project's Node DB path —
  `test:rls`/drizzle; a direct connection is the service_role-equivalent the cron also needs).
  Also fixed a latent bug: `connections` has no UNIQUE on `session_id`, so the supabase
  `onConflict` would have failed — now a hand-rolled select-then-insert/update. `ConsentWriter`
  gained an optional `close()`; `persistSession` releases the pool when it owns the writer.
- **Virtual investing-row idempotency.** `enable_banking_id=null` can't be deduped by a unique
  index (NULLs are distinct), so both logins would have inserted two virtual rows. The writer
  now check-then-inserts → exactly one (verified live: 1 row across both runs).
- **`credit_debit_indicator` `DBDT`→`DBIT`; pending `PEND`→`PDNG`.** The plans + schema carried
  wrong literals; the real API rejected every transaction. Fixed in `schemas.ts` and the
  (quarantined) normalize contract; locked by the new `test/schemas.test.ts`. **Critical** — the
  indicator is the canonical sign source. See memory `enable-banking-real-tx-values`.
- **Joint cost-center.** `inferCostCenter("FERNANDA & LORENZO")` returned `lorenzo` (first
  match wins); now detects both names → `compartilhado` (D-25).
- **PII.** The `01-SPIKE.md` append wrote real account-holder names; now masked to the
  cost-center role label before reaching the committed doc (public repo, D-09).
- **[Quarantine re-arm]** Removed `test/jwt.test.ts` from the `vitest.config.ts` `exclude` (per
  the 01-01 carry-forward) so it runs GREEN.

Full suite after fixes: **6 files / 30 tests pass**; build + lint clean.

## Live run — COMPLETE (2026-06-22)

`pnpm eb:connect` was run live with the user for **both** Revolut logins (Lorenzo, then
Fernanda). Read-back verified against the live Supabase DB:

- **2 `connections`** — both `consent_status='active'`, `expires_at` = the real
  `access.valid_until` (2026-12-19), one per login (D-08).
- **4 `accounts`** — 3 real (`lorenzo`, `compartilhado` joint via Lorenzo's login, `fernanda`)
  + exactly **1** virtual investing row (`is_investment=true`, `is_synced=false`) — idempotent
  across both runs (the dedup fix held).
- **2 `import_batches`** heartbeats.

ING-01's "live session persisted" is satisfied. The transactions-page capture also succeeded
(41 tx) once the schema accepted the real `DBIT` value.

## Deferred / notes

- The virtual investing row's `iban`/counterparty signature is left null here; the contribution
  matching rule sets it in 01-04 (D-22).
- Investing-account market value (virtual holdings) is a Phase-6 concern (D-28).

## Self-Check: PASSED

- FOUND: src/lib/ingestion/enable-banking/jwt.ts
- FOUND: src/lib/ingestion/enable-banking/schemas.ts
- FOUND: src/lib/ingestion/enable-banking/client.ts
- FOUND (modified): scripts/eb-connect.ts, test/connect.test.ts, vitest.config.ts
- FOUND commit 6d80e42 (Task 1), 647fa93 (Task 2), c7aceb8 (Task 3)
