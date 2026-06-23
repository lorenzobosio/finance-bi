# Phase 02 — Deferred Items

Out-of-scope discoveries logged during execution (not fixed in the current plan).

## Plan 02-04 (App shell + Home KPIs)

- **Pre-existing RED test stubs for Server Actions (out of scope).** `test/actions.test.ts`
  and `test/reapply.test.ts` import `@/lib/actions/recategorize`, `@/lib/actions/budgets`,
  and `@/lib/actions/reapply-rule`, which do not exist yet (`src/lib/actions/` is absent).
  These were committed as intentional TDD RED stubs in plan 02-01
  (`bb4e0f4 test(02-01): add four Wave-0 RED stubs`). The Server Actions land in the
  Transações / Config plans (02-05 / 02-06 per 02-PATTERNS.md). NOT touched by 02-04 —
  the failing suites pre-date this plan and are unrelated to the Home/shell slice.

## Plan 02-05 (Gastos + Cost Centers + budgets write plane)

- **`test/reapply.test.ts` still RED (out of scope, → 02-06).** It imports
  `@/lib/actions/reapply-rule`, the idempotent bulk re-apply core that is a Plan 02-06
  (Transações) deliverable per 02-PATTERNS.md (`reapply-rule.ts`). Plan 02-05 resolved the
  OTHER two action imports (`budgets` via `budgets.schema.ts`, `recategorize` via
  `recategorize.schema.ts`), so `test/actions.test.ts` is now GREEN. `reapply.test.ts` is
  the single remaining pre-existing RED stub; it lands in 02-06. The plan's own gate
  (`pnpm test -- actions marts`) is GREEN.
