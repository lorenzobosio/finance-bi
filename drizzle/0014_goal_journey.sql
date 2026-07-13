-- 0014_goal_journey — the Phase-5 schema delta (buckets, household, goal_events,
-- transfer_overrides + the brazil/adventures cost-centers + an "Other" category + the
-- v_bucket_spend mart), landed through the project's owner-run BLOCKING `pnpm db:migrate`.
--
-- HAND-WRITTEN, like 0010–0013: this project stopped running `drizzle-kit generate` after
-- 0009 — the migration journal (drizzle/meta/_journal.json) is hand-maintained past idx 9
-- (sequential +1s `when` stamps) and every migration since 0010 hand-writes its DDL + RLS +
-- seeds + views in ONE file (the 0001/0002 DDL-vs-RLS/seed convention). This file follows that
-- convention verbatim so `drizzle-kit migrate` applies it and records idx 14. src/lib/db/schema.ts
-- carries the matching Drizzle table defs as the DDL source of truth (documentation + future CLI).
--
-- SECURITY — the load-bearing invariant (Pitfall 4 / T-05-06/07): every new DEMO-BEARING table
-- (household, goal_events, transfer_overrides) gets RLS ENABLED + the 0001 allowlist_all policy
-- AND the EXACT 0011 anon predicate `using ( is_demo = true )` — never an always-true predicate
-- on a financial/household table (a one-line typo publishes every real row to the public demo).
-- `buckets` is REFERENCE data (like cost_centers in 0013): anon read `using (true)`, no is_demo,
-- no financial content. New tables inherit the anon/authenticated/service_role grants from the
-- 0001 `alter default privileges` (no re-grant needed).
--
-- NO PII, NO email/IBAN/owner-name literal — static DDL + static reference seeds only (T-05-10).

-- ===========================================================================
-- 1. Tables (DDL — mirrors src/lib/db/schema.ts).
-- ===========================================================================

-- buckets — reference data (3 rows over one ETF), NO is_demo (GOAL-07, D5-02).
create table public.buckets (
  code               text primary key,
  name               text not null,
  instrument_isin    text not null,
  monthly_target_eur numeric(14,2)
);
--> statement-breakpoint

-- household — singleton settings (D5-01/10/17). DEMO-BEARING.
create table public.household (
  id               uuid primary key default gen_random_uuid(),
  launch_date      date,
  why              text,
  epic_trip_active boolean not null default false,
  is_demo          boolean not null default false
);
--> statement-breakpoint

-- goal_events — once-only celebrations (GOAL-11, D5-14/18). DEMO-BEARING.
create table public.goal_events (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null,
  threshold   integer,
  period_key  integer,
  achieved_at timestamptz not null default now(),
  dedupe_key  text not null,
  seen        boolean not null default false,
  is_demo     boolean not null default false
);
--> statement-breakpoint

-- transfer_overrides — per-transfer manual split (D5-05). DEMO-BEARING. transaction is the PK.
create table public.transfer_overrides (
  transaction_id uuid primary key references public.transactions(id),
  wealth_eur     numeric(14,2) not null,
  brazil_eur     numeric(14,2) not null,
  adv_small_eur  numeric(14,2) not null,
  adv_big_eur    numeric(14,2) not null,
  is_demo        boolean not null default false
);
--> statement-breakpoint

-- Composite UNIQUE (dedupe_key, is_demo) — NOT a global unique(dedupe_key). A global unique
-- would collide the real vs demo 'level:10000' key; the composite lets both partitions hold the
-- same key AND backs the idempotent `on conflict (dedupe_key, is_demo) do nothing` detect.
alter table public.goal_events
  add constraint goal_events_dedupe_key_is_demo_uq unique (dedupe_key, is_demo);
--> statement-breakpoint

-- ===========================================================================
-- 2. Reference seeds (static — no is_demo; buckets/cost_centers/categories are anon-readable).
-- ===========================================================================

-- buckets: the 3 virtual buckets over one ETF (GOAL-07). instrument_isin identical for all 3;
-- monthly_target wealth 4000 / brazil 200 / adventures NULL (no fixed monthly target). Idempotent.
insert into public.buckets (code, name, instrument_isin, monthly_target_eur) values
  ('wealth',     'Wealth',     'IE000716YHJ7', 4000),
  ('brazil',     'Brazil',     'IE000716YHJ7', 200),
  ('adventures', 'Adventures', 'IE000716YHJ7', null)
on conflict (code) do nothing;
--> statement-breakpoint

-- cost_centers: the two new analytical labels (GOAL-09, D5-10). Reference data, already
-- anon-readable (0013). Idempotent on the PK.
insert into public.cost_centers (code, label) values
  ('brazil',     'Brazil'),
  ('adventures', 'Adventures')
on conflict (code) do nothing;
--> statement-breakpoint

-- categories: the "Other" desire category (CAT-08) — distinct from the NULL→Uncategorized
-- fallback and from revenue_unclassified. categories.name has no unique key, so guard the
-- insert with NOT EXISTS to stay idempotent under a hypothetical re-run.
insert into public.categories (name, "group")
select 'Other', 'desire'
where not exists (
  select 1 from public.categories where name = 'Other' and "group" = 'desire'
);
--> statement-breakpoint

-- ===========================================================================
-- 3. RLS — enable + the 0001 allowlist_all `for all to authenticated` on all 4 new tables.
--    A table without RLS enabled bypasses the allowlist entirely (T-05-07).
-- ===========================================================================
alter table public.buckets enable row level security;
--> statement-breakpoint
create policy "allowlist_all" on public.buckets
  for all to authenticated
  using      ( public.is_email_allowed((select auth.jwt() ->> 'email')) )
  with check ( public.is_email_allowed((select auth.jwt() ->> 'email')) );
--> statement-breakpoint

alter table public.household enable row level security;
--> statement-breakpoint
create policy "allowlist_all" on public.household
  for all to authenticated
  using      ( public.is_email_allowed((select auth.jwt() ->> 'email')) )
  with check ( public.is_email_allowed((select auth.jwt() ->> 'email')) );
--> statement-breakpoint

alter table public.goal_events enable row level security;
--> statement-breakpoint
create policy "allowlist_all" on public.goal_events
  for all to authenticated
  using      ( public.is_email_allowed((select auth.jwt() ->> 'email')) )
  with check ( public.is_email_allowed((select auth.jwt() ->> 'email')) );
--> statement-breakpoint

alter table public.transfer_overrides enable row level security;
--> statement-breakpoint
create policy "allowlist_all" on public.transfer_overrides
  for all to authenticated
  using      ( public.is_email_allowed((select auth.jwt() ->> 'email')) )
  with check ( public.is_email_allowed((select auth.jwt() ->> 'email')) );
--> statement-breakpoint

-- ===========================================================================
-- 4. Anon SELECT policies — the ADDITIVE public-demo surface (0011/0013 pattern).
--    CRITICAL LEAK GUARD: household/goal_events/transfer_overrides use the EXACT
--    `using ( is_demo = true )` predicate — NEVER an always-true predicate on these
--    financial/household tables (a catastrophic permanent leak in a public CV repo).
--    `buckets` is reference data → `using (true)` (no is_demo, no financial content).
--    SELECT-ONLY: no anon insert/update/delete policy exists → anon can read the bounded
--    is_demo=true partition and write NOTHING (RLS denies every anon write).
-- ===========================================================================

-- household (financial/household — is_demo scoped)
create policy "demo_anon_read" on public.household
  for select to anon using ( is_demo = true );
--> statement-breakpoint

-- goal_events (financial/household — is_demo scoped)
create policy "demo_anon_read" on public.goal_events
  for select to anon using ( is_demo = true );
--> statement-breakpoint

-- transfer_overrides (financial/household — is_demo scoped)
create policy "demo_anon_read" on public.transfer_overrides
  for select to anon using ( is_demo = true );
--> statement-breakpoint

-- buckets (reference data — no financial content, like cost_centers in 0013)
create policy "demo_anon_read" on public.buckets
  for select to anon using ( true );
--> statement-breakpoint

-- ===========================================================================
-- 5. v_bucket_spend mart (GOAL-13 / VIZ-01) — per-bucket (cost_center) tagged spend at
--    category grain per period, is_demo-partitioned. Serves the Brazil/Adventures tagged-spend
--    list + the per-bucket category donut. security_invoker = on (0008/0010) so an anon/RSC
--    `select` runs under the caller's role and the underlying transactions RLS applies
--    transitively. coalesce(t.is_demo,false) in SELECT + GROUP BY (0010 Mechanism A) so a demo
--    row and a real row are STRUCTURALLY different output rows — never summed into one (T-05-08).
--    The costs CTE inner-joins transactions, so anon (which cannot see is_demo=false rows) reads
--    ZERO real rows through the view (no-leak); demo cost rows surface after the Plan-09 seed.
-- ===========================================================================
create view public.v_bucket_spend
  with (security_invoker = on) as
with costs as (
  select
    c.period_key,
    coalesce(t.is_demo, false) as is_demo,
    t.cost_center,
    t.category_id,
    -t.amount_eur              as cost_amount
  from public.transactions t
  join public.dim_calendar c on c.date = t.booking_date
  where t.flow_type = 'cost'
)
select
  k.period_key,
  coalesce(k.is_demo, false)                     as is_demo,
  k.cost_center,
  k.category_id,
  coalesce(cat.name, 'Uncategorized')            as category_label,
  coalesce(sum(k.cost_amount), 0)::numeric(14,2) as costs
from costs k
left join public.categories cat on cat.id = k.category_id
group by k.period_key, coalesce(k.is_demo, false), k.cost_center, k.category_id, cat.name;
--> statement-breakpoint
