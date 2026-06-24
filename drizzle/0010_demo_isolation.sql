-- 0010_demo_isolation — the demo↔real partition column + ATOMIC mart recreation (D4-09/10/11).
--
-- WHY this is ONE atomic file (R-C, eval-02 §5): drizzle/0007_marts.sql aggregates are
-- UNCONDITIONAL scans of transactions/balances/budgets. The instant a seeded is_demo=true row
-- lands WITHOUT the mart GROUP BY carrying is_demo, every existing KPI silently double-counts
-- (net worth jumps by the ~€55k seed, margin includes synthetic revenue). There is NO safe DB
-- state where the column exists but the marts are still unconditional. So this migration does
-- BOTH in one file: (a) ADD COLUMN is_demo on the 7 demo-bearing tables, and (b) DROP/CREATE
-- all 7 v_* marts so a demo row and a real row are STRUCTURALLY different output rows — they
-- can never be summed into one mart output row.
--
-- MECHANISM A (D4-09, LOCKED): is_demo boolean not null default false on transactions,
-- balances, budgets, goals, milestones, investment_contributions, insights + is_demo in every
-- aggregating mart's GROUP BY and output. Real ingestion NEVER sets is_demo → every existing
-- and future real row defaults false → ZERO data migration.
--
-- ZERO-FILL NULL SAFETY (D4-10, R-B — spiked at the start of this wave): the period-spine
-- LEFT JOIN onto transactions/balances produces a NULL is_demo for an EMPTY period (no rows
-- match). A naive `group by … t.is_demo` would emit a single is_demo=NULL row for that period,
-- INVISIBLE to BOTH .eq('is_demo', false) and .eq('is_demo', true) — breaking BI-04 zero-fill.
-- The fix used in every aggregating CTE below is `coalesce(t.is_demo, false)` (both in the
-- SELECT list and the GROUP BY): an empty period collapses into the REAL (false) partition as
-- a €0 zero-fill row, while the demo partition stays correctly empty there. The demo seed
-- produces rows for every generated period (D4-02) so the demo partition is naturally dense;
-- the false-partition coalesce preserves the dense €0 zero-fill that BI-04 requires. Spike
-- outcome: Mechanism A confirmed — the spine CTEs are NOT restructured, so Mechanism C
-- (parallel v_demo_* views, D4-11) is NOT needed.
--
-- SECURITY: every view is recreated WITH (security_invoker = on) — byte-identical to 0007 —
-- so an anon/RSC `select v_*` runs under the CALLER's role and the underlying tables' RLS
-- (the 0001 allowlist for authenticated, the 0011 anon is_demo=true policy added next) applies
-- transitively. 0008's `alter view … set (security_invoker = on)` re-assert stays valid.
--
-- NO PII, NO € amounts, NO real merchant/tenant/account names — static DDL only (T-04-R-D).
-- Static SQL: no user input is concatenated anywhere; the read path filters with parameterized
-- .eq('period_key', …) and .eq('is_demo', …) from src/lib/demo/mode.ts.

-- ===========================================================================
-- 1. is_demo partition column on the demo-bearing tables (Mechanism A).
--    `not null default false` → every existing real row is false with no backfill.
--    The 7 mart/Goal-page tables (D4-09) PLUS connections — the onboarding-signal table the
--    public demo's getOnboardingState probes and the seed writes an is_demo=true row into
--    (D4-07/13). connections needs the column so the 0011 anon `using (is_demo = true)` policy
--    has a column to filter on (without it the next migration fails to apply).
-- ===========================================================================
alter table public.transactions              add column is_demo boolean not null default false;
--> statement-breakpoint
alter table public.balances                  add column is_demo boolean not null default false;
--> statement-breakpoint
alter table public.budgets                   add column is_demo boolean not null default false;
--> statement-breakpoint
alter table public.goals                     add column is_demo boolean not null default false;
--> statement-breakpoint
alter table public.milestones                add column is_demo boolean not null default false;
--> statement-breakpoint
alter table public.investment_contributions  add column is_demo boolean not null default false;
--> statement-breakpoint
alter table public.insights                  add column is_demo boolean not null default false;
--> statement-breakpoint
alter table public.connections               add column is_demo boolean not null default false;
--> statement-breakpoint

-- ===========================================================================
-- 2. Recreate all 7 v_* marts with is_demo in the GROUP BY + output (atomic with §1).
--    Each DROP precedes its CREATE so the recreation is order-safe under dependencies
--    (v_pct_of_revenue + v_home_kpis depend on v_pnl_monthly / v_category_breakdown /
--    v_balance_trend, so the dependents are dropped first, recreated last).
-- ===========================================================================

-- Drop dependents first (reverse dependency order), then leaf marts.
drop view if exists public.v_home_kpis;
--> statement-breakpoint
drop view if exists public.v_pct_of_revenue;
--> statement-breakpoint
drop view if exists public.v_balance_trend;
--> statement-breakpoint
drop view if exists public.v_category_breakdown;
--> statement-breakpoint
drop view if exists public.v_costcenter_bva;
--> statement-breakpoint
drop view if exists public.v_pnl_monthly;
--> statement-breakpoint
drop view if exists public.v_sublet_pnl;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- v_sublet_pnl (D2-06/07/08) — recreated verbatim + is_demo partition.
-- coalesce(t.is_demo, false) forces an empty sublet month into the real partition.
-- ---------------------------------------------------------------------------
create view public.v_sublet_pnl
  with (security_invoker = on) as
with periods as (
  select distinct period_key from public.dim_calendar
)
select
  p.period_key,
  coalesce(t.is_demo, false)                                          as is_demo,
  coalesce(sum(t.amount_eur)  filter (where t.flow_type = 'revenue'), 0)::numeric(14,2) as sublet_revenue,
  coalesce(sum(-t.amount_eur) filter (where t.flow_type = 'cost'),    0)::numeric(14,2) as sublet_costs,
  coalesce(sum(t.amount_eur),                                          0)::numeric(14,2) as sublet_net
from periods p
left join public.dim_calendar c on c.period_key = p.period_key
left join public.transactions t
  on t.booking_date = c.date
 and t.cost_center  = 'sublocacao'
group by p.period_key, coalesce(t.is_demo, false);
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- v_pnl_monthly (BI-01/04, D2-11) — the household P&L + is_demo partition.
-- The household CTE groups by (period_key, coalesce(is_demo,false)); the v_sublet_pnl join is
-- on (period_key, is_demo) so a demo household row only ever joins the demo sublet row (never
-- crosses partitions). Every SUM coalesces to 0 → an empty month is a €0 false-partition row.
-- ---------------------------------------------------------------------------
create view public.v_pnl_monthly
  with (security_invoker = on) as
with periods as (
  select distinct period_key from public.dim_calendar
),
household as (
  select
    p.period_key,
    coalesce(t.is_demo, false) as is_demo,
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
  group by p.period_key, coalesce(t.is_demo, false)
)
select
  h.period_key,
  h.is_demo,
  h.revenue,
  h.costs,
  h.investimento,
  coalesce(s.sublet_net, 0)::numeric(14,2)                                   as sublet_net,
  (h.revenue - h.investimento - h.costs + coalesce(s.sublet_net, 0))::numeric(14,2) as result,
  ((h.revenue - h.investimento - h.costs + coalesce(s.sublet_net, 0))
     / nullif(h.revenue, 0))::numeric(14,6)                                  as margin
from household h
left join public.v_sublet_pnl s
  on s.period_key = h.period_key
 and s.is_demo    = h.is_demo;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- v_costcenter_bva (BI-02 / D2-14) — budget-vs-actual + is_demo partition.
-- Driven off `budgets` rows; budgets carries its own is_demo. The transactions LEFT JOIN
-- additionally pins t.is_demo = b.is_demo so a demo budget only ever sums demo actuals (and a
-- real budget only real actuals) — the two partitions never cross. coalesce on the budgets
-- side is unnecessary (b.is_demo is NOT NULL — budgets is the driving table, never NULL).
-- ---------------------------------------------------------------------------
create view public.v_costcenter_bva
  with (security_invoker = on) as
select
  b.cost_center,
  b.category_id,
  b.period_key,
  b.is_demo,
  b.amount_eur::numeric(14,2) as budget,
  coalesce(sum(-t.amount_eur) filter (where t.flow_type = 'cost'), 0)::numeric(14,2) as actual
from public.budgets b
left join public.dim_calendar c
  on c.period_key = b.period_key
left join public.transactions t
  on t.booking_date  = c.date
 and t.cost_center   = b.cost_center
 and t.cost_center  is distinct from 'sublocacao'
 and t.is_demo       = b.is_demo
 and (b.category_id is null or t.category_id = b.category_id)
group by b.cost_center, b.category_id, b.period_key, b.is_demo, b.amount_eur;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- v_category_breakdown (BI-03 / D2-01) — cost breakdown at 3 grains + is_demo partition.
-- The costs CTE carries t.is_demo; every grain's GROUP BY adds coalesce(k.is_demo, false) so
-- the three union-all slices each partition by demo/real. (k.is_demo is NOT NULL here — the
-- costs CTE inner-joins transactions, so no NULL arises; coalesce is belt-and-braces parity
-- with the other marts and keeps the output column non-null.)
-- ---------------------------------------------------------------------------
create view public.v_category_breakdown
  with (security_invoker = on) as
with costs as (
  select
    c.period_key,
    t.is_demo,
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
  coalesce(k.is_demo, false)                        as is_demo,
  'category'::text                                  as grain,
  k.category_id::text                               as bucket_key,
  coalesce(cat.name, 'Uncategorized')               as bucket_label,
  coalesce(sum(k.cost_amount), 0)::numeric(14,2)    as costs
from costs k
left join public.categories cat on cat.id = k.category_id
group by k.period_key, coalesce(k.is_demo, false), k.category_id, cat.name
union all
-- by account
select
  k.period_key,
  coalesce(k.is_demo, false)                        as is_demo,
  'account'::text                                   as grain,
  k.account_id::text                                as bucket_key,
  coalesce(a.name, 'Unknown account')               as bucket_label,
  coalesce(sum(k.cost_amount), 0)::numeric(14,2)    as costs
from costs k
left join public.accounts a on a.id = k.account_id
group by k.period_key, coalesce(k.is_demo, false), k.account_id, a.name
union all
-- by person (cost_center)
select
  k.period_key,
  coalesce(k.is_demo, false)                        as is_demo,
  'person'::text                                    as grain,
  k.cost_center::text                               as bucket_key,
  coalesce(cc.label, k.cost_center, 'Uncategorized') as bucket_label,
  coalesce(sum(k.cost_amount), 0)::numeric(14,2)    as costs
from costs k
left join public.cost_centers cc on cc.code = k.cost_center
group by k.period_key, coalesce(k.is_demo, false), k.cost_center, cc.label;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- v_pct_of_revenue (BI-03 / D2-15) — each category cost / period revenue + is_demo partition.
-- Carries is_demo through both feeders: the cat_costs CTE selects v_category_breakdown.is_demo
-- and the join to v_pnl_monthly pins (period_key, is_demo) so a demo category cost divides ONLY
-- the demo revenue (and real by real) — never a cross-partition ratio.
-- ---------------------------------------------------------------------------
create view public.v_pct_of_revenue
  with (security_invoker = on) as
with cat_costs as (
  select
    period_key,
    is_demo,
    bucket_key  as category_id,
    bucket_label as category_label,
    costs       as category_cost
  from public.v_category_breakdown
  where grain = 'category'
)
select
  cc.period_key,
  cc.is_demo,
  cc.category_id,
  cc.category_label,
  cc.category_cost::numeric(14,2)                          as category_cost,
  p.revenue::numeric(14,2)                                 as revenue,
  (cc.category_cost / nullif(p.revenue, 0))::numeric(14,6) as pct_of_revenue
from cat_costs cc
join public.v_pnl_monthly p
  on p.period_key = cc.period_key
 and p.is_demo    = cc.is_demo;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- v_balance_trend (BI-07) — net worth per day + is_demo partition.
-- balances carries is_demo; the trend partitions net worth by demo/real. The latest-snapshot
-- window now partitions by (date, account_id, is_demo) and the spine LEFT JOIN onto `latest`
-- pins is_demo, so a demo balance never feeds the real net-worth trend. An empty pre-history
-- day coalesces into the false partition (coalesce(l.is_demo, false)) as the €0 zero-fill row.
-- ---------------------------------------------------------------------------
create view public.v_balance_trend
  with (security_invoker = on) as
with spine as (
  select c.date, c.period_key
  from public.dim_calendar c
  where c.date <= current_date
),
-- latest snapshot per account+partition as of each spine day (most recent on/before the day)
latest as (
  select
    s.date,
    s.period_key,
    b.account_id,
    b.is_demo,
    b.balance_eur,
    row_number() over (
      partition by s.date, b.account_id, b.is_demo
      order by b.as_of_date desc
    ) as rn
  from spine s
  join public.balances b on b.as_of_date <= s.date
)
select
  s.date::text                                              as date,
  s.period_key,
  coalesce(l.is_demo, false)                                as is_demo,
  coalesce(sum(l.balance_eur) filter (where l.rn = 1), 0)::numeric(14,2) as net_worth
from spine s
left join latest l on l.date = s.date and l.rn = 1
group by s.date, s.period_key, coalesce(l.is_demo, false);
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- v_home_kpis (BI-05) — the 4 headline KPIs + is_demo partition.
-- Joins v_pnl_monthly to the latest net worth IN that period, both pinned on
-- (period_key, is_demo) so the headline numbers never mix demo + real.
-- ---------------------------------------------------------------------------
create view public.v_home_kpis
  with (security_invoker = on) as
with nw_per_period as (
  select distinct on (period_key, is_demo)
    period_key,
    is_demo,
    net_worth
  from public.v_balance_trend
  order by period_key, is_demo, date desc
)
select
  p.period_key,
  p.is_demo,
  p.revenue,
  p.investimento,
  p.costs,
  p.sublet_net,
  p.result,
  p.margin,
  coalesce(n.net_worth, 0)::numeric(14,2) as net_worth
from public.v_pnl_monthly p
left join nw_per_period n
  on n.period_key = p.period_key
 and n.is_demo    = p.is_demo;
--> statement-breakpoint
