---
phase: 1
slug: ingestion-enable-banking
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-22
---

# Phase 1 — Validation Strategy

> Per-phase validation contract. Derived from `01-RESEARCH.md` § Validation Architecture.
> Most of the pipeline is pure/unit-testable (dedupe, normalize, rules, jwt) with no network;
> only the final phase-gate walkthrough needs the live Enable Banking API.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.x (already installed + `pnpm test` wired from Phase 0) |
| **Config file** | `vitest.config.ts` (exists) |
| **Quick run** | `pnpm test` (`vitest run`) |
| **Full suite** | `pnpm lint && pnpm build && pnpm test && pnpm test:rls` |
| **Estimated runtime** | unit ~1s; full suite + RLS ~1 min |

---

## Sampling Rate

- **After every task commit:** `pnpm lint` + `pnpm test` (pure unit — dedupe/normalize/rules/jwt are fast, no network)
- **After every plan wave:** full suite incl. `pnpm build` + `pnpm test:rls` (RLS on `import_batches`) + the mocked-fetch integration tests
- **Before `/gsd-verify-work`:** full suite green + the manual live walkthrough (below)
- **Max feedback latency:** ~1 s (unit); ~1 min (full)

---

## Per-Requirement Verification Map

| Requirement | Behavior to prove | Test type | Assertion | Live API? | File (Wave 0) |
|-------------|-------------------|-----------|-----------|-----------|---------------|
| ING-02 | JWT well-formed (RS256, kid, aud, exp≤24h) | unit | `signEbJwt` header `alg=RS256`/`kid=appId`; `exp−iat ≤ 86400` | no | `test/jwt.test.ts` |
| ING-03 | Double-pull adds zero rows | unit + SQL | same batch twice → 2nd inserts 0 (deterministic hash + upsert) | unit; live confirm | `test/dedupe.test.ts` |
| ING-03 | Hash stable across `value_date` flips | unit | hash identical when only `value_date` changes; differs on amount/booking_date/id | no | `test/dedupe.test.ts` |
| Pitfall 5 | sign from `credit_debit_indicator`; period from `booking_date` | unit | `normalize(DBDT)`→neg, `normalize(CRDT)`→pos; period = booking_date | no | `test/normalize.test.ts` |
| Pitfall 2 | PEND excluded | unit | normalize/filter drops `status=PEND` | no | `test/normalize.test.ts` |
| CAT-03 | transfer into an `is_investment` account → investimento, excluded from cost/revenue; credit leg never revenue | unit + SQL | `applyRules(→investing)` → investimento; SQL sums exclude it from cost/revenue, include once in investimento | no | `test/rules.test.ts` |
| D-04 | cash↔cash transfer → transferência | unit | counterparty IBAN ∈ cash accounts → transferência, excluded from P&L | no | `test/rules.test.ts` |
| D-18/D-26 | salary inflow (net) → revenue; default → cost | unit | salary signature → revenue; unmatched outflow → cost | no | `test/rules.test.ts` |
| D-25 | sublet rent received → revenue / `sublocacao`; sublet costs → cost / `sublocacao` | unit | `applyRules` tags both legs to `cost_center=sublocacao` with the right `flow_type` | no | `test/rules.test.ts` |
| CAT-07 | default `cost_center` applied per account | unit | `applyRules` stamps `accounts.default_cost_center` automatically | no | `test/rules.test.ts` |
| ING-04 | heartbeat row written every run (incl. empty/failed) | integration | zero-new-tx run AND forced-error run each leave an `import_batches` row | service_role DB | `test/ingest.heartbeat.test.ts` |
| ING-05 | 403 → `consent_status='expired'`, no crash, exit 0 | integration | mock 403 → `connections.consent_status='expired'`, exit 0, batch status `auth_expired` | mock fetch | `test/ingest.consent.test.ts` |
| ING-05 | `expires_at` stored from real `valid_until` | integration | after mocked `/sessions`, `connections.expires_at == access.valid_until` | mock fetch | `test/connect.test.ts` |
| ING-06 | "data as of" reads `last_pull_at` | unit/SQL | a successful run advances `connections.last_pull_at` | DB | covered by heartbeat test |
| ING-04 RLS | `import_batches` (+ any new table) has RLS + allowlist | SQL (CI) | `test:rls` asserts `rowsecurity=true`; non-allowlisted JWT → 0 rows | DB | extend `test/rls.assert.mjs` |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/jwt.test.ts` — RS256/kid/aud/exp (ING-02)
- [ ] `test/dedupe.test.ts` — double-pull idempotency + hash stability (ING-03)
- [ ] `test/normalize.test.ts` — sign convention, booking-vs-value-date, PEND exclusion (Pitfall 5/2)
- [ ] `test/rules.test.ts` — investimento / transferência / revenue / cost / sublocacao / default cost_center (CAT-02/03/07, D-04/18/25/26)
- [ ] `test/ingest.heartbeat.test.ts` + `test/ingest.consent.test.ts` — heartbeat-every-run + 403→expired (ING-04/05)
- [ ] `test/connect.test.ts` — `expires_at` from real `valid_until` (ING-05)
- [ ] Extend `test/rls.assert.mjs` to cover `import_batches` (+ `cost_centers` if a table) (ING-04 RLS)
- [ ] Mock fixtures: a realistic Revolut transactions page + a `/sessions` response (capture real shapes during the discovery spike)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live end-to-end ingest | ING-01..06 | Real Enable Banking SCA + live Revolut data can't run in CI | Run `pnpm eb:connect` once (real SCA at Revolut), then `pnpm ingest` twice over an overlapping window → confirm (a) transactions land classified, (b) 2nd run inserts 0, (c) a balances snapshot + an `import_batches` row exist, (d) "data as of" advances |
| Discovery spike | ING-01 | Needs the live `/sessions` response | Document which accounts/pockets are returned (is the investing account exposed?) + the real `access.valid_until` |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
