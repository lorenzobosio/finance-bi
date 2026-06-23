-- 0007_marts — the calendar-joined analytics marts that power every Phase-2 dashboard.
--
-- WHY hand-written (not drizzle-generated): these are FILTER-heavy aggregation VIEWS, not
-- table DDL. The project convention (schema.ts:12-14) is that Drizzle generates table DDL
-- while RLS, seeds, and now VIEWS are hand-written numbered migrations (0001/0002/0005).
-- src/lib/db/marts.ts exposes each view to RSC reads via pgView(name).existing() — the .sql
-- here is the single source of truth for the math; the TS only types the read.
--
-- THE CORRECTNESS KEYSTONES, resolved in SQL once (DRY across the 5 pages):
--   * Calendar-spine zero-fill (BI-04): every mart drives off the DENSE dim_calendar
--     period_key spine via LEFT JOIN, so an empty month renders €0 — never a MISSING row.
--   * Exclusion discipline (CAT-06 / D2-11): investimento + transferencia NEVER enter the
--     household revenue/cost SUMs — every household FILTER pins flow_type explicitly.
--   * Sublet net EXACTLY ONCE (D2-06/07/08): the household SUMs EXCLUDE the sublocacao gross
--     legs (`cost_center <> 'sublocacao'`); v_sublet_pnl is the ONLY place the gross legs
--     appear; the household result re-injects one signed `sublet_net` line.
--   * Locked formula (BI-01 / D2-11): result = revenue − investimento − costs + sublet_net;
--     margin = result / nullif(revenue,0)  ("% of net revenue").
--   * Budget-vs-actual at TWO grains (BI-02 / D2-14): join at cost-center grain when
--     category_id IS NULL, else at category grain; absent budgets are NOT synthesized as €0.
--   * Uncategorized graceful-degrade (BI-03 / D2-01): coalesce(name,'Uncategorized') — rows
--     are never dropped, the breakdown always sums to total costs.
--   * %-of-revenue (BI-03 / D2-15): each category cost / nullif(period revenue, 0).
--
-- AMOUNT SIGN: `amount_eur` is signed (inflows positive, outflows negative). Household
-- revenue sums `amount_eur` (positive inflow); costs/investimento sum `-amount_eur` so the
-- bucket reads as a POSITIVE magnitude (the locked formula subtracts costs/investimento).
--
-- SECURITY: every view is created WITH (security_invoker = on) so an RSC `select` runs under
-- the CALLER's JWT and the underlying tables' allowlist RLS applies (T-02-07). The per-view
-- RLS confirmation + the balances UNIQUE index live in 0008_marts_rls.sql.
--
-- NO PII, NO € amounts, NO real merchant/tenant/account names — static DDL only (T-02-10).
-- Static SQL: no user input is concatenated anywhere (T-02-08); the read path filters with
-- parameterized .eq('period_key', …) from the app.

-- ---------------------------------------------------------------------------
-- v_sublet_pnl (D2-06/07/08) — the standalone Sublocação profit-center P&L.
-- The ONLY place the sublet GROSS legs appear. Driven off the dim_calendar spine so an empty
-- month is a €0 row. sublet_net is the SIGNED net (received − paid) — a loss month is negative.
-- ---------------------------------------------------------------------------
create view public.v_sublet_pnl
  with (security_invoker = on) as
with periods as (
  select distinct period_key from public.dim_calendar
)
select
  p.period_key,
  coalesce(sum(t.amount_eur)  filter (where t.flow_type = 'revenue'), 0)::numeric(14,2) as sublet_revenue,
  coalesce(sum(-t.amount_eur) filter (where t.flow_type = 'cost'),    0)::numeric(14,2) as sublet_costs,
  coalesce(sum(t.amount_eur),                                          0)::numeric(14,2) as sublet_net
from periods p
left join public.dim_calendar c on c.period_key = p.period_key
left join public.transactions t
  on t.booking_date = c.date
 and t.cost_center  = 'sublocacao'
group by p.period_key;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- v_pnl_monthly (BI-01/04, D2-11) — the household P&L on the dim_calendar spine.
-- revenue/costs EXCLUDE the sublocacao gross legs AND never include investimento/transferencia
-- (CAT-06). sublet_net is pulled from v_sublet_pnl (counted EXACTLY ONCE). result + margin are
-- the locked formula. Every SUM coalesces to 0 so an empty month is a €0 row (BI-04).
-- ---------------------------------------------------------------------------
create view public.v_pnl_monthly
  with (security_invoker = on) as
with periods as (
  select distinct period_key from public.dim_calendar
),
household as (
  select
    p.period_key,
    coalesce(sum(t.amount_eur)  filter (
      where t.flow_type = 'revenue' and t.cost_center is distinct from 'sublocacao'
    ), 0)::numeric(14,2) as revenue,
    coalesce(sum(-t.amount_eur) filter (
      where t.flow_type = 'cost'    and t.cost_center is distinct from 'sublocacao'
    ), 0)::numeric(14,2) as costs,
    coalesce(sum(-t.amount_eur) filter (
      where t.flow_type = 'investimento'
    ), 0)::numeric(14,2) as investimento
  from periods p
  left join public.dim_calendar c on c.period_key = p.period_key
  left join public.transactions t on t.booking_date = c.date
  group by p.period_key
)
select
  h.period_key,
  h.revenue,
  h.costs,
  h.investimento,
  coalesce(s.sublet_net, 0)::numeric(14,2)                                   as sublet_net,
  (h.revenue - h.investimento - h.costs + coalesce(s.sublet_net, 0))::numeric(14,2) as result,
  ((h.revenue - h.investimento - h.costs + coalesce(s.sublet_net, 0))
     / nullif(h.revenue, 0))::numeric(14,6)                                  as margin
from household h
left join public.v_sublet_pnl s on s.period_key = h.period_key;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- v_costcenter_bva (BI-02 / D2-14) — budget-vs-actual at BOTH grains.
-- Driven off the `budgets` rows (NOT the calendar) so absent budgets produce NO row — "not
-- set" surfaces as the absence of a row, never a synthetic €0 cap (D2-12). A budget row with
-- category_id NULL matches actuals at cost-center grain; a row with category_id set matches
-- that category. The sublocacao profit-center has no household budget (D2-06).
-- ---------------------------------------------------------------------------
create view public.v_costcenter_bva
  with (security_invoker = on) as
select
  b.cost_center,
  b.category_id,
  b.period_key,
  b.amount_eur::numeric(14,2) as budget,
  coalesce(sum(-t.amount_eur) filter (where t.flow_type = 'cost'), 0)::numeric(14,2) as actual
from public.budgets b
left join public.dim_calendar c
  on c.period_key = b.period_key
left join public.transactions t
  on t.booking_date  = c.date
 and t.cost_center   = b.cost_center
 and t.cost_center  is distinct from 'sublocacao'
 and (b.category_id is null or t.category_id = b.category_id)
group by b.cost_center, b.category_id, b.period_key, b.amount_eur;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- v_category_breakdown (BI-03 / D2-01) — cost breakdown at THREE grains
-- (category / account / person), each per period_key, with the Uncategorized bucket always
-- present. Rows are NEVER dropped: a category-less cost lands under 'Uncategorized'
-- (coalesce). `grain` distinguishes the three breakdown slices the dashboards read.
-- Excludes the sublocacao gross legs (household breakdown only). Driven off the period spine.
-- ---------------------------------------------------------------------------
create view public.v_category_breakdown
  with (security_invoker = on) as
with costs as (
  select
    c.period_key,
    t.category_id,
    t.account_id,
    t.cost_center,
    -t.amount_eur as cost_amount
  from public.transactions t
  join public.dim_calendar c on c.date = t.booking_date
  where t.flow_type = 'cost'
    and t.cost_center is distinct from 'sublocacao'
)
-- by category (Uncategorized when category_id is null)
select
  k.period_key,
  'category'::text                                  as grain,
  k.category_id::text                               as bucket_key,
  coalesce(cat.name, 'Uncategorized')               as bucket_label,
  coalesce(sum(k.cost_amount), 0)::numeric(14,2)    as costs
from costs k
left join public.categories cat on cat.id = k.category_id
group by k.period_key, k.category_id, cat.name
union all
-- by account
select
  k.period_key,
  'account'::text                                   as grain,
  k.account_id::text                                as bucket_key,
  coalesce(a.name, 'Unknown account')               as bucket_label,
  coalesce(sum(k.cost_amount), 0)::numeric(14,2)    as costs
from costs k
left join public.accounts a on a.id = k.account_id
group by k.period_key, k.account_id, a.name
union all
-- by person (cost_center)
select
  k.period_key,
  'person'::text                                    as grain,
  k.cost_center::text                               as bucket_key,
  coalesce(cc.label, k.cost_center, 'Uncategorized') as bucket_label,
  coalesce(sum(k.cost_amount), 0)::numeric(14,2)    as costs
from costs k
left join public.cost_centers cc on cc.code = k.cost_center
group by k.period_key, k.cost_center, cc.label;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- v_pct_of_revenue (BI-03 / D2-15) — each category's cost as a share of that period's
-- salary revenue. category_cost / nullif(revenue,0) so a zero-revenue period is NULL, not a
-- divide-by-zero. Joins each period's category cost (household only) to v_pnl_monthly.revenue.
-- ---------------------------------------------------------------------------
create view public.v_pct_of_revenue
  with (security_invoker = on) as
with cat_costs as (
  select
    period_key,
    bucket_key  as category_id,
    bucket_label as category_label,
    costs       as category_cost
  from public.v_category_breakdown
  where grain = 'category'
)
select
  cc.period_key,
  cc.category_id,
  cc.category_label,
  cc.category_cost::numeric(14,2)                          as category_cost,
  p.revenue::numeric(14,2)                                 as revenue,
  (cc.category_cost / nullif(p.revenue, 0))::numeric(14,6) as pct_of_revenue
from cat_costs cc
join public.v_pnl_monthly p on p.period_key = cc.period_key;
--> statement-breakpoint
