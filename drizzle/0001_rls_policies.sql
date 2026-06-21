-- 0001_rls_policies — Row Level Security for EVERY public table (D-08, D-11, D-15).
--
-- Phase-0 hardening: the allowlist is now DATA, not code. There is NO email literal in
-- this file. Access is gated on `public.is_email_allowed(<jwt email>)`, which checks the
-- caller's email against the `app_allowlist` table. That table is seeded at deploy time
-- from the `ALLOWED_EMAILS` env (scripts/seed-allowlist.ts) — never from committed SQL —
-- so this version-controlled migration is safe to publish.
--
-- Model (D-15): RLS grants FULL read/write to any AUTHENTICATED user whose email is in
-- `app_allowlist`. The allowlist is the ONLY access wall; cost_center is an analytical
-- label, never an access boundary. Both users see everything.
--
-- Why a SECURITY DEFINER function:
--   RLS on `app_allowlist` is ENABLED too (no table ships without RLS — T-00-04). A policy
--   that did `where email in (select email from app_allowlist)` inline would re-trigger
--   app_allowlist's own RLS and recurse. `public.is_email_allowed()` runs as its OWNER
--   (SECURITY DEFINER), bypassing RLS on app_allowlist, so the data-table policies can
--   consult the allowlist without recursion. The function body sets an empty search_path
--   to prevent search-path hijacking of a SECURITY DEFINER routine.
--
-- Performance: the JWT email is resolved once via `(select auth.jwt() ->> 'email')` so
-- Postgres caches it as an initplan per query instead of re-evaluating per row (Supabase's
-- documented pattern). The function call itself is STABLE so the planner can cache it too.
--
-- Every one of the 14 tables (13 data tables + app_allowlist) gets: ENABLE ROW LEVEL
-- SECURITY + one `for all to authenticated` allowlist policy. No table ships without one.

-- ---------------------------------------------------------------------------
-- Supabase role grants. Supabase normally grants table/sequence privileges to the
-- `anon` / `authenticated` / `service_role` roles via schema-level DEFAULT PRIVILEGES.
-- Because this project rebuilds the `public` schema from scratch (fresh-DB reset), those
-- grants are re-asserted HERE so a clean `drizzle-kit migrate` always restores them.
-- RLS still enforces row-level access on top of these table-level privileges; without the
-- grants, an authenticated caller gets "permission denied for table" before RLS even runs.
-- `service_role` keeps full access and BYPASSES RLS by design (server-only key).
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated, service_role;
--> statement-breakpoint
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
--> statement-breakpoint
grant all on all tables in schema public to service_role;
--> statement-breakpoint
grant usage, select on all sequences in schema public to anon, authenticated, service_role;
--> statement-breakpoint
-- Future tables created in this schema inherit the same grants.
alter default privileges in schema public
  grant select, insert, update, delete on tables to anon, authenticated;
--> statement-breakpoint
alter default privileges in schema public
  grant all on tables to service_role;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Allowlist lookup function (SECURITY DEFINER — bypasses RLS on app_allowlist).
-- ---------------------------------------------------------------------------
create or replace function public.is_email_allowed(check_email text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.app_allowlist a
    where a.email = lower(check_email)
  );
$$;
--> statement-breakpoint

-- The function is the access oracle for the policies. `authenticated` and `anon` may call
-- it (anon callers still see nothing — every data policy also requires the `authenticated`
-- role — but granting execute keeps the function usable from any RLS context).
revoke all on function public.is_email_allowed(text) from public;
--> statement-breakpoint
grant execute on function public.is_email_allowed(text) to authenticated, anon;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- app_allowlist — RLS ENABLED (no table is exempt). Allowlisted users may read/manage
-- the allowlist; the SECURITY DEFINER function above is what lets the OTHER tables'
-- policies consult it without recursing through this policy.
-- ---------------------------------------------------------------------------
alter table public.app_allowlist enable row level security;
create policy "allowlist_all" on public.app_allowlist
  for all to authenticated
  using      ( public.is_email_allowed((select auth.jwt() ->> 'email')) )
  with check ( public.is_email_allowed((select auth.jwt() ->> 'email')) );
--> statement-breakpoint

-- members
alter table public.members enable row level security;
create policy "allowlist_all" on public.members
  for all to authenticated
  using      ( public.is_email_allowed((select auth.jwt() ->> 'email')) )
  with check ( public.is_email_allowed((select auth.jwt() ->> 'email')) );
--> statement-breakpoint

-- accounts
alter table public.accounts enable row level security;
create policy "allowlist_all" on public.accounts
  for all to authenticated
  using      ( public.is_email_allowed((select auth.jwt() ->> 'email')) )
  with check ( public.is_email_allowed((select auth.jwt() ->> 'email')) );
--> statement-breakpoint

-- connections
alter table public.connections enable row level security;
create policy "allowlist_all" on public.connections
  for all to authenticated
  using      ( public.is_email_allowed((select auth.jwt() ->> 'email')) )
  with check ( public.is_email_allowed((select auth.jwt() ->> 'email')) );
--> statement-breakpoint

-- transactions
alter table public.transactions enable row level security;
create policy "allowlist_all" on public.transactions
  for all to authenticated
  using      ( public.is_email_allowed((select auth.jwt() ->> 'email')) )
  with check ( public.is_email_allowed((select auth.jwt() ->> 'email')) );
--> statement-breakpoint

-- categories
alter table public.categories enable row level security;
create policy "allowlist_all" on public.categories
  for all to authenticated
  using      ( public.is_email_allowed((select auth.jwt() ->> 'email')) )
  with check ( public.is_email_allowed((select auth.jwt() ->> 'email')) );
--> statement-breakpoint

-- rules
alter table public.rules enable row level security;
create policy "allowlist_all" on public.rules
  for all to authenticated
  using      ( public.is_email_allowed((select auth.jwt() ->> 'email')) )
  with check ( public.is_email_allowed((select auth.jwt() ->> 'email')) );
--> statement-breakpoint

-- budgets
alter table public.budgets enable row level security;
create policy "allowlist_all" on public.budgets
  for all to authenticated
  using      ( public.is_email_allowed((select auth.jwt() ->> 'email')) )
  with check ( public.is_email_allowed((select auth.jwt() ->> 'email')) );
--> statement-breakpoint

-- investment_contributions
alter table public.investment_contributions enable row level security;
create policy "allowlist_all" on public.investment_contributions
  for all to authenticated
  using      ( public.is_email_allowed((select auth.jwt() ->> 'email')) )
  with check ( public.is_email_allowed((select auth.jwt() ->> 'email')) );
--> statement-breakpoint

-- goals
alter table public.goals enable row level security;
create policy "allowlist_all" on public.goals
  for all to authenticated
  using      ( public.is_email_allowed((select auth.jwt() ->> 'email')) )
  with check ( public.is_email_allowed((select auth.jwt() ->> 'email')) );
--> statement-breakpoint

-- milestones
alter table public.milestones enable row level security;
create policy "allowlist_all" on public.milestones
  for all to authenticated
  using      ( public.is_email_allowed((select auth.jwt() ->> 'email')) )
  with check ( public.is_email_allowed((select auth.jwt() ->> 'email')) );
--> statement-breakpoint

-- balances
alter table public.balances enable row level security;
create policy "allowlist_all" on public.balances
  for all to authenticated
  using      ( public.is_email_allowed((select auth.jwt() ->> 'email')) )
  with check ( public.is_email_allowed((select auth.jwt() ->> 'email')) );
--> statement-breakpoint

-- insights
alter table public.insights enable row level security;
create policy "allowlist_all" on public.insights
  for all to authenticated
  using      ( public.is_email_allowed((select auth.jwt() ->> 'email')) )
  with check ( public.is_email_allowed((select auth.jwt() ->> 'email')) );
--> statement-breakpoint

-- dim_calendar
alter table public.dim_calendar enable row level security;
create policy "allowlist_all" on public.dim_calendar
  for all to authenticated
  using      ( public.is_email_allowed((select auth.jwt() ->> 'email')) )
  with check ( public.is_email_allowed((select auth.jwt() ->> 'email')) );
