---
phase: 02-core-bi-house-as-business
plan: 03
subsystem: database
tags: [drizzle, postgres, sql-marts, pgview, rls, security-invoker, migrations, typescript]

# Dependency graph
requires:
  - phase: 02-01
    provides: "Wave-0 RED stub test/marts.test.ts (the mart formula-mirror contract) + the pure-TS-mirror harness decision (no pg-mem)"
  - phase: 02-02
    provides: "budgets.category_id nullable FK (category-grain budgeted-vs-actual), builtin-uuid rules seed, shared cost-center alias — applied LIVE"
provides:
  - "drizzle/0007_marts.sql — 7 calendar-joined SQL views: v_pnl_monthly, v_sublet_pnl, v_costcenter_bva, v_category_breakdown, v_pct_of_revenue, v_balance_trend, v_home_kpis (all security_invoker = on)"
  - "drizzle/0008_marts_rls.sql — per-object RLS control (security_invoker re-assert on all 7 views) + balances UNIQUE(account_id, as_of_date)"
  - "src/lib/db/marts.ts — pure formula mirror (computePnl/householdResult/householdMargin/sumRevenue/sumCosts/sumInvestimento/subletNet/budgetVsActual/categoryBreakdown/pctOfRevenue/monthsOfReserve/computeMonthsOfReserve/netWorth) + typed pgView(...).existing() handles"
  - "schema.ts balances uniqueIndex('balances_account_date_uq').on(accountId, asOfDate)"
affects: [02-04-marts-pages, 02-05-recategorize, 02-06-budgets, "every Phase-2 dashboard read", "BI-07 net-worth/months-of-reserve"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Calendar-spine zero-filled SQL marts (dense dim_calendar period_key LEFT JOIN → empty month = €0 row)"
    - "Sublet netted EXACTLY ONCE: household SUMs exclude sublocacao gross legs (is distinct from 'sublocacao'); v_sublet_pnl is the sole gross-leg surface; result re-injects one signed sublet_net"
    - "Exclusion discipline in SQL: every household revenue/cost FILTER pins flow_type explicitly so investimento/transferencia never enter the buckets (CAT-06)"
    - "Pure-TS formula mirror = the SQL views' single source of truth, unit-tested DB-free (no pg-mem dependency)"
    - "Postgres-15 view RLS via security_invoker = on (views carry no policy; they inherit the underlying tables' allowlist RLS under the caller JWT)"
    - "Hand-written numbered view migration + journal + snapshot so drizzle-kit migrate applies it and db:generate stays clean"

key-files:
  created:
    - "drizzle/0007_marts.sql"
    - "drizzle/0008_marts_rls.sql"
    - "src/lib/db/marts.ts"
    - "drizzle/meta/0007_snapshot.json"
    - "drizzle/meta/0008_snapshot.json"
  modified:
    - "src/lib/db/schema.ts"
    - "scripts/ingest.ts"
    - "drizzle/meta/_journal.json"

key-decisions:
  - "View RLS = security_invoker = on (not a per-view policy): a Postgres view cannot carry its own RLS policy; with security_invoker the RSC select runs under the caller JWT so the existing allowlist_all policies on the underlying tables (0001) gate every mart — re-asserted explicitly in 0008 for verifiability"
  - "v_pnl_monthly household SUMs use `cost_center is distinct from 'sublocacao'` (NULL-safe) so a NULL cost_center is still counted in the household, only the explicit sublocacao legs are excluded"
  - "v_balance_trend carries the last-known balance forward per account per day (row_number over as_of_date <= spine day) so a day with no new snapshot still has a net worth, and restricts the spine to <= current_date so the trend is finite"
  - "months-of-reserve division kept in TS (computeMonthsOfReserve) not SQL — it spans v_balance_trend (cash) and v_pnl_monthly.costs; the marts expose the inputs, TS does the cross-mart ratio with a divide-by-zero guard"
  - "Honored the frozen test/marts.test.ts API verbatim (householdResult/householdMargin/sumCosts/sumRevenue/subletNet/budgetVsActual/monthsOfReserve/MartTx) as canonical; added computePnl/computeMonthsOfReserve aliases for the plan-frontmatter export contract + downstream plans"

patterns-established:
  - "Marts are hand-written .sql views exposed to RSC via pgView(name).existing() typed handles (RESEARCH Q4 resolution)"
  - "Every new view/table ships with an RLS control (security_invoker for views, allowlist policy for tables) — T-00-04, no exceptions"

requirements-completed: [BI-01, BI-02, BI-03, BI-04, BI-07, CAT-06]

# Metrics
duration: 7min
completed: 2026-06-23
status: complete
---

# Phase 02 Plan 03: Calendar-Joined SQL Marts + per-object RLS + balances UNIQUE Summary

**Built the 7 calendar-joined SQL marts that power every Phase-2 dashboard — the locked household P&L (`result = revenue − investimento − costs + sublet_net`, `margin = result / nullif(revenue,0)`), the Sublocação profit-center netted exactly once, budget-vs-actual at two grains, the Uncategorized-safe breakdowns, %-of-revenue, and the net-worth / months-of-reserve trend — each driven off the dense `dim_calendar` spine (empty month = €0), each `security_invoker = on`, with a pure-TS formula mirror that unit-tests the math DB-free (10/10 green); the LIVE migration push remains a BLOCKING human checkpoint (no DATABASE_URL).**

## Performance
- **Duration:** 7 min
- **Started:** 2026-06-23T12:35:59Z
- **Completed (autonomous tasks):** 2026-06-23T12:43:44Z
- **Tasks:** 2 of 3 (Task 3 = BLOCKING human-action checkpoint — NOT executed; the executor has no DATABASE_URL and must not touch the live DB)
- **Files:** 8 (5 created, 3 modified)

## Accomplishments
- **`drizzle/0007_marts.sql` — 7 hand-written views**, all on the dense `dim_calendar` period_key spine (BI-04 zero-fill), all `with (security_invoker = on)`:
  - `v_pnl_monthly` — the locked household P&L; revenue/costs exclude the sublocacao gross legs (`is distinct from 'sublocacao'`) and never include investimento/transferencia (CAT-06); `result = revenue − investimento − costs + sublet_net`; `margin = result / nullif(revenue,0)`.
  - `v_sublet_pnl` — the standalone Sublocação profit-center P&L; the ONLY place the sublet gross legs appear; signed `sublet_net` (D2-06/07/08).
  - `v_costcenter_bva` — budget-vs-actual at BOTH grains (`category_id IS NULL` = cost-center grain, set = category grain), driven off the `budgets` rows so absent budgets produce NO synthetic €0 cap (D2-12).
  - `v_category_breakdown` — cost breakdown at category / account / person grain, `coalesce(name,'Uncategorized')` so rows are never dropped (BI-03/D2-01).
  - `v_pct_of_revenue` — each category cost / `nullif(revenue,0)` (BI-03/D2-15).
  - `v_balance_trend` — net worth per day (latest balance per account carried forward) across the spine (BI-07).
  - `v_home_kpis` — the 4 headline KPIs per period (P&L + net worth) for the Home page (BI-05).
- **`src/lib/db/marts.ts`** — the pure formula mirror the SQL replicates exactly (`computePnl`, `householdResult`, `householdMargin`, `sumRevenue`, `sumCosts`, `sumInvestimento`, `subletNet`, `budgetVsActual`, `categoryBreakdown`, `pctOfRevenue`, `monthsOfReserve`/`computeMonthsOfReserve`, `netWorth`) PLUS typed `pgView(...).existing()` handles for all 7 views.
- **`drizzle/0008_marts_rls.sql`** — re-asserts `security_invoker = on` on each of the 7 views (the per-object RLS control) and adds the `balances` UNIQUE(account_id, as_of_date) index (closes the Pattern-10 duplicate-snapshot landmine).
- **`schema.ts`** — `balances` now declares `uniqueIndex('balances_account_date_uq').on(accountId, asOfDate)`; `db:generate` reports clean ("No schema changes") so the snapshot matches.
- **`scripts/ingest.ts`** — `upsertBalance` comment calibrated to note the new UNIQUE constraint now backs its check-then-write (no idempotency-logic change, per the plan).
- Registered both migrations in `drizzle/meta/_journal.json` (idx 7/8) + `0007_snapshot.json` (= 0006 schema; views aren't tracked in snapshots) + `0008_snapshot.json` (0006 + the balances unique index) so `drizzle-kit migrate` applies them in order.

## Task Commits
1. **Task 1: P&L / sublet-net / budget-vs-actual / breakdown / %-of-revenue marts (pure mirror + SQL)** — `bbc21fb` (feat)
2. **Task 2: balance / net-worth / months-of-reserve mart + balances UNIQUE + per-object RLS** — `64face0` (feat)

**Plan metadata:** see final docs commit.

_TDD: the Wave-0 RED stub `test/marts.test.ts` failed at import-resolution before this plan; Task 1 GREENed it by landing `marts.ts` (the pure mirror the SQL replicates). The frozen `test/rules.test.ts` + all 15 previously-green suites stayed green throughout (16 files / 102 tests green; the only 2 RED files are the out-of-scope Plan-05/06 stubs `reapply`/`actions`)._

## Files Created/Modified
- `drizzle/0007_marts.sql` (created) — 7 calendar-joined views; locked formula; exclusions; sublet-net-once; security_invoker.
- `drizzle/0008_marts_rls.sql` (created) — per-view security_invoker re-assert + balances UNIQUE index.
- `src/lib/db/marts.ts` (created) — pure formula mirror + typed pgView().existing() handles.
- `src/lib/db/schema.ts` (modified) — balances uniqueIndex on (accountId, asOfDate).
- `scripts/ingest.ts` (modified) — upsertBalance comment notes the new UNIQUE backs check-then-write (no logic change).
- `drizzle/meta/_journal.json` (modified) + `0007_snapshot.json` + `0008_snapshot.json` (created) — registered both migrations; db:generate clean.

## Decisions Made
- **View RLS via `security_invoker = on`, not a per-view policy:** Postgres views can't carry their own RLS policy; with security_invoker the RSC `select` runs under the caller's JWT so the existing `allowlist_all` policies on the underlying tables (transactions/budgets/categories/accounts/cost_centers/balances/dim_calendar, 0001) gate every mart. 0008 re-asserts it per view so the control is explicit + greppable (a control for each of the 7 views).
- **NULL-safe sublocacao exclusion (`is distinct from`):** household SUMs use `cost_center is distinct from 'sublocacao'` so a NULL cost_center is still counted in the household total — only the explicit sublocacao legs are excluded (a plain `<> 'sublocacao'` would have silently dropped NULL-cost-center rows).
- **months-of-reserve division in TS, not SQL:** it spans two marts (cash from v_balance_trend, costs from v_pnl_monthly); the marts expose the inputs and `computeMonthsOfReserve` does the guarded ratio (returns null on empty history / zero burn-rate — no NaN).
- **Frozen-test API is canonical:** implemented `test/marts.test.ts`'s exact names (`householdResult`/`subletNet`/`budgetVsActual`/`monthsOfReserve`/`MartTx`) and ALSO exported the plan-frontmatter aliases (`computePnl`/`computeMonthsOfReserve`) for downstream plans.

## Deviations from Plan
None — plan executed as written. The autonomous portion (Tasks 1 + 2) is complete; Task 3 is a BLOCKING human-action checkpoint by design (`autonomous: false`).

## Known Stubs
None introduced. `marts.ts` contains formulas only (no hardcoded empty data flowing to UI). The `.existing()` view handles intentionally describe views that will exist after the LIVE push (the BLOCKING checkpoint below) — this is the planned data layer, not a stub.

## BLOCKING Checkpoint — Task 3 (apply 0007 + 0008 LIVE) ✓ RESOLVED 2026-06-23
**Applied.** The user ran `pnpm db:migrate` against the live Supabase Postgres; drizzle-kit reported `[✓] migrations applied successfully!` (the `drizzle` schema / `__drizzle_migrations` NOTICEs are benign pre-existing bookkeeping). `0007` (7 calendar-joined `v_*` mart views, each `security_invoker = on`) + `0008` (per-view RLS control + `balances_account_date_uq` UNIQUE) are now LIVE. **Task 3 complete → plan 02-03 fully done (3/3); BI-01/02/03/04/07 + CAT-06 unblocked.** (Original blocking note retained below for history.)

This plan is `autonomous: false`. **Task 3 applies `0007` + `0008` to the LIVE Supabase Postgres, which needs the uncommitted `DATABASE_URL`.** The executor has no DATABASE_URL and must not touch the live DB. The migration SQL FILES are written, committed, and journal-registered; the LIVE push is the human-action checkpoint.

**Until the live push lands, the schema-applied must-have is UNMET:** TS types come from the Drizzle config (not the live DB), so build/verify would falsely pass while the live DB lacks the 7 views and the balances UNIQUE constraint — and an unprotected view would leak data across the allowlist.

### Exact commands the user must run
```bash
# 1. Load the WRITE-plane DATABASE_URL (never committed)
set -a; . ./.env.local; set +a

# 2. Apply 0007 + 0008 in order (after 0006) via the project pattern
pnpm db:migrate

# 3. Verify the 7 views exist
#    psql "$DATABASE_URL" -c "..."  (or the Supabase SQL editor)
select table_name from information_schema.views
where table_schema = 'public' and table_name like 'v_%' order by table_name;
-- expect: v_balance_trend, v_category_breakdown, v_costcenter_bva,
--         v_home_kpis, v_pnl_monthly, v_pct_of_revenue, v_sublet_pnl

# 4. Verify security_invoker = on for each view
select c.relname, c.reloptions
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'v' and c.relname like 'v_%';
-- each reloptions must include security_invoker=on

# 5. Verify the balances UNIQUE(account_id, as_of_date) index exists
select indexname from pg_indexes
where schemaname = 'public' and tablename = 'balances'
  and indexname = 'balances_account_date_uq';

# 6. Spot-check the locked formula on real data (if any populated months exist)
select period_key, revenue, costs, investimento, sublet_net, result, margin
from v_pnl_monthly where revenue <> 0 order by period_key desc limit 3;
-- confirm result == revenue − investimento − costs + sublet_net
-- and household revenue EXCLUDES the sublet gross legs

# 7. Re-run the RLS allowlist guard
pnpm test:rls
```

**Success looks like:** all 7 `v_*` views exist with `security_invoker=on`, the `balances_account_date_uq` UNIQUE index exists, `v_pnl_monthly.result == revenue − investimento − costs + sublet_net` on real data (household revenue excludes sublet gross), and `pnpm test:rls` is GREEN.

**Resume signal:** type **"applied"** once all 7 views exist live with security_invoker, the balances UNIQUE constraint exists, and `pnpm test:rls` is green — or describe the error.

## Next Phase Readiness
- Code-side data foundation ready: the 7 typed `pgView(...).existing()` handles + the pure formula mirror are available for Plan 04 (the dashboard pages) to read under RLS.
- **Blocker:** the LIVE migration push (Task 3 checkpoint) must complete and `pnpm test:rls` must be green before any dashboard page relies on the views existing in the live DB.

## Self-Check: PASSED
- FOUND: drizzle/0007_marts.sql
- FOUND: drizzle/0008_marts_rls.sql
- FOUND: src/lib/db/marts.ts
- FOUND: drizzle/meta/0007_snapshot.json
- FOUND: drizzle/meta/0008_snapshot.json
- FOUND commit: bbc21fb (Task 1)
- FOUND commit: 64face0 (Task 2)

---
*Phase: 02-core-bi-house-as-business*
*Completed (autonomous portion): 2026-06-23*
