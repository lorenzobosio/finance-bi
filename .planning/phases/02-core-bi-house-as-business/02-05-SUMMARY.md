---
phase: 02-core-bi-house-as-business
plan: 05
subsystem: ui
tags: [next-app-router, react-19, server-actions, supabase-ssr, rls, zod, recharts-3, tremor-raw, gastos, cost-centers, budgets, waterfall]

# Dependency graph
requires:
  - phase: 02-04
    provides: app shell + shared ?period selector + KpiCard + ProgressBar + shadcn chart base + semantic palette
  - phase: 02-03
    provides: live marts (v_category_breakdown, v_pct_of_revenue, v_costcenter_bva, v_sublet_pnl, v_pnl_monthly) under RLS/security_invoker
  - phase: 02-01
    provides: format.ts (formatEUR/formatPct), period.ts (currentPeriodKey/isProvisional/previousPeriodKey), RED actions test stub
  - phase: 01
    provides: @supabase/ssr server client (createClient, anon + user JWT), allowlist RLS on budgets, ReconnectBanner
provides:
  - "Gastos page: segmented 3-way breakdown (category/account/person) over a BarList + category-as-%-of-revenue (D2-15), Uncategorized always shown (D2-01)"
  - "Cost Centers page: 3 household budget-vs-actual rows (not-set/under/>=85%/over, never a fake cap) + Sublocação standalone P&L + household waterfall"
  - "Config page: per-cost-center budgets editor (starts empty/EUR0, Set from history, optimistic) — the FIRST write surface"
  - "budgets Server Actions (setBudget/setBudgetFromHistory): zod-validated, @supabase/ssr under allowlist RLS, check-then-write upsert — never service_role"
  - "PnlWaterfall: bespoke Recharts-3 transparent-offset stacked Bar (only Result colored) with a data-table a11y alternative"
  - "BarList + CategoryBar Tremor Raw blocks (neutral ramp, value-as-text a11y)"
  - "Frozen write-plane input contracts: BudgetInputSchema + RecategorizeInputSchema in *.schema.ts modules"
affects: [transacoes, goal-page, pwa, ai-insights]

# Tech tracking
tech-stack:
  added: ["Tremor Raw BarList + CategoryBar blocks", "Recharts-3 bespoke P&L waterfall (PnlWaterfall)", "Next 15 Server Actions (first write plane)"]
  patterns:
    - "Server Action write plane: FILE-level 'use server' module exports ONLY async actions; zod schema/types split into a sibling *.schema.ts module (imported by the action, the client editor, and the unit test)"
    - "check-then-write upsert (mirrors ingest.ts upsertBalance) for budgets keyed by (cost_center, category_id, period_key) — no DB unique constraint needed across the nullable category_id"
    - "URL-param-driven server-read toggles (?breakdown=) — no client JS, shareable, works on Fernanda's mobile"
    - "Recharts-3 paste rules: var(--chart-1) not hsl(); ChartContainer min-h; only the Result bar colored; SVG aria-hidden + a data-table a11y twin"

key-files:
  created:
    - "src/components/charts/bar-list.tsx"
    - "src/components/charts/category-bar.tsx"
    - "src/components/charts/pnl-waterfall.tsx"
    - "src/components/budget-editor.tsx"
    - "src/app/(protected)/gastos/page.tsx"
    - "src/app/(protected)/cost-centers/page.tsx"
    - "src/app/(protected)/config/page.tsx"
    - "src/lib/actions/budgets.ts"
    - "src/lib/actions/budgets.schema.ts"
    - "src/lib/actions/recategorize.ts"
    - "src/lib/actions/recategorize.schema.ts"
  modified:
    - "test/actions.test.ts"
    - ".planning/phases/02-core-bi-house-as-business/deferred-items.md"

key-decisions:
  - "Split zod schemas into *.schema.ts modules: a Next 15 FILE-level 'use server' module may export ONLY async functions, and a client component cannot import an inline-'use server' action — so the file-level directive + a sibling schema module is the only shape that satisfies both the client editor import and the test schema import"
  - "budgets upsert uses check-then-write (not supabase .upsert/onConflict) because there is no DB unique constraint spanning the nullable category_id — avoids a live-DB migration checkpoint mid-execution while still guaranteeing re-save-updates-not-duplicates"
  - "Created a minimal recategorize.ts contract (schema + wired action, body deferred to 02-06) so test/actions.test.ts resolves and goes GREEN this plan — Rule 3 blocking fix for the shared RED stub"
  - "Breakdown grain toggle uses a server-read ?breakdown= URL param (plain links), not client state — shareable and JS-free"

patterns-established:
  - "Pattern: write-plane action module ('use server' file) + sibling *.schema.ts validator module; the client surface imports actions, the test imports schemas"
  - "Pattern: bespoke Recharts-3 waterfall = transparent base series + visible delta series, per-Cell coloring with only the total colored, paired with a data-table a11y twin"

requirements-completed: [BI-03, BI-02, BI-01, BI-06, BI-04, CAT-06]

# Metrics
duration: 16min
completed: 2026-06-23
status: complete
---

# Phase 2 Plan 05: Gastos + Cost Centers + Budgets Write Plane Summary

**The spending + cost-center + budgets vertical slices: Gastos (3-way breakdown + %-of-revenue with a graceful Uncategorized bucket), Cost Centers (budget-vs-actual with correct not-set/over states + the Sublocação standalone P&L + the household waterfall), and the Config budgets editor backed by the FIRST Server-Action write plane — zod-validated, written through @supabase/ssr under the existing allowlist RLS, never service_role.**

## Performance
- **Duration:** ~16 min
- **Tasks:** 3 (one TDD)
- **Files:** 13 (11 created, 2 modified)

## Accomplishments
- Built **Gastos** (BI-03): a segmented 3-way toggle (category / account / person) over a Tremor Raw **BarList** (biggest-first, single neutral hue ramp, value-as-text a11y), with the **Uncategorized** bucket ALWAYS rendered as its own grey bar + a "to categorize →" link (D2-01 graceful degrade), plus the first-class **category-as-%-of-revenue** view (D2-15) via `formatPct`. Reads `v_category_breakdown` / `v_pct_of_revenue` under RLS.
- Built **Cost Centers** (BI-02/BI-01): the 3 household **budget-vs-actual** rows (Lorenzo / Fernanda / Shared) with the correct not-set / under / ≥85% / over states — "**Budget not set**" is a distinct grey state, never a synthesized €0 cap (D2-12); over-budget overflows + names the amount + a `TriangleAlert`. The **Sublocação profit-center** standalone P&L (Rent received − paid = Net) is the ONLY place the sublet gross legs appear (D2-06/07/08); the household sees sublet only as the single net waterfall step.
- Built the bespoke **P&L waterfall** (PnlWaterfall): a Recharts-3 transparent-offset stacked Bar — Revenue → +Sublet net → −Investimento → −Costs → =Result — with only the Result bar colored (`--gain`/`--loss` via `<Cell>`), intermediate steps neutral `--chart-1`, the SVG `aria-hidden`, and a real **data-table a11y twin**. The investimento/transferência "excluded from costs" tag carries CAT-06.
- Built the **Config budgets editor** + the **FIRST write plane**: `setBudget` / `setBudgetFromHistory` Server Actions, **zod-validated**, written through `@supabase/ssr` (anon + user JWT → the existing allowlist RLS authorizes — never `service_role`/`DATABASE_URL`/Drizzle). The editor starts **empty/€0** (D2-12, no committed amounts), wires inputs via `useOptimistic` + `revalidatePath`, and offers **"Set from history"** (D2-13) reading the mart. `setBudget` upserts by `(cost_center, category_id, period_key)` via check-then-write — a re-save updates rather than duplicates.
- TDD: expanded `test/actions.test.ts` to the full validator contract (rejects negative/NaN amount, missing periodKey, empty costCenter, non-uuid categoryId; accepts both cost-center- and category-grain payloads) — RED → GREEN (11 tests).

## Task Commits
1. **Task 1: Gastos breakdown + %-of-revenue** — `1a5296b` (feat)
2. **Task 2: Cost Centers budget-vs-actual + Sublocação P&L + waterfall** — `43307ea` (feat)
3. **Task 3 (TDD): budgets validator assertions (RED)** — `0f67339` (test); **budgets write plane + Config editor (GREEN)** — `d62ae18` (feat)

## Files Created/Modified
- `src/components/charts/bar-list.tsx` (created) — Tremor Raw BarList: horizontal bars, biggest-first, neutral ramp, Uncategorized grey + action link, value as visible mono text (a11y).
- `src/components/charts/category-bar.tsx` (created) — Tremor Raw CategoryBar: `role=progressbar` budget/%-of-revenue bar, tone = neutral/gain/warning/loss.
- `src/components/charts/pnl-waterfall.tsx` (created) — bespoke Recharts-3 transparent-offset waterfall + data-table a11y twin; only Result colored.
- `src/components/budget-editor.tsx` (created) — client editor: per-cost-center € input (starts empty), Save budget / Set from history, `useOptimistic` + the Server Actions.
- `src/app/(protected)/gastos/page.tsx` (created) — RSC: ?period + ?breakdown reads, BarList + %-of-revenue, Uncategorized always present.
- `src/app/(protected)/cost-centers/page.tsx` (created) — RSC: budget rows + Sublocação P&L + waterfall under RLS.
- `src/app/(protected)/config/page.tsx` (created) — RSC: reads existing budgets, builds editor rows (not-set vs set), points to the shell reconnect banner.
- `src/lib/actions/budgets.ts` (created) — `'use server'` actions: `setBudget` (check-then-write upsert) + `setBudgetFromHistory` (mart read), `@supabase/ssr`, `revalidatePath`.
- `src/lib/actions/budgets.schema.ts` (created) — `BudgetInputSchema` + `BudgetInput`/`SetBudgetInput` types (zod V5 boundary).
- `src/lib/actions/recategorize.ts` (created) — frozen `'use server'` contract; full body deferred to 02-06.
- `src/lib/actions/recategorize.schema.ts` (created) — `RecategorizeInputSchema` + type.
- `test/actions.test.ts` (modified) — finished the budgets validator assertions; imports schemas from the `*.schema.ts` modules.
- `deferred-items.md` (modified) — logged the remaining out-of-scope `reapply.test.ts` RED stub (→ 02-06).

## Decisions Made
- **Schema/action module split.** A Next 15 FILE-level `'use server'` module may export only async functions, and a Client Component cannot import an inline-`'use server'` action. The only shape that satisfies BOTH the client `BudgetEditor` (imports the actions) AND the unit test (imports the schemas) is: a file-level `'use server'` action module + a sibling plain `*.schema.ts` validator module. This was discovered during Task 3's build (see Deviations).
- **check-then-write upsert (not `.upsert`/`onConflict`).** There is no DB unique constraint spanning `budgets(cost_center, category_id, period_key)` — and `category_id` is nullable, which `onConflict` handles poorly. Rather than add a partial-unique-index migration requiring a live-DB checkpoint mid-execution, the action selects-then-updates-or-inserts (the repo's existing `upsertBalance` idempotency idiom). Guarantees the "re-save updates, not duplicates" acceptance criterion.
- **Minimal `recategorize.ts` this plan.** The shared `test/actions.test.ts` imports both `budgets` and `recategorize` schemas; to make the suite GREEN now, the recategorize contract (schema + wired-but-deferred action) had to land. The full mutation body remains a 02-06 deliverable.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Split zod schemas out of the 'use server' action modules**
- **Found during:** Task 3 (build of the Config page importing the budgets actions)
- **Issue:** The plan specified `budgets.ts` exports both `SetBudgetInput` and the actions. A Next 15 FILE-level `"use server"` module may export ONLY async functions (`A "use server" file can only export async functions, found object`). Moving to a function-level `"use server"` then broke the Client Component import (`not allowed to define inline "use server" annotated Server Actions in Client Components`).
- **Fix:** File-level `"use server"` action modules (`budgets.ts`, `recategorize.ts`) export only async actions; the zod schemas + types moved to sibling `budgets.schema.ts` / `recategorize.schema.ts`. The client editor imports the actions; the test imports the schemas. `BudgetInputSchema` (the name the test asserts) is preserved; `SetBudgetInput` is re-exported as a type alias.
- **Files modified:** src/lib/actions/budgets.ts, src/lib/actions/budgets.schema.ts, src/lib/actions/recategorize.ts, src/lib/actions/recategorize.schema.ts, test/actions.test.ts
- **Verification:** `pnpm build` + `pnpm lint` green; `pnpm test -- actions marts` GREEN (21).
- **Committed in:** d62ae18

**2. [Rule 3 - Blocking] Created recategorize.ts/.schema.ts to resolve the shared actions-test import**
- **Found during:** Task 3 (RED run of `test/actions.test.ts`)
- **Issue:** `test/actions.test.ts` imports BOTH the budgets AND the recategorize schema. `recategorize.ts` is otherwise a 02-06 deliverable, so the suite could not go GREEN this plan without its contract existing.
- **Fix:** Created the frozen recategorize input contract (schema + a wired `'use server'` action whose mutation body is explicitly deferred to 02-06). No behavior beyond the validated contract was added.
- **Files modified:** src/lib/actions/recategorize.ts, src/lib/actions/recategorize.schema.ts
- **Verification:** `pnpm test -- actions` GREEN (11).
- **Committed in:** d62ae18

---
**Total deviations:** 2 auto-fixed (both Rule 3 blocking). No scope creep — both were required to satisfy the plan's own "`pnpm test -- actions` GREEN" acceptance criterion under Next 15's Server-Action export rules.

## Threat Surface
All STRIDE register items held: zod field allow-list + parsed-fields-only writes (T-02-14 mass-assignment guard); allowlist RLS as the authz wall via anon+JWT, no `service_role` (T-02-15); only `@supabase/ssr` under `src/app`/`src/lib/actions`, no Drizzle/`DATABASE_URL` (T-02-16, grep-verified — matches are comments only); `.eq(...)` parameterized filters (T-02-17); no € amounts/PII committed, budgets start €0, source-cleanliness GREEN (T-02-18); zero new npm installs — chart blocks are owned copy-paste source (T-02-SC). No new threat surface beyond the register.

## Known Stubs
- **`src/lib/actions/recategorize.ts` mutation body** — INTENTIONAL, deferred to Plan 02-06 (the Transações slice, per 02-PATTERNS.md). The `'use server'` contract + `RecategorizeInputSchema` are wired and validated now (so the actions test is GREEN and the write-plane shape is frozen); the one-row update + optional forward-rule insert lands in 02-06. Not a data stub on any 02-05 surface — Gastos/Cost Centers/Config all render live mart/budget data.

## Deferred Issues
- **`test/reapply.test.ts` still RED (→ 02-06).** Imports `@/lib/actions/reapply-rule`, the idempotent bulk re-apply core that is a Plan 02-06 deliverable. This was the third pre-existing Wave-0 RED stub; 02-05 resolved the budgets + recategorize imports (so `actions.test.ts` is GREEN), leaving only `reapply.test.ts`. The plan's gate (`pnpm test -- actions marts`) is GREEN; full-suite shows 115 passed / 1 failed (this stub). Logged in `deferred-items.md`.

## User Setup Required
None — reads use the existing @supabase/ssr session + live marts; budget writes use the same session under the existing allowlist RLS (no new policy, no external config).

## Next Phase Readiness
- The write-plane shape (`'use server'` action module + sibling `*.schema.ts`) is the template the **Transações** slice (02-06) reuses for `recategorize` (finish the body), `create-rule`, and `reapply-rule`.
- BarList / CategoryBar / PnlWaterfall are reusable for any later breakdown/budget/waterfall surface (Goal page, AI insights).
- The Config budgets editor is the wiring the category-grain budgets (D2-14) extend into.

## Self-Check: PASSED
- All 11 created files + the 2 modified files exist on disk.
- All 4 commits (`1a5296b`, `43307ea`, `0f67339`, `d62ae18`) exist in git history.
- `pnpm build` + `pnpm lint` green; `pnpm test -- actions marts` GREEN (21); the only full-suite failure is the pre-existing out-of-scope `reapply.test.ts` (→ 02-06).
- Security greps clean (no service_role/DATABASE_URL/Drizzle in src/app or src/lib/actions — comment matches only); no committed € amounts; no `hsl(var(--chart-`.

---
*Phase: 02-core-bi-house-as-business*
*Completed: 2026-06-23*
