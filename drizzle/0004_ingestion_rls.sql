-- 0004_ingestion_rls — Row Level Security for the Phase-1 tables (D-08, D-11, D-15).
--
-- Phase 1 adds two new public tables: `import_batches` (a privileged ingestion audit/
-- heartbeat write target — T-01-07) and `cost_centers` (the extensible cost-center
-- lookup, D-24). No table ships without RLS, so BOTH get ENABLE ROW LEVEL SECURITY + the
-- SAME allowlist policy every other table uses, in this SAME migration.
--
-- The policy is copied VERBATIM from 0001_rls_policies.sql: full read/write to any
-- authenticated user whose JWT email is in `app_allowlist`, resolved through the
-- SECURITY DEFINER oracle public.is_email_allowed(). There is NO email literal here.
-- The JWT email is resolved once via `(select auth.jwt() ->> 'email')` so Postgres caches
-- it as an initplan (Supabase's documented per-query pattern).
--
-- Schema-wide grants already exist: 0001 ran `alter default privileges in schema public`
-- for anon/authenticated/service_role, so these new tables inherited the table-level
-- privileges on creation. Only the per-table RLS enable + policy is needed here.

-- import_batches — privileged ingestion audit/heartbeat (cron writes via service_role,
-- which BYPASSES RLS; the app reads under the user JWT, gated by the allowlist).
alter table public.import_batches enable row level security;
--> statement-breakpoint
create policy "allowlist_all" on public.import_batches
  for all to authenticated
  using      ( public.is_email_allowed((select auth.jwt() ->> 'email')) )
  with check ( public.is_email_allowed((select auth.jwt() ->> 'email')) );
--> statement-breakpoint

-- cost_centers — the extensible analytical-label lookup (D-24). Analytical label only,
-- NEVER an access boundary; RLS still gates it on the same allowlist like every table.
alter table public.cost_centers enable row level security;
--> statement-breakpoint
create policy "allowlist_all" on public.cost_centers
  for all to authenticated
  using      ( public.is_email_allowed((select auth.jwt() ->> 'email')) )
  with check ( public.is_email_allowed((select auth.jwt() ->> 'email')) );
