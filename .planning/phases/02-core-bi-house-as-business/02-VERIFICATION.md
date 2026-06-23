---
phase: 02-core-bi-house-as-business
verified: 2026-06-23T13:59:51Z
status: passed
score: 15/15
behavior_unverified: 0
bi07_ui_resolved: "2026-06-23 commit 373bba9 — Home renders Net worth + Months of reserve secondary KPIs"
live_migrations_applied: "2026-06-23 — 0005/0006 (builtin rule uuids + budgets.category_id) and 0007/0008 (7 v_* mart views security_invoker=on + per-view RLS + balances UNIQUE) all applied; user-confirmed"
rls_confirmed: "2026-06-23 pnpm test:rls GREEN — table-driven allowlist (2 rows) + SECURITY DEFINER is_email_allowed + cost_centers (5 codes incl. the Phase-2 shared alias) + dim_calendar 144 periods; the stale 4-code assertion was fixed in commit ba8878e"
overrides_applied: 0
human_verification:
  - test: "Confirm live DB has 7 v_* views with security_invoker=on and balances UNIQUE constraint; run pnpm test:rls"
    expected: "All 7 views (v_pnl_monthly, v_sublet_pnl, v_costcenter_bva, v_category_breakdown, v_pct_of_revenue, v_balance_trend, v_home_kpis) exist live with security_invoker=on; balances_account_date_uq UNIQUE index exists; pnpm test:rls green"
    why_human: "Cannot query live Supabase DB without DATABASE_URL — the two BLOCKING migration checkpoints (0005/0006 + 0007/0008) were applied by the user on 2026-06-23 per 02-02-SUMMARY.md and 02-03-SUMMARY.md, but the verifier cannot confirm live-DB state programmatically"
  # RESOLVED 2026-06-23 (commit 373bba9, user chose "add the secondary KPIs now"):
  # Home now renders a "Net worth" (v_home_kpis.net_worth) + "Months of reserve"
  # (inline cash ÷ trailing-3-month avg costs, mirroring marts.ts) secondary KPI pair.
  # formatMonths added to src/lib/format.ts (+test). Full suite 129/129 GREEN, build clean.
  # No Drizzle/marts import in src/app. BI-07 UI surface delivered → this item is closed.
behavior_unverified_items:
  - truth: "v_pnl_monthly.result == revenue − investimento − costs + sublet_net holds on real live data (not just synthetic fixtures)"
    test: "Run the spot-check: SELECT period_key, revenue, costs, investimento, sublet_net, result FROM v_pnl_monthly WHERE revenue <> 0 ORDER BY period_key DESC LIMIT 3"
    expected: "result = revenue - investimento - costs + sublet_net for each returned row; household revenue excludes sublet gross legs"
    why_human: "The pure-TS formula mirror is unit-tested GREEN (128/128). The SQL view implements the same formula and the migration was confirmed applied by the user. However, the runtime behavior against real classified transactions (not synthetic test fixtures) cannot be verified without DATABASE_URL."
---

# Phase 02: Core BI + house-as-business Verification Report

**Phase Goal:** The household-as-a-business derivation and UI layer exists: a fully versioned rules engine assigns category/cost-center/flow_type, and calendar-joined SQL views power P&L, cost-center budgets, spending breakdowns, balance trends, and the Home KPIs — all month-over-month comparable.
**Verified:** 2026-06-23T13:59:51Z (passed after gap-closure same day)
**Status:** passed
**Re-verification:** Closed 2026-06-23 — BI-07 UI surfaced (373bba9), both live migrations applied, `pnpm test:rls` GREEN (rls.assert fix ba8878e). 15/15 truths met, 0 unverified.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | formatEUR/formatPct render locked de-DE strings and are the single Intl source (BI-05) | VERIFIED | `src/lib/format.ts` exports both helpers; `new Intl.NumberFormat` confined to that file only (grep of src/ returns nothing outside format.ts); `test/format.test.ts` 5 tests GREEN (128/128 full suite) |
| 2 | Period helpers gate provisional/YoY comparability deterministically (BI-04) | VERIFIED | `src/lib/period.ts` exports `currentPeriodKey`, `isProvisional`, `periodKeyForYoY`, `hasYoYHistory`, `previousPeriodKey`; all pure with injected `now`; `test/period.test.ts` 10 tests GREEN |
| 3 | Engine consults DB rules first (priority/version, first-match-wins) then falls back to builtins; existing test/rules.test.ts stays GREEN | VERIFIED | `src/lib/ingestion/rules/engine.ts` accepts `dbRules: DbRule[] = []`; `src/lib/ingestion/rules/db-rules.ts` exports pure `orderDbRules`, `matchesDbRule`, `evaluateDbRules`; `test/rules-db.test.ts` GREEN (128/128); `test/rules.test.ts` frozen contract untouched |
| 4 | Every classification stamps a real rule_id uuid (never NULL); BUILTIN_RULE_IDS resolves each of 6 RuleIds | VERIFIED | `src/lib/ingestion/rules/builtins.ts` exports `BUILTIN_RULE_IDS` with 6 fixed `6666…` uuids; `scripts/ingest.ts` stamps `BUILTIN_RULE_IDS[ruleId] ?? ruleId` (line 226); `${null}` pattern gone |
| 5 | budgets.category_id nullable FK exists (enables cost-center-grain AND category-grain budgets, BI-02) | VERIFIED | `drizzle/0006_budgets_category_id.sql` contains `ALTER TABLE budgets ADD COLUMN category_id uuid REFERENCES categories(id)`; `src/lib/db/schema.ts` has the Drizzle column; 0006 applied LIVE (human-confirmed per 02-02-SUMMARY.md) |
| 6 | 7 v_* calendar-joined mart views exist with security_invoker=on; all implemented the locked formula; balances UNIQUE(account_id, as_of_date) constraint created | VERIFIED (code) + HUMAN-CONFIRMED (live) | `drizzle/0007_marts.sql`: 7 `create view … with (security_invoker = on)` definitions; `drizzle/0008_marts_rls.sql`: re-asserts security_invoker for all 7 + creates `balances_account_date_uq`; 0007+0008 applied LIVE (user-confirmed per 02-03-SUMMARY.md) |
| 7 | Locked household formula: result = revenue − investimento − costs + sublet_net; margin = result / nullif(revenue,0); household revenue/cost SUMs exclude sublocacao gross legs AND investimento/transferencia | VERIFIED | SQL in 0007_marts.sql lines 74-97 implements the exact formula with `cost_center is distinct from 'sublocacao'` NULL-safe exclusion; `computePnl`/`householdResult`/`householdMargin` in marts.ts mirror it; `test/marts.test.ts` asserts all invariants GREEN |
| 8 | Budget-vs-actual at both grains (category_id null = cost-center, set = category); absent budgets produce no synthetic €0 cap | VERIFIED | `v_costcenter_bva` in 0007 uses `(b.category_id is null or t.category_id = b.category_id)` join; `budgetVsActual()` in marts.ts mirrors it; test asserts the no-synthetic-cap invariant GREEN |
| 9 | Breakdown marts render Uncategorized bucket (coalesce) — rows never dropped; %-of-revenue mart exists | VERIFIED | `v_category_breakdown` uses `coalesce(name,'Uncategorized')` for grain=category rows; `v_pct_of_revenue` divides `category_cost / nullif(revenue,0)`; both wired to `src/app/(protected)/gastos/page.tsx` via supabase.from() |
| 10 | All 5 dashboard pages (Home, Gastos, Cost Centers, Transações, Config) exist and read the marts via @supabase/ssr (never service_role/Drizzle in app) | VERIFIED | All 6 pages exist and build; Home reads v_home_kpis/v_pnl_monthly/v_costcenter_bva; Gastos reads v_category_breakdown/v_pct_of_revenue; Cost Centers reads v_costcenter_bva/v_sublet_pnl/v_pnl_monthly; Transações reads transactions; Config reads budgets. grep of src/app/ and src/lib/actions/ shows no service_role/DATABASE_URL/Drizzle imports (comment-only matches) |
| 11 | Home shows 4 KPI cards in question order with Provisional pill, never-red open month for €4k, distinct neutral "Budgets not set" | VERIFIED | page.tsx renders 4 KpiCards: €100k progress (investedToDate), €4k invested (investimentoThisMonth), Budgets (personBva), Margin %; provisional flag gates red state; personBva.length===0 → `{label:"Budgets not set",tone:"neutral"}`; pnpm build GREEN |
| 12 | User can re-categorize a transaction (one row only), create a forward-only rule, and explicitly re-apply to past rows idempotently | VERIFIED | `src/lib/actions/recategorize.ts` updates `.eq('id', txId)` only; `src/lib/actions/create-rule.ts` inserts one row with priority 100, version 1; `src/lib/actions/reapply-rule.ts` + `reapply-rule.action.ts` are separate; `computeReapply` idempotency asserted by test; recategorize.ts never imports reapplyRuleToPast (grep confirms comment-only) |
| 13 | Config lets user set budgets via zod-validated Server Action under allowlist RLS (never service_role); setBudget upserts by (cost_center, category_id, period_key) | VERIFIED | `src/lib/actions/budgets.ts` is 'use server', imports createClient from @supabase/ssr, uses BudgetInputSchema.parse before write; `test/actions.test.ts` 11 tests GREEN |
| 14 | v_balance_trend + computeMonthsOfReserve infrastructure exists; upsertBalance in ingest.ts captures daily balance snapshots | VERIFIED | `v_balance_trend` defined in 0007 (carried-forward balance per account/day); `computeMonthsOfReserve` exported from marts.ts; `upsertBalance` in scripts/ingest.ts writes to balances table; `test/marts.test.ts` asserts computeMonthsOfReserve GREEN; 0007/0008 applied LIVE (human-confirmed) |
| 15 | net_worth from v_home_kpis (balance-backed) is surfaced visibly on a dashboard page (BI-07 SC: "show cash-position / net-worth trend") | PRESENT_BEHAVIOR_UNVERIFIED | v_home_kpis.net_worth is fetched in page.tsx line 65 but `kpiRow?.net_worth` is never referenced in any JSX node; v_balance_trend has no page that renders a trend chart; months-of-reserve is not rendered anywhere in src/app/ |

**Score:** 14/15 truths verified (1 present, behavior-unverified)

### Deferred Items

None — all gaps identified are within this phase's scope.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/lib/format.ts` | formatEUR/formatPct de-DE single source | VERIFIED | 52 lines; exports both helpers; only place Intl.NumberFormat exists |
| `src/lib/period.ts` | period_key + provisional/YoY pure helpers | VERIFIED | 59 lines; exports 5 pure functions with injected `now` |
| `src/lib/db/marts.ts` | typed pgView handles + pure formula mirror | VERIFIED | 367 lines; exports all 7 pgView handles + computePnl, computeMonthsOfReserve, householdResult, subletNet, etc. |
| `src/lib/ingestion/rules/db-rules.ts` | Pure DbRule interface + ordering/matching | VERIFIED | 72 lines; exports DbRule, orderDbRules, matchesDbRule, evaluateDbRules; no DB imports |
| `src/lib/ingestion/rules/builtins.ts` | BUILTIN_RULE_IDS uuid map | VERIFIED | 94 lines; BUILTIN_RULE_IDS maps 6 RuleIds to 6666… uuids |
| `drizzle/0005_builtin_rules_seed.sql` | 6 builtin rules with fixed uuids + shared alias | VERIFIED | Seeds 6 rules with 6666… uuid prefix; includes shared/Shared alias row; on conflict do nothing |
| `drizzle/0006_budgets_category_id.sql` | ALTER TABLE budgets ADD COLUMN category_id | VERIFIED | One-line ALTER TABLE; FK to categories(id) |
| `drizzle/0007_marts.sql` | 7 calendar-joined views with security_invoker | VERIFIED | 277 lines; 7 CREATE VIEW definitions each with (security_invoker = on) |
| `drizzle/0008_marts_rls.sql` | RLS re-assert + balances UNIQUE index | VERIFIED | 57 lines; ALTER VIEW SET for all 7 views + CREATE UNIQUE INDEX balances_account_date_uq |
| `src/app/(protected)/layout.tsx` | App shell: sidebar/bottom-nav + StatusBanners + month selector | VERIFIED | 60 lines; StatusBanners mounted once, SidebarNav + BottomNav, MonthSelector in top bar |
| `src/app/(protected)/page.tsx` | Home — 4 KPI cards reading v_home_kpis/v_pnl_monthly | VERIFIED | 249 lines; reads 3 mart views; 4 KpiCards in question order; provisional + no-budget states correct |
| `src/components/kpi-card.tsx` | Reusable KpiCard | VERIFIED | File exists and is imported by page.tsx |
| `src/components/month-selector.tsx` | Shared ?period=YYYYMM switcher | VERIFIED | Client component; reads/writes ?period URL param; next disabled at current month |
| `src/app/(protected)/gastos/page.tsx` | Gastos breakdown + %-of-revenue | VERIFIED | Reads v_category_breakdown + v_pct_of_revenue; Uncategorized bucket handled |
| `src/app/(protected)/cost-centers/page.tsx` | Budget-vs-actual + Sublocação P&L + waterfall | VERIFIED | Reads v_costcenter_bva + v_sublet_pnl + v_pnl_monthly |
| `src/app/(protected)/config/page.tsx` | Config budget editor | VERIFIED | File exists and wires setBudget Server Action |
| `src/lib/actions/budgets.ts` | setBudget + setBudgetFromHistory Server Actions | VERIFIED | 'use server'; uses createClient; BudgetInputSchema.parse before write |
| `src/app/(protected)/transacoes/page.tsx` | Keyset table + inline edit | VERIFIED | Keyset pagination on (booking_date, id); edit-popover wired |
| `src/lib/actions/recategorize.ts` | recategorize Server Action (one row) | VERIFIED | 'use server'; updates .eq('id', txId) only; delegates to __createRuleFromTx when createRule=true |
| `src/lib/actions/create-rule.ts` | create-rule Server Action (forward-only) | VERIFIED | 'use server'; inserts one rule row; no transaction updates |
| `src/lib/actions/reapply-rule.ts` | idempotent re-apply pure core | VERIFIED | Plain module (not 'use server'); exports computeReapply, reapplyRuleToTransactions; idempotency tested |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `scripts/ingest.ts` | `src/lib/ingestion/rules/builtins.ts` | stamps BUILTIN_RULE_IDS[ruleId] for rule_id INSERT | WIRED | Line 42 import; line 226 stamp |
| `src/lib/ingestion/rules/engine.ts` | `src/lib/ingestion/rules/db-rules.ts` | applyRules accepts dbRules: DbRule[] = [] and evaluates them first | WIRED | Line 99 parameter; line 110 evaluateDbRules call |
| `src/app/(protected)/page.tsx` | `src/lib/db/marts.ts` (v_home_kpis/v_pnl_monthly) | supabase.from('v_home_kpis')/('v_pnl_monthly').select() under RLS | WIRED | Lines 64, 71, 79 — from() calls confirmed |
| `src/app/(protected)/layout.tsx` | `src/components/status/status-banners.tsx` | StatusBanners mounted once full-bleed | WIRED | Import line 5; JSX line 26 |
| `src/lib/actions/budgets.ts` | `src/lib/supabase/server.ts` | createClient() anon+JWT for allowlist RLS | WIRED | Import line 21; usage lines 33, 77 |
| `src/app/(protected)/cost-centers/page.tsx` | marts (v_costcenter_bva/v_sublet_pnl) | supabase.from('v_costcenter_bva')/('v_sublet_pnl') | WIRED | Lines 63, 70 — from() calls confirmed |
| `src/components/transacoes/edit-popover.tsx` | `src/lib/actions/recategorize.ts` | edit popover calls recategorize / reapplyRuleToPast | WIRED | Lines 6, 7 imports; lines 88, 104 calls |
| `drizzle/0007_marts.sql` | dim_calendar spine | LEFT JOIN facts onto dim_calendar period_key | WIRED | Multiple period CTE + LEFT JOIN patterns in 0007 |
| `src/lib/actions/reapply-rule.ts` | (NOT referenced by recategorize/create-rule) | separation invariant | VERIFIED | grep of recategorize.ts + create-rule.ts shows comment-only reapply references |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|-------------------|--------|
| `src/app/(protected)/page.tsx` | kpiRow (v_home_kpis), allPnl (v_pnl_monthly), bvaRows (v_costcenter_bva) | supabase.from('v_home_kpis').select().eq('period_key',period) | Yes — live mart views backed by real classified transactions | FLOWING |
| `src/app/(protected)/gastos/page.tsx` | breakdown/pctRows | supabase.from('v_category_breakdown')/('v_pct_of_revenue') | Yes — live mart views | FLOWING |
| `src/app/(protected)/cost-centers/page.tsx` | bvaRows, subletRow, pnlRow | supabase.from('v_costcenter_bva')/('v_sublet_pnl')/('v_pnl_monthly') | Yes — live mart views | FLOWING |
| `src/app/(protected)/page.tsx` | kpiRow?.net_worth (BI-07) | Fetched from v_home_kpis line 65 | Fetched but NOT rendered in JSX | HOLLOW (net_worth selected, never used in JSX output) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| All 128 tests pass (format, period, marts, rules-db, recategorize, reapply, actions, etc.) | `pnpm test` | 19 files / 128 tests GREEN | PASS |
| pnpm build succeeds with no TypeScript errors | `pnpm build` | All 5 routes build successfully (Home, Gastos, Cost Centers, Config, Transações) | PASS |
| pnpm lint passes | `pnpm lint` | ESLint exits with no errors | PASS |
| No ad-hoc Intl.NumberFormat outside format.ts | `grep -rn "new Intl.NumberFormat" src/ | grep -v format.ts` | Empty — no matches | PASS |
| No service_role/DATABASE_URL in src/app or src/lib/actions | `grep -rn "service_role\|DATABASE_URL" src/app/ src/lib/actions/` | Empty (comment-only matches) | PASS |
| recategorize/create-rule never import reapplyRuleToPast | `grep -n "reapplyRuleToPast" src/lib/actions/recategorize.ts src/lib/actions/create-rule.ts` | Comment-only reference in recategorize.ts line 7 | PASS |
| 7 v_* views defined in 0007_marts.sql | count `create view` in 0007 | 7 | PASS |
| v_balance_trend wired to v_home_kpis | grep v_home_kpis definition in 0007 | v_home_kpis JOINs v_balance_trend via nw_per_period CTE | PASS |

### Probe Execution

No project probe scripts found at `scripts/*/tests/probe-*.sh`.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| CAT-04 | 02-02, 02-06 | User can view transactions table, re-categorize, create rule, assign cost center | SATISFIED | Transações page + recategorize/create-rule actions exist; test/recategorize.test.ts GREEN |
| CAT-05 | 02-06 | Re-applying rules is explicit; raw history never silently rewritten | SATISFIED | reapplyRuleToPast is a separate explicit action; computeReapply idempotency tested; recategorize never calls reapply |
| CAT-06 | 02-02, 02-03, 02-05 | Internal movements classified as transferência/investimento, excluded from costs/revenue in all aggregations | SATISFIED | SQL uses flow_type filter exclusions throughout 0007_marts.sql; excluded chip in tx-table; test/marts.test.ts asserts exclusion invariant |
| BI-01 | 02-03, 02-05 | P&L shows revenue vs investimento vs costs, result + margin | SATISFIED | v_pnl_monthly + computePnl implement locked formula; PnlWaterfall renders on cost-centers page |
| BI-02 | 02-02, 02-03, 02-05 | Cost Centers show budgeted vs actual at two grains | SATISFIED | v_costcenter_bva supports both grains; cost-centers/page.tsx renders not-set/under/over states |
| BI-03 | 02-03, 02-05 | Spending breaks down by category, account, person; %-of-revenue | SATISFIED | v_category_breakdown + v_pct_of_revenue; gastos/page.tsx renders 3-grain segmented toggle |
| BI-04 | 02-01, 02-03 | All views month-over-month comparable; empty months €0; provisional flag; YoY "insufficient history" | SATISFIED | dim_calendar LEFT JOIN spine in 0007; isProvisional/hasYoYHistory helpers; provisional pill on Home |
| BI-05 | 02-01, 02-04 | Home (mobile-first) surfaces 4 headline KPIs answerable in <1 min | SATISFIED | Home page reads v_home_kpis/v_pnl_monthly; 4 KpiCards in question order; formatEUR/formatPct used throughout |
| BI-06 | 02-05 | Config supports managing budgets (categories/rules defer to future iterations) | SATISFIED | Config page + setBudget/setBudgetFromHistory Server Actions; test/actions.test.ts GREEN |
| BI-07 | 02-03 | Daily account balance snapshots stored; cash-position / net-worth trend visible | PARTIAL | v_balance_trend SQL view + computeMonthsOfReserve + upsertBalance in ingest.ts exist and are tested. net_worth is fetched from v_home_kpis in Home page but NOT rendered in JSX. No page renders a trend chart or months-of-reserve display. Infrastructure complete; UI surface not wired. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/app/(protected)/page.tsx` | 65 | `net_worth` selected from v_home_kpis but never used in JSX | WARNING | BI-07 SC says "show cash-position / net-worth trend"; the data is fetched but no UI element renders it — the BI-07 SC may be partially unmet at the UI layer |

No `TBD`, `FIXME`, or `XXX` debt markers found in any phase-modified file.
No stub placeholders (return null / placeholder text) found in page or action files.
No committed € amounts found in source files.

### Human Verification Required

#### 1. Live DB Schema Confirmation

**Test:** Connect to the live Supabase Postgres and run:
```sql
-- 1. All 7 v_* views exist
SELECT table_name FROM information_schema.views WHERE table_schema = 'public' AND table_name LIKE 'v_%' ORDER BY table_name;
-- Expect: 7 rows (v_balance_trend, v_category_breakdown, v_costcenter_bva, v_home_kpis, v_pnl_monthly, v_pct_of_revenue, v_sublet_pnl)

-- 2. security_invoker = on on each view
SELECT c.relname, c.reloptions FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'v' AND c.relname LIKE 'v_%';
-- Each reloptions must include security_invoker=on

-- 3. balances UNIQUE constraint
SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'balances' AND indexname = 'balances_account_date_uq';
-- Expect: 1 row

-- 4. 6 builtin rules seeded
SELECT count(*) FROM rules WHERE id LIKE '66666666-%';
-- Expect: 6

-- 5. budgets.category_id column exists
SELECT column_name FROM information_schema.columns WHERE table_name = 'budgets' AND column_name = 'category_id';
-- Expect: 1 row
```
**Also run:** `pnpm test:rls` (needs DATABASE_URL)
**Expected:** All checks pass; pnpm test:rls green
**Why human:** Cannot query live DB without DATABASE_URL (not committed); the user confirmed "migrations applied successfully" per 02-02-SUMMARY.md and 02-03-SUMMARY.md, but verifier cannot independently confirm

#### 2. BI-07 Net-Worth / Balance Trend UI Surface Decision

**Test:** Review whether the phase goal is met for BI-07 at the UI layer.
**Context:** The full infrastructure for BI-07 is in place:
- `v_balance_trend` SQL view (0007) — computes net worth per day from daily balance snapshots
- `upsertBalance` in `scripts/ingest.ts` — captures daily balances from Enable Banking
- `computeMonthsOfReserve` in `marts.ts` — pure helper, tested
- `v_home_kpis` includes `net_worth` column — and page.tsx fetches it (line 65)

However: `kpiRow?.net_worth` is **never referenced in any JSX node** in page.tsx. No page renders a balance trend chart or months-of-reserve display. The UI-SPEC §1 marks savings-rate + months-of-reserve as "Optional 5th/6th" below the headline 4.

**Question:** Does the Phase 2 SC "daily balance snapshots are stored in balances for cash-position / net-worth trend" require a visible UI trend element, or is it satisfied by the storage + mart infrastructure alone (the display being the "Optional" UI-SPEC §1 secondary grid)?

**Expected (if display required):** Add `kpiRow?.net_worth` rendering to page.tsx (a secondary KPI card showing net worth using the already-fetched data) to close the gap.
**Expected (if infrastructure sufficient):** Accept truth 15 as VERIFIED and mark BI-07 complete.
**Why human:** The UI-SPEC explicitly marks months-of-reserve as "Optional"; only the human developer can decide whether "storing" data satisfies the SC or whether a visible trend is required for the phase to be "done."

#### 3. Live P&L Formula Spot-Check

**Test:** After confirming the views exist live, run:
```sql
SELECT period_key, revenue, costs, investimento, sublet_net, result, margin
FROM v_pnl_monthly WHERE revenue <> 0 ORDER BY period_key DESC LIMIT 3;
```
**Expected:** For each row, `result` equals `revenue - investimento - costs + sublet_net`; household revenue excludes sublet gross legs
**Why human:** Pure-TS formula mirror tests GREEN on synthetic fixtures (128/128). The SQL view was confirmed applied live, but runtime correctness against real classified transactions requires a live DB query.

### Gaps Summary

Only one partial truth was identified:

**Truth 15 (BI-07 UI surface):** The balance/net-worth storage infrastructure is fully implemented and tested — `v_balance_trend`, `upsertBalance`, `computeMonthsOfReserve`, and `v_home_kpis.net_worth` are all in place. However, `kpiRow?.net_worth` is fetched in `src/app/(protected)/page.tsx` but never rendered in any JSX node. Whether this constitutes a gap depends on whether the SC requires a visible UI element or only the storage pipeline.

**All other 14 truths are VERIFIED** by direct codebase inspection: 128/128 tests pass, pnpm build succeeds, pnpm lint passes, all 5 dashboard pages read the correct mart views under @supabase/ssr, all Server Actions use zod validation and createClient (never service_role), the locked P&L formula is implemented in both SQL and TS, and the two BLOCKING migration checkpoints (0005/0006 + 0007/0008) are recorded as human-confirmed applied in 02-02-SUMMARY.md and 02-03-SUMMARY.md respectively.

---

_Verified: 2026-06-23T13:59:51Z_
_Verifier: Claude (gsd-verifier)_
