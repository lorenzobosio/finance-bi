-- 0013_demo_anon_reference_reads — the anon SELECT policy on the THREE shared REFERENCE tables
-- the v_* marts JOIN, so the public anon demo stops rendering every KPI as €0 (Phase-4 UAT fix).
--
-- ROOT CAUSE this closes: the v_* marts are `security_invoker = on` (0008/0010), so an anon
-- `select v_*` runs as the `anon` role and the UNDERLYING tables' RLS applies transitively. 0011
-- added anon `using (is_demo = true)` policies to the demo-bearing FINANCIAL tables — but every
-- mart ALSO joins three SHARED reference tables that have RLS ENABLED with NO anon policy
-- (`dim_calendar`, `categories`, `cost_centers`). For the anon role those joins return ZERO rows,
-- and because each mart's period spine is built on `dim_calendar` via a LEFT JOIN
-- (`periods as (select distinct period_key from public.dim_calendar)` in 0010), an empty
-- dim_calendar collapses the spine to nothing → every mart yields zero rows → the demo dashboard
-- shows €0 across the board. (The `test:rls:demo` gate passed because it only exercised the
-- demo-bearing TABLES, never the VIEWS the app actually reads — that gap is closed in this same
-- commit by extending test/rls.demo.assert.mjs with a VIEW check.)
--
-- WHY an unconditional anon read is SAFE here (and ONLY here): these three are calendar + taxonomy
-- reference data. They carry NO financial data, NO email/PII, and NO `is_demo` column — there is
-- nothing to partition and nothing to leak. dim_calendar is a pure date dimension; categories and
-- cost_centers are the fixed analytical taxonomy (labels like "Groceries", "Lorenzo"/"Fernanda"/
-- "Shared"). Publishing these label/date rows to anon reveals no private information. The actual
-- FINANCIAL tables (transactions, balances, budgets, …) STAY partitioned by the `is_demo = true`
-- anon policies from 0011 — this migration does NOT touch them and the €0-leak guard there is
-- untouched. `accounts` is deliberately NOT granted: it holds real account names with no is_demo,
-- so anon read would leak real accounts; the only casualty is blank account-grain labels in the
-- demo spending breakdown, which is acceptable.
--
-- The 0001 `allowlist_all for all to authenticated` policies on these three tables are UNTOUCHED
-- (a different role path — anon and authenticated policies never interact).
--
-- SELECT-ONLY, anon role only. No anon insert/update/delete policy is added (RLS still denies
-- every anon write — no anon write policy exists on these tables).
--
-- NO PII, NO email literal — static RLS DDL only.

-- dim_calendar — the period spine every mart LEFT JOINs; without anon read the spine collapses.
create policy "demo_anon_read" on public.dim_calendar
  for select to anon using (true);
--> statement-breakpoint

-- categories — the cost-breakdown category labels the marts join (v_category_breakdown etc.).
create policy "demo_anon_read" on public.categories
  for select to anon using (true);
--> statement-breakpoint

-- cost_centers — the person/cost-center labels the marts join.
create policy "demo_anon_read" on public.cost_centers
  for select to anon using (true);
--> statement-breakpoint
