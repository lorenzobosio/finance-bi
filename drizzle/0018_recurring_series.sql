-- 0018_recurring_series — the FLOW-01 persistence layer: the `recurring_series` table (the source
-- of truth for the managed recurring list 09-03, the bills calendar 09-05, and the projection
-- 09-06) + the additive is_demo isolation triad. Landed through the project's owner-run BLOCKING
-- `pnpm db:migrate` (every migration since 0010 needs the real DATABASE_URL).
--
-- HAND-WRITTEN, like 0010–0017: this project stopped running `drizzle-kit generate` after 0009 —
-- the migration journal (drizzle/meta/_journal.json) is hand-maintained past idx 9 (sequential
-- +1000 `when` stamps) and every migration since 0010 hand-writes its DDL + RLS in ONE file (the
-- 0001/0002 DDL-vs-RLS convention). This file follows that convention verbatim so `drizzle-kit
-- migrate` applies it and records idx 18. src/lib/db/schema.ts carries the matching
-- `recurringSeries` pgTable as the DDL source of truth (documentation + future CLI); RLS is not
-- Drizzle-managed (hand-written here only, like every policy since 0001).
--
-- SECURITY — the load-bearing invariant (T-09-01, the one-token boundary): `recurring_series`
-- holds real household subscription LABELS + AMOUNTS → the ADDITIVE anon SELECT policy MUST be the
-- is_demo-scoped `using ( is_demo = true )` — NEVER an always-true predicate (a one-line
-- `using (true)` typo would publish every real bill label/amount to the public CV repo — the
-- 0013/0017 leak boundary). SELECT-ONLY for anon: no anon insert/update/delete policy → anon reads
-- the bounded is_demo=true partition (the PII-free seeded demo series) and writes NOTHING (T-09-06).
-- The `allowlist_all for all to authenticated` policy is the ONLY path a real user reads/writes real
-- series (RLS is the authorization wall; anon and authenticated policies never interact).
--
-- NO real seed here — real series are user-confirmed (09-03 write plane); the PII-free demo series
-- are seeded by scripts/seed-demo.ts (is_demo=true). NO PII / email / IBAN / owner-name literal —
-- static DDL only (T-09-02).

-- ===========================================================================
-- 1. recurring_series — the FLOW-01 table (mirrors src/lib/db/schema.ts recurringSeries).
--    series_key = the stable cluster key (normalized counterparty + amount) the detector emits and
--    confirm/dismiss idempotency keys on. amount_eur numeric(14,2) (never a float — comparability).
--    cadence = 'weekly' | 'monthly' | 'yearly'; next_date is nullable (a just-detected candidate may
--    have no computed next occurrence yet). status defaults 'active' ('active' | 'dismissed').
--    category is the OPTIONAL per-series taxonomy label (A6 — added now to avoid a second migration).
--    is_income (D-08) distinguishes an income series (salary) from a bill so the calendar/projection
--    lane them apart. is_demo `not null default false` → any existing/ingested writer keeps writing
--    is_demo=false rows unchanged; it is the column the anon policy below filters on.
-- ===========================================================================
create table public.recurring_series (
  id uuid primary key default gen_random_uuid(),
  series_key text not null,
  label text not null,
  amount_eur numeric(14,2) not null,
  cadence text not null,
  next_date date,
  status text not null default 'active',
  category text,
  is_income boolean not null default false,
  is_demo boolean not null default false
);
--> statement-breakpoint

-- ===========================================================================
-- 2. RLS + the authenticated allowlist policy — copied verbatim from the 0001 pattern. Enable RLS
--    (no table ships without it) then the single `allowlist_all for all to authenticated` policy
--    gating on the 2-email allowlist (`public.is_email_allowed((select auth.jwt() ->> 'email'))` in
--    both `using` and `with check` — the initplan-cached select wrapper is the documented Supabase
--    performance pattern). This is the ONLY path a real user reads/writes real (is_demo=false) series.
-- ===========================================================================
alter table public.recurring_series enable row level security;
--> statement-breakpoint
create policy "allowlist_all" on public.recurring_series
  for all to authenticated
  using      ( public.is_email_allowed((select auth.jwt() ->> 'email')) )
  with check ( public.is_email_allowed((select auth.jwt() ->> 'email')) );
--> statement-breakpoint

-- ===========================================================================
-- 3. Anon SELECT policy — the ADDITIVE public-demo surface (0011/0014/0015/0016/0017 pattern).
--    CRITICAL LEAK GUARD: `recurring_series` holds real subscription labels/amounts, so the predicate
--    MUST be the is_demo-scoped `using ( is_demo = true )` — NEVER an always-true predicate (a
--    catastrophic permanent leak in a public CV repo — the T-09-01 boundary). SELECT-ONLY: no anon
--    insert/update/delete policy → anon reads the bounded is_demo=true partition (the seeded demo
--    series) and writes NOTHING (RLS denies every anon write / T-09-06).
-- ===========================================================================
create policy "demo_anon_read" on public.recurring_series
  for select to anon using ( is_demo = true );
--> statement-breakpoint
