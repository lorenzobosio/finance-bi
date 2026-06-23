---
phase: 2
slug: core-bi-house-as-business
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-23
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Derived from `02-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest `4.1.9` (node environment) |
| **Config file** | `vitest.config.ts` (alias `@`→`./src`; includes `test/**/*.test.ts(x)`) |
| **Quick run command** | `pnpm test` (`vitest run`) — pure unit suites |
| **Full suite command** | `pnpm test && pnpm test:rls` (`rls.assert.mjs` is the RLS allowlist guard) |
| **Estimated runtime** | ~10–15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test` (`test/rules.test.ts` — the frozen engine contract — must stay green every commit).
- **After every plan wave:** Run `pnpm test && pnpm test:rls` (full suite + RLS guard).
- **Before `/gsd-verify-work`:** Full suite green + manual UAT for page rendering and the live recategorize → forward-rule → re-apply flow.
- **Max feedback latency:** ~15 seconds.

---

## Per-Task Verification Map

> Requirement-grain rows (task IDs are assigned when PLAN.md files are written; the planner / gsd-nyquist-auditor refines `Task ID`/`Plan`/`Wave` per task). `❌ W0` = the test file is a Wave-0 stub gap below.

| Requirement | Behavior | Test Type | Automated Command | File | Status |
|-------------|----------|-----------|-------------------|------|--------|
| CAT-04 | DB `rules` consulted in priority order; builtin fallback unchanged | unit | `pnpm test -- rules-db` | `test/rules-db.test.ts` ❌ W0 | ⬜ pending |
| CAT-04 | existing engine contract still green (no regression) | unit | `pnpm test -- rules` | `test/rules.test.ts` ✅ | ⬜ pending |
| CAT-04/D2-04 | a classified row's `rule_id` resolves to a real builtin uuid | unit | `pnpm test -- rules-db` | `test/rules-db.test.ts` ❌ W0 | ⬜ pending |
| CAT-05 | "re-apply to past" is idempotent + returns an affected count | unit | `pnpm test -- reapply` | `test/reapply.test.ts` ❌ W0 | ⬜ pending |
| CAT-06 | investimento/transferência excluded from cost + revenue SUMs | unit | `pnpm test -- marts` | `test/marts.test.ts` ❌ W0 | ⬜ pending |
| BI-01 | result = revenue − investimento − costs + sublet_net; margin = result ÷ revenue | unit | `pnpm test -- marts` | `test/marts.test.ts` ❌ W0 | ⬜ pending |
| BI-01/D2-07 | household SUMs exclude sublet gross; sublet_net counted exactly once | unit | `pnpm test -- marts` | `test/marts.test.ts` ❌ W0 | ⬜ pending |
| BI-02/D2-14 | budget-vs-actual at cost-center AND category grain | unit | `pnpm test -- marts` | `test/marts.test.ts` ❌ W0 | ⬜ pending |
| BI-04 | empty month → €0 row; provisional flag on current period; YoY history gate | unit | `pnpm test -- period` | `test/period.test.ts` ❌ W0 | ⬜ pending |
| BI-07 | months-of-reserve = cash ÷ trailing-3-month avg costs | unit | `pnpm test -- marts` | `test/marts.test.ts` ❌ W0 | ⬜ pending |
| BI-05/06 | KPI/format helpers (`formatEUR`/`formatPct`, de-DE) | unit | `pnpm test -- format` | `test/format.test.ts` ❌ W0 | ⬜ pending |
| CAT-04/BI-06 | Server-Action input validation (zod) rejects bad payloads | unit | `pnpm test -- actions` | `test/actions.test.ts` ❌ W0 | ⬜ pending |

---

## Wave 0 Requirements

- [ ] `test/rules-db.test.ts` — DB-rule ordering, builtin fallback, `rule_id` resolution (CAT-04 / D2-04)
- [ ] `test/marts.test.ts` — P&L formula, sublet net, exclusions, budget grains, months-of-reserve (BI-01/02/06/07, CAT-06)
- [ ] `test/period.test.ts` — zero-fill / provisional / MoM / YoY-history pure helpers (BI-04)
- [ ] `test/format.test.ts` — `formatEUR` / `formatPct` de-DE (BI-05)
- [ ] `test/reapply.test.ts` + `test/actions.test.ts` — idempotent re-apply core + zod validators (CAT-05)
- [ ] **Wave-0 architecture call:** mart test harness — pure-TS formula/filter mirror that the SQL views replicate, vs `pg-mem`/fixture DB in `marts.test.ts`.
- [ ] **Re-arm note:** confirm which of the 6 quarantined Phase-1 vitest suites re-arm as Phase-2 modules land (memory: `ci-security-automation`).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Page rendering of the 5 dashboards (Home KPIs, Gastos, Cost Centers + Sublocação, Transações, Config) | BI-05/06, UI-SPEC | Visual/layout + responsive (desktop sidebar / mobile bottom-nav) not unit-testable | Load each page logged-in; verify KPI order, freshness banner, provisional/empty states render |
| Live recategorize → "create rule for future" → "re-apply to past" | CAT-04/05 | End-to-end across UI + Server Action + RLS + DB | Recategorize a row; confirm a forward rule is written and past rows are unchanged until explicit re-apply; re-apply shows the affected count |
| RLS allowlist write path (both users can write; non-allowlisted cannot) | CAT-04/BI-06 | Auth + RLS behavior needs a real session | `pnpm test:rls` covers the guard; spot-check a budget edit persists under the user JWT |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
