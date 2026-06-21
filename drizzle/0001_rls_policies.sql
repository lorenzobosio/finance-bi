-- 0001_rls_policies — Row Level Security for EVERY public table (D-08, D-11, D-15).
--
-- Model (D-15): RLS grants FULL read/write to any AUTHENTICATED user whose email is on
-- the 2-email allowlist. The allowlist is the ONLY access wall; cost_center is an
-- analytical label, never an access boundary. Both users see everything.
--
-- Performance: `auth.jwt()` is wrapped in `(select ...)` so Postgres caches it as an
-- initplan once per query instead of re-evaluating per row (Supabase's documented pattern).
--
-- ALLOWLIST — keep these 2 emails in sync with the app-layer `ALLOWED_EMAILS` env
-- (Plan 03 middleware). Emails are lowercased to match the JWT claim. They are not
-- secret, so hardcoding them in this version-controlled migration is intentional (A5):
--   redacted@example.com
--   redacted@example.com
--
-- Every one of the 13 tables gets: ENABLE ROW LEVEL SECURITY + one `for all to
-- authenticated` allowlist policy. No table ships without a policy (T-00-04).

-- members
alter table public.members enable row level security;
create policy "allowlist_all" on public.members
  for all to authenticated
  using      ( (select auth.jwt() ->> 'email') in ('redacted@example.com','redacted@example.com') )
  with check ( (select auth.jwt() ->> 'email') in ('redacted@example.com','redacted@example.com') );
--> statement-breakpoint

-- accounts
alter table public.accounts enable row level security;
create policy "allowlist_all" on public.accounts
  for all to authenticated
  using      ( (select auth.jwt() ->> 'email') in ('redacted@example.com','redacted@example.com') )
  with check ( (select auth.jwt() ->> 'email') in ('redacted@example.com','redacted@example.com') );
--> statement-breakpoint

-- connections
alter table public.connections enable row level security;
create policy "allowlist_all" on public.connections
  for all to authenticated
  using      ( (select auth.jwt() ->> 'email') in ('redacted@example.com','redacted@example.com') )
  with check ( (select auth.jwt() ->> 'email') in ('redacted@example.com','redacted@example.com') );
--> statement-breakpoint

-- transactions
alter table public.transactions enable row level security;
create policy "allowlist_all" on public.transactions
  for all to authenticated
  using      ( (select auth.jwt() ->> 'email') in ('redacted@example.com','redacted@example.com') )
  with check ( (select auth.jwt() ->> 'email') in ('redacted@example.com','redacted@example.com') );
--> statement-breakpoint

-- categories
alter table public.categories enable row level security;
create policy "allowlist_all" on public.categories
  for all to authenticated
  using      ( (select auth.jwt() ->> 'email') in ('redacted@example.com','redacted@example.com') )
  with check ( (select auth.jwt() ->> 'email') in ('redacted@example.com','redacted@example.com') );
--> statement-breakpoint

-- rules
alter table public.rules enable row level security;
create policy "allowlist_all" on public.rules
  for all to authenticated
  using      ( (select auth.jwt() ->> 'email') in ('redacted@example.com','redacted@example.com') )
  with check ( (select auth.jwt() ->> 'email') in ('redacted@example.com','redacted@example.com') );
--> statement-breakpoint

-- budgets
alter table public.budgets enable row level security;
create policy "allowlist_all" on public.budgets
  for all to authenticated
  using      ( (select auth.jwt() ->> 'email') in ('redacted@example.com','redacted@example.com') )
  with check ( (select auth.jwt() ->> 'email') in ('redacted@example.com','redacted@example.com') );
--> statement-breakpoint

-- investment_contributions
alter table public.investment_contributions enable row level security;
create policy "allowlist_all" on public.investment_contributions
  for all to authenticated
  using      ( (select auth.jwt() ->> 'email') in ('redacted@example.com','redacted@example.com') )
  with check ( (select auth.jwt() ->> 'email') in ('redacted@example.com','redacted@example.com') );
--> statement-breakpoint

-- goals
alter table public.goals enable row level security;
create policy "allowlist_all" on public.goals
  for all to authenticated
  using      ( (select auth.jwt() ->> 'email') in ('redacted@example.com','redacted@example.com') )
  with check ( (select auth.jwt() ->> 'email') in ('redacted@example.com','redacted@example.com') );
--> statement-breakpoint

-- milestones
alter table public.milestones enable row level security;
create policy "allowlist_all" on public.milestones
  for all to authenticated
  using      ( (select auth.jwt() ->> 'email') in ('redacted@example.com','redacted@example.com') )
  with check ( (select auth.jwt() ->> 'email') in ('redacted@example.com','redacted@example.com') );
--> statement-breakpoint

-- balances
alter table public.balances enable row level security;
create policy "allowlist_all" on public.balances
  for all to authenticated
  using      ( (select auth.jwt() ->> 'email') in ('redacted@example.com','redacted@example.com') )
  with check ( (select auth.jwt() ->> 'email') in ('redacted@example.com','redacted@example.com') );
--> statement-breakpoint

-- insights
alter table public.insights enable row level security;
create policy "allowlist_all" on public.insights
  for all to authenticated
  using      ( (select auth.jwt() ->> 'email') in ('redacted@example.com','redacted@example.com') )
  with check ( (select auth.jwt() ->> 'email') in ('redacted@example.com','redacted@example.com') );
--> statement-breakpoint

-- dim_calendar
alter table public.dim_calendar enable row level security;
create policy "allowlist_all" on public.dim_calendar
  for all to authenticated
  using      ( (select auth.jwt() ->> 'email') in ('redacted@example.com','redacted@example.com') )
  with check ( (select auth.jwt() ->> 'email') in ('redacted@example.com','redacted@example.com') );
