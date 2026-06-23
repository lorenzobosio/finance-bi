---
phase: 02-core-bi-house-as-business
plan: 01
subsystem: testing
tags: [intl, de-DE, formatting, period-key, comparability, vitest, tdd, wave-0]

# Dependency graph
requires:
  - phase: 01-ingestion
    provides: "classified transactions (flow_type/cost_center), dim_calendar period_key, the frozen rules engine contract (test/rules.test.ts), connection-status injected-now pure-helper pattern"
provides:
  - "src/lib/format.ts — formatEUR/formatPct de-DE single source of truth (BI-05)"
  - "src/lib/period.ts — currentPeriodKey/isProvisional/periodKeyForYoY/hasYoYHistory pure helpers (BI-04)"
  - "Four Wave-0 RED stubs (marts, rules-db, reapply, actions) anchoring every downstream Phase-2 plan to an automated check"
affects: [02-02-rules-db, 02-03-marts, 02-05-recategorize-actions, 02-06-reapply-budgets, all Phase-2 dashboard slices]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Centralized Intl: every money/percent string flows through src/lib/format.ts; no ad-hoc new Intl.NumberFormat anywhere else"
    - "Injected-now pure helpers: period.ts mirrors connection-status.ts deriveFreshness (now: Date injected) — deterministic, DB-free"
    - "Wave-0 RED stubs: pure-TS formula/filter mirror (no pg-mem); each imports its planned module path and fails at import-resolution until that module lands"

key-files:
  created:
    - "src/lib/format.ts"
    - "src/lib/period.ts"
    - "test/format.test.ts"
    - "test/period.test.ts"
    - "test/marts.test.ts"
    - "test/rules-db.test.ts"
    - "test/reapply.test.ts"
    - "test/actions.test.ts"
  modified: []

key-decisions:
  - "formatPct uses minimumFractionDigits:0 / maximumFractionDigits:1 (one-decimal MAX) so 0 renders '0 %', not '0,0 %', per the UI-SPEC examples"
  - "Mart test harness = pure-TS formula mirror, NOT pg-mem — keeps the suite DB-free, deterministic, and adds zero dependencies (T-02-SC honored)"
  - "RED stubs import the exact planned module paths (@/lib/db/marts, @/lib/ingestion/rules/db-rules, @/lib/actions/reapply-rule, @/lib/actions/recategorize, @/lib/actions/budgets) so each downstream plan re-arms its suite by simply landing the module"

patterns-established:
  - "Single-source numeric formatting (format.ts) consumed by all Phase-2 cells/axes"
  - "Injected-now pure comparability helpers (period.ts)"
  - "Wave-0 pure-TS RED stub convention for not-yet-built modules"

requirements-completed: [BI-04, BI-05]

# Metrics
duration: 5min
completed: 2026-06-23
status: complete
---

# Phase 02 Plan 01: Shared Foundation (formatters + period helpers + Wave-0 stubs) Summary

**de-DE `formatEUR`/`formatPct` as the single Intl source (BI-05), pure injected-now period/comparability helpers (`isProvisional`/`periodKeyForYoY`/`hasYoYHistory`, BI-04), and four Wave-0 RED test stubs anchoring every downstream Phase-2 plan to an automated check.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-06-23T11:59:48Z
- **Completed:** 2026-06-23T12:05:00Z
- **Tasks:** 3 (Tasks 1 & 2 TDD)
- **Files modified:** 8 created

## Accomplishments
- `src/lib/format.ts` — `formatEUR` (period thousands, comma decimal, `€` prefixed, leading minus on negatives, optional 0-decimals for hero KPIs) and `formatPct` (one-decimal-max with the German U+00A0 space before `%`); the only place `new Intl.NumberFormat` appears in `src/`.
- `src/lib/period.ts` — pure, injected-now comparability helpers: `currentPeriodKey` (YYYYMM int), `isProvisional` (current open month only), `periodKeyForYoY` (`periodKey − 100`), `hasYoYHistory` (≥12 distinct populated periods).
- Six Wave-0 test files now exist: `format.test.ts` + `period.test.ts` GREEN (15 tests); `marts.test.ts`, `rules-db.test.ts`, `reapply.test.ts`, `actions.test.ts` RED (fail at import-resolution until their Phase-2 modules land).
- Frozen `test/rules.test.ts` untouched; no new npm dependency added (pure-TS mart mirror, no pg-mem).

## Task Commits

Each task was committed atomically:

1. **Task 1: de-DE formatEUR/formatPct** - `3bce713` (feat — RED+GREEN coupled in one feat commit)
2. **Task 2 (RED): period helpers failing tests** - `401c70f` (test)
2. **Task 2 (GREEN): period helpers implementation** - `930fa16` (feat)
3. **Task 3: four Wave-0 RED stubs** - `bb4e0f4` (test)

_Note: Task 1 committed RED+GREEN together (the test and tiny formatter are tightly coupled); Task 2 followed the explicit RED→GREEN two-commit cycle._

## Files Created/Modified
- `src/lib/format.ts` - de-DE `formatEUR`/`formatPct`; single Intl source (BI-05)
- `src/lib/period.ts` - injected-now `currentPeriodKey`/`isProvisional`/`periodKeyForYoY`/`hasYoYHistory` (BI-04)
- `test/format.test.ts` - exact-string de-DE assertions incl. the U+00A0 percent space (GREEN, 5 tests)
- `test/period.test.ts` - provisional/MoM/YoY-history assertions (GREEN, 10 tests)
- `test/marts.test.ts` - RED stub: P&L formula, exclusion + sublet-net invariants, budget grains, months-of-reserve (imports `@/lib/db/marts`)
- `test/rules-db.test.ts` - RED stub: DB-rule (priority,version) ordering, builtin fallback, BUILTIN_RULE_IDS uuid map (imports `@/lib/ingestion/rules/db-rules`)
- `test/reapply.test.ts` - RED stub: idempotent re-apply core (imports `@/lib/actions/reapply-rule`)
- `test/actions.test.ts` - RED stub: zod Server-Action input validators (imports `@/lib/actions/recategorize` + `@/lib/actions/budgets`)

## Decisions Made
- **formatPct precision:** `minimumFractionDigits: 0` / `maximumFractionDigits: 1` so whole values drop the decimal (`0` → `"0 %"`), matching the UI-SPEC `0 %` example. The behavior phrase "one decimal max" was the deciding signal over a fixed one-decimal format.
- **Mart harness = pure-TS formula mirror** (not pg-mem / fixture DB): DB-free, deterministic, zero new dependencies — honors threat T-02-SC (this plan installs no packages).
- **RED stubs use synthetic round numbers only** (1000/500/etc.), fake merchants ("coffee"/"grocery"), and placeholder UUIDs — no real salary/rent/balance figures or IBANs (threat T-02-01); the source-cleanliness guard stays green.
- **Stubs import the exact planned module paths** so each downstream plan re-arms its suite the moment it lands the module (no test edit required).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- `pnpm test:rls` requires a live `DATABASE_URL` (loaded from `.env.local`), which is not present in this execution environment. This is a wave-level guard for schema changes; **this plan makes no schema change**, so RLS is unaffected. The pure-unit suite (`pnpm test`) is the relevant gate and was run after every task. `test:rls` should be run by the human/CI where the DB URL is available.

## Threat Surface Scan
No new security-relevant surface introduced — pure formatting + pure period math + DB-free test stubs. T-02-01 (synthetic fixtures) and T-02-SC (no package installs) both honored; source-cleanliness guard green.

## Self-Check: PASSED
- All 8 created files exist on disk and are committed.
- All four task commits (`3bce713`, `401c70f`, `930fa16`, `bb4e0f4`) exist in `git log`.
- `pnpm test`: 14 files / 84 tests GREEN (incl. format + period); 4 RED stubs discovered and failing at import-resolution as intended.
- `grep -rn "new Intl.NumberFormat" src` outside `format.ts` returns nothing.
- `git diff test/rules.test.ts` is empty (frozen contract untouched).
- No pg-mem in `package.json`.

## Next Phase Readiness
- **Plan 02-02 (DB rules):** `test/rules-db.test.ts` re-arms when `src/lib/ingestion/rules/db-rules.ts` + `BUILTIN_RULE_IDS` (uuid map in `builtins.ts`, seeded via migration) land.
- **Plan 02-03 (marts):** `test/marts.test.ts` re-arms when `src/lib/db/marts.ts` exports the pure formula helpers the SQL pgViews mirror.
- **Plan 02-05/06 (Server Actions + reapply/budgets):** `test/actions.test.ts` + `test/reapply.test.ts` re-arm when the zod schemas and the pure re-apply core land.
- `formatEUR`/`formatPct` and the period helpers are ready to be consumed by every dashboard slice immediately.

---
*Phase: 02-core-bi-house-as-business*
*Completed: 2026-06-23*
