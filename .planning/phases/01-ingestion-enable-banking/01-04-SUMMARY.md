---
phase: 01-ingestion-enable-banking
plan: 04
subsystem: ingestion-pipeline
tags: [ingestion, normalize, dedupe, rules, idempotency, fail-soft, classify-on-ingest]
requires: [01-01, 01-02, 01-03]
provides:
  - "src/lib/ingestion/normalize.ts (rawTx -> Normalized, signed EUR, PDNG excluded)"
  - "src/lib/ingestion/dedupe.ts (versioned sha256 dedupeHash, bank_id|composite)"
  - "src/lib/ingestion/rules/engine.ts (pure applyRules classifier)"
  - "src/lib/ingestion/rules/builtins.ts (seeded ordered rule set + versions)"
  - "scripts/ingest.ts (headless idempotent pull + classify + heartbeat + fail-soft)"
affects: [phase-02-core-bi, phase-03-100k-goal, phase-05-ai-digest]
tech-stack:
  added: []
  patterns:
    - "node:crypto sha256 for the frozen, versioned dedupe hash (no npm hashing dep)"
    - "postgres driver via DATABASE_URL for cron DB writes (NOT createServiceClient — server-only throws + supabase-js Realtime WS absent on Node 20)"
    - "injectable writer + fetcher so integration tests run against an in-memory fake (no live DB/network)"
    - "pure, ordered, first-match-wins rules engine (deterministic classify-on-ingest)"
key-files:
  created:
    - src/lib/ingestion/normalize.ts
    - src/lib/ingestion/dedupe.ts
    - src/lib/ingestion/rules/engine.ts
    - src/lib/ingestion/rules/builtins.ts
    - scripts/ingest.ts
    - test/helpers/fake-ingest-writer.ts
  modified:
    - vitest.config.ts
    - package.json
    - test/ingest.heartbeat.test.ts
    - test/ingest.consent.test.ts
key-decisions:
  - "Investimento detection uses the VIRTUAL-ROW branch (A2: investing pocket NOT PSD2-exposed) — matched on the OUTGOING leg by destination IBAN or counterparty signature, never a hardcoded id."
  - "Dedupe strategy: bank_id preferred (sha256 v1|id|account|bankTxId); composite fallback pinned to booking_date (sha256 v1|composite|account|bookingDate|amount.toFixed(2)|normalizedDescription) — stable across value_date flips."
  - "ingest.ts writes via the postgres driver / DATABASE_URL, NOT createServiceClient (plan's stated approach is broken in a tsx script)."
  - "credit leg landing ON an is_investment account is short-circuited away from revenue (CAT-03)."
requirements-completed: [ING-02, ING-03, ING-04, ING-05, CAT-02, CAT-03, CAT-07]
duration: 9 min
completed: 2026-06-22
---

# Phase 01 Plan 04: Ingestion Pipeline (normalize · dedupe · rules · ingest) Summary

Three pure, frozen pipeline modules (sign-from-indicator normalize, versioned `dedupeHash`, ordered first-match-wins `applyRules`) plus a headless `scripts/ingest.ts` that performs an idempotent, classify-on-ingest daily pull — re-runnable with zero duplicate rows, classifying the €4k contribution as `investimento` at the source, snapshotting balances, writing an `import_batches` heartbeat on every run, and failing soft on a 403 consent expiry (exit 0). All 5 remaining quarantined Wave-0 suites re-armed and GREEN.

- **Duration:** 9 min (start 2026-06-22T15:36Z, end 2026-06-22T15:45Z)
- **Tasks:** 3 / 3
- **Files:** 6 created, 4 modified
- **Tests:** 60 passing across 11 files (up from 30 / 6 baseline; 0 quarantined remaining)

## What Was Built

### Task 1 — normalize + dedupe (`ac35ba9`)
- `normalize(raw, accountId)`: sign derived **only** from `credit_debit_indicator` — `DBIT` → negative (outflow), `CRDT` → positive (inflow); period from `booking_date` never `value_date`; counterparty = creditor on DBIT / debtor on CRDT; `PDNG` (and any non-`BOOK`) excluded → returns `null`.
- `dedupeHash(normalized)`: versioned (`HASH_VERSION="v1"`) `node:crypto` sha256; `bank_id` strategy when a bank id is present, else a `composite` fallback pinned to `booking_date` so the hash is identical across `value_date` flips.
- Re-armed `test/normalize.test.ts` + `test/dedupe.test.ts` → 18 GREEN.

### Task 2 — rules engine + builtins (`ef515eb`)
- `applyRules(tx, accountsById)`: pure, ordered, first-match-wins → `investimento` (outflow whose destination resolves to ANY `is_investment` account) > `transferencia` (counterparty IBAN ∈ cash accounts) > `revenue` (salary signature; sublet received → `sublocacao`) > `cost` (default; sublet paid → `sublocacao`).
- costCenter defaults to the account's `defaultCostCenter` unless a rule overrides; investimento keys on `is_investment=true`, never a hardcoded id; a credit leg landing on an investing account is structurally excluded from `revenue` (CAT-03).
- `builtins.ts`: stable `RuleId`s + `RULESET_VERSION`, salary/sublet signatures.
- Re-armed `test/rules.test.ts` → 9 GREEN.

### Task 3 — scripts/ingest.ts (`326e621`)
- `runIngest(opts)` testable core: incremental `date_from` (`last_pull_at` − 2-day overlap) → normalize → `dedupeHash` → upsert `ON CONFLICT (dedupe_hash) DO NOTHING` → `applyRules` stamps `flow_type/cost_center/category_id/is_recurring/rule_id` → balances snapshot → `import_batches` heartbeat in a `finally` (every run) → advance `last_pull_at` only on success.
- Fail-soft: `ConsentExpiredError` (403) → `connections.consent_status='expired'`, batch `'auth_expired'`, **exit 0**; transient error → `'error'`, exit 1; forward-only.
- DB writes via the `postgres` driver / `DATABASE_URL` (the eb-connect pattern), with an **injectable** `IngestWriter` + `IngestFetcher` so tests run against an in-memory fake (no live DB / network).
- Registered `pnpm ingest`; re-armed + activated `test/ingest.heartbeat.test.ts` + `test/ingest.consent.test.ts` with real assertions → 3 GREEN.

## Design answers requested by the plan

- **Investimento-detection branch:** virtual-row (per A2 — the investing pocket is NOT PSD2-exposed). The outgoing leg is matched against the virtual `is_investment` account's stored IBAN or its `counterpartySignature` (e.g. "vanguard"); source- and amount-agnostic.
- **Dedupe strategy design:** `bank_id` preferred (the bank's stable id, scoped by account), `composite` fallback pinned to `booking_date` + signed amount (2dp) + normalized description. Frozen + versioned (`v1`). Live double-pull match-rate is to be confirmed at the phase gate (no live DB in this plan).
- **ingest.ts DB writer:** confirmed — writes via the `postgres` driver built from `DATABASE_URL`, NOT `createServiceClient()` / `@supabase/supabase-js` / `service.ts`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocker] Corrected indicator/status literals to the live-API contract**
- **Found during:** Tasks 1 & 2
- **Issue:** The PLAN/RESEARCH prose say `DBDT` (debit) and `PEND` (pending). The live API (Wave 3) proved these are `DBIT` and `PDNG`; the corrected test files are the authoritative contract.
- **Fix:** Implemented `normalize` against `DBIT`/`CRDT` and excluded `PDNG` (kept only `status === "BOOK"`). Matches the existing zod schema (`schemas.ts` already uses `CRDT|DBIT`).
- **Files:** src/lib/ingestion/normalize.ts
- **Verification:** test/normalize.test.ts GREEN
- **Commit:** ac35ba9

**2. [Rule 3 - Blocker] DB writer uses the postgres driver, not createServiceClient**
- **Found during:** Task 3
- **Issue:** The plan's key_links + Task 3 action say "Use createServiceClient()". That is broken in a tsx/Node script: `service.ts` starts with `import "server-only"` (throws outside an RSC build) and supabase-js eagerly inits a Realtime WebSocket Node 20 lacks (both proven in Wave 3).
- **Fix:** Copied the eb-connect pattern — a `postgres`-driver writer built from `DATABASE_URL`, exposed through an injectable `IngestWriter` interface with an optional `close()`.
- **Files:** scripts/ingest.ts
- **Verification:** test/ingest.heartbeat.test.ts + test/ingest.consent.test.ts GREEN (in-memory fake); pnpm build clean.
- **Commit:** 326e621

**3. [Rule 3 - Blocker] Removed stale `@ts-expect-error` import directives + activated todo suites**
- **Found during:** Task 3
- **Issue:** Once `scripts/ingest.ts` existed, the `@ts-expect-error` on the test imports became unused (TS2578), and the suites were `describe.todo` (no real coverage of `runIngest`).
- **Fix:** Removed the stale directives and converted both suites to real assertions injecting a shared in-memory `makeFakeIngestWriter` (mirroring `test/connect.test.ts`).
- **Files:** test/ingest.heartbeat.test.ts, test/ingest.consent.test.ts, test/helpers/fake-ingest-writer.ts
- **Verification:** 3 ingest tests GREEN; `tsc --noEmit` clean.
- **Commit:** 326e621

**4. [Rule 3 - Blocker] Balances snapshot upsert keyed by check-then-write (no DB unique constraint)**
- **Found during:** Task 3
- **Issue:** The plan/RESEARCH specify `ON CONFLICT (account_id, as_of_date)` for balances, but no `UNIQUE(account_id, as_of_date)` exists in the migrations (only an index). A bare `ON CONFLICT` would fail.
- **Fix:** Idempotent balances upsert via a check-then-update/insert keyed on `(account_id, as_of_date)` — the same pattern `eb-connect` uses for `connections`. The transactions `ON CONFLICT (dedupe_hash) DO NOTHING` is unaffected (the `transactions_dedupe_hash_uq` index exists).
- **Files:** scripts/ingest.ts
- **Verification:** pnpm build + full test suite GREEN.
- **Commit:** 326e621
- **Follow-up:** a `UNIQUE(account_id, as_of_date)` migration could replace the manual upsert later (not required for correctness here).

**5. [Rule 3 - Blocker] Relaxed normalize/dedupe input types so re-armed test contracts typecheck**
- **Found during:** Task 3 (full `tsc`)
- **Issue:** The frozen test literals (`RawTxLike` closed interface; `NormalizedLike` with `valueDate`) failed against strict zod `RawTx` / an exact `HashableTx`.
- **Fix:** `normalize` accepts a structural `RawTxInput` interface (satisfied by both the test literal and the passthrough `RawTx`); `HashableTx` gained an optional ignored `valueDate`.
- **Files:** src/lib/ingestion/normalize.ts, src/lib/ingestion/dedupe.ts
- **Verification:** `tsc --noEmit` clean; tests unchanged in behaviour.
- **Commit:** 326e621

**Total deviations:** 5 auto-fixed (all Rule 3 blockers — corrected wrong literals, fixed the broken DB-client approach, re-armed/activated tests, worked around a missing DB constraint, relaxed types to honour the frozen test contracts). **Impact:** none negative — every change made the live-API-proven contract GREEN; no corrected test was reverted to its wrong value.

## Threat Mitigations Applied

- **T-01-13** (dedupe replay): versioned `dedupeHash` + `ON CONFLICT (dedupe_hash) DO NOTHING` (DB UNIQUE is the safety net).
- **T-01-14** (€4k integrity): investimento rule highest-priority on `is_investment`; credit leg onto investing never revenue.
- **T-01-12** (silent consent expiry): 403 → `consent_status='expired'`, batch `'auth_expired'`, exit 0; never a silent retry.
- **T-01-15** (cron crash on empty/failed day): heartbeat written in `finally` on every run.
- **T-01-11** (PII in logs): logs only `status`/counts; error logging records the error class name only.
- **T-01-16** (ingestion in client bundle): verified `grep` of `.next/static` finds zero ingestion symbols.

## Verification Results

| Gate | Result |
|------|--------|
| `pnpm test -- test/normalize.test.ts test/dedupe.test.ts` | 18 passed |
| `pnpm test -- test/rules.test.ts` | 9 passed |
| `pnpm test -- test/ingest.heartbeat.test.ts test/ingest.consent.test.ts` | 3 passed |
| greps (`on conflict` / `ignoreDuplicates` / `finally` in ingest.ts) | all present |
| `pnpm test` (full, all suites re-armed) | 60 passed / 11 files, 0 quarantined |
| `tsc --noEmit` | clean |
| `pnpm lint` | clean |
| `pnpm build` | clean; 0 ingestion symbols in `.next/static` |

## Known Stubs

None. The `categoryId` is intentionally `null` for all Phase-1 rules (the fixed category taxonomy is wired in a later phase); this is a designed Phase-1 boundary, not a stub blocking the plan goal.

## Self-Check: PASSED

All 6 created files exist on disk; all 3 task commits (ac35ba9, ef515eb, 326e621) present in git history.

## Next

Ready for the phase gate: run `pnpm ingest` twice over an overlapping window against the live session to confirm the 2nd run inserts 0 (high `ON CONFLICT` match), transactions land classified, a balances snapshot + an `import_batches` row exist, `last_pull_at` advances, and a forced 403 sets `consent_status='expired'` and exits 0.
