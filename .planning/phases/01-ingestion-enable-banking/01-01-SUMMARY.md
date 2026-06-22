---
phase: 01-ingestion-enable-banking
plan: 01
status: complete
requirements: [ING-01]
completed: 2026-06-22
---

# Plan 01-01 Summary — Wave-0 TDD safety net + Enable Banking discovery spike

## What was built

- **Wave-0 TDD harness (RED)** — 7 test files written test-first against not-yet-existent modules: `test/jwt.test.ts`, `test/dedupe.test.ts`, `test/normalize.test.ts`, `test/rules.test.ts` (pure-module specs for ING-02/03 + normalize/rules), plus the integration stubs `test/connect.test.ts`, `test/ingest.heartbeat.test.ts`, `test/ingest.consent.test.ts` (ING-04/05 contracts).
- **`pnpm eb:connect` (spike form)** — `scripts/eb-connect.ts`: RS256 JWT (kid = App ID, 1h TTL) → `GET /aspsps` → `POST /auth` → paste-code → `POST /sessions`, enumerating accounts + `access.valid_until`, saving a gitignored `.secrets/` session and writing PII-scrubbed fixtures.
- **Deployed `/eb/callback`** page + middleware `PUBLIC_PATHS` (D-07) so the SCA redirect lands.
- **`01-SPIKE.md`** — documented findings from BOTH live consents (Lorenzo + Fernanda).
- **PII-scrubbed fixtures** — `test/fixtures/eb-sessions.json` + `eb-transactions-page.json` captured from real Revolut responses.

## Requirements

- **ING-01** ✓ — discovery spike run live for both Revolut logins; all five research-flagged unknowns resolved (below).

## Spike findings (live, both consents — 2026-06-22)

- **A2 — investing account NOT exposed over PSD2** (confirmed both logins). `investimento` is detected on the OUTGOING leg via a virtual `is_investment=true` account (D-22); Phase-6 market value tracked virtually.
- **A5 — consent window = 180 days** (`maximum_consent_validity=15552000s`; `valid_until` ≈ 2026-12-19). Drives `connections.expires_at` — read from the API, never hardcoded.
- **A6 — counterparty IBANs ARE returned** → `transferencia`/`investimento` rules can match on creditor/debtor IBAN (more robust than name/description).
- **A3 — only `entry_reference` present (no `transaction_id`)** → `dedupe_hash` keys on `entry_reference` + composite fallback.
- **A4 — no PEND rows** in window → the normalize "exclude PEND" filter stands.
- **Accounts:** 3 real cash accounts across 2 consents (Lorenzo personal + Joint via Lorenzo's login; Fernanda personal via Fernanda's login). No joint duplication.

## ⚠️ Deviations / carry-forward for downstream waves

- **Wave-0 tests are QUARANTINED, not RED-in-CI.** To keep the public-repo `main` CI green, the 6 not-yet-implemented suites are listed in `vitest.config.ts` `exclude` (jwt, normalize, dedupe, rules, ingest.consent, ingest.heartbeat). **Each downstream plan that builds a module MUST delete that test's line from the exclude to re-arm it:** 01-03 → `test/jwt.test.ts`; 01-04 → normalize/dedupe/rules; 01-05 → ingest.*. The plan text "make the Wave-0 tests GREEN" now also requires un-quarantining them.
- **PII scrubber hardened** — `scrubSession` was leaking `all_account_ids[].identification` (a real IBAN) + identifier hashes through zod `.passthrough()`; fixed to redact them. Full tree+history PII sweep = 0 hits (one accepted low-risk residual: the EB App ID UUID in 2 early commits, inert without the private key — see memory).
- **Redirect URL** is the deployed `https://finance-bi-chi.vercel.app/eb/callback`, not `http://localhost` (Enable Banking rejected the localhost scheme) — supersedes the plan's localhost note (T-01-05).

## Verification

- `pnpm eb:connect` completed real Revolut SCA twice (both logins), printed accounts + `valid_until`, wrote fixtures + `01-SPIKE.md`.
- `pnpm test` green (3 files / 21 tests; the 6 quarantined suites excluded pending their modules).
- Commits: `af8920b` (scaffold), `20507b9` (null-field fix), `3e6defa`/`d2fc9e6` (spike finalize + PII scrub, PR #12).

## Deferred / notes

- The investing-account virtual-holdings market-value design is a Phase-6 concern (D-28).
- `scripts/eb-connect.ts` is the SPIKE form; 01-03 builds the production signer/client/connect that persists the consent into `connections`.
