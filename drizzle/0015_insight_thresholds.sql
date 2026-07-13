-- 0015_insight_thresholds — the ONE new Phase-6 DB object: a household-scoped,
-- is_demo-aware settings singleton holding the financial-health scorecard bands (D-07),
-- landed through the project's owner-run BLOCKING `pnpm db:migrate`.
--
-- HAND-WRITTEN, like 0010–0014: this project stopped running `drizzle-kit generate` after
-- 0009 — the migration journal (drizzle/meta/_journal.json) is hand-maintained past idx 9
-- (sequential +1000 `when` stamps) and every migration since 0010 hand-writes its DDL + RLS +
-- seeds in ONE file (the 0001/0002 DDL-vs-RLS/seed convention). This file follows that
-- convention verbatim so `drizzle-kit migrate` applies it and records idx 15. src/lib/db/schema.ts
-- carries the matching Drizzle table def as the DDL source of truth (documentation + future CLI).
--
-- SECURITY — the load-bearing invariant (Pitfall 4 / T-06-03/04): insight_thresholds is a
-- financial/household SETTINGS table → it gets RLS ENABLED + the 0001 allowlist_all policy AND
-- the EXACT 0011/0014 anon predicate `using ( is_demo = true )` — NEVER an always-true predicate
-- (a one-line typo publishes the real household config to the public CV repo — the T-05-01 leak
-- boundary). SELECT-ONLY anon policy → anon reads the bounded is_demo=true partition and writes
-- NOTHING. New tables inherit the anon/authenticated/service_role grants from the 0001
-- `alter default privileges` (no re-grant needed).
--
-- NO PII, NO email/IBAN/owner-name literal — static DDL + numeric seeds only (T-05-10).

-- ===========================================================================
-- 1. Table (DDL — mirrors src/lib/db/schema.ts). Singleton settings per partition.
-- ===========================================================================

-- insight_thresholds — the scorecard's editable healthy/watch/off-track bands (D-07).
-- DEMO-BEARING singleton: ONE is_demo=false row holds the real config (06-04 edits it);
-- the demo partition seeds NO row and relies on the code-side DEFAULT_BANDS fallback (06-03),
-- mirroring how `household` seeds no demo row and relies on PRE_LAUNCH_HOUSEHOLD.
--   savings_rate_*  : monthly (revenue−cost)/revenue band edges (healthy ≥0.20, watch ≥0.10, else off)
--   reserve_*       : months-of-cost cash-reserve band edges (healthy ≥6, watch ≥3, else off)
--   budget_over_*   : over-budget tolerance (≤10% over = watch, >10% over = off)
--   streak_watch_*  : contribution-miss tolerance (1 miss = watch, multiple = off)
create table public.insight_thresholds (
  id                    uuid primary key default gen_random_uuid(),
  savings_rate_healthy  numeric(6,4) not null,
  savings_rate_watch    numeric(6,4) not null,
  reserve_healthy       numeric(6,2) not null,
  reserve_watch         numeric(6,2) not null,
  budget_over_watch_pct numeric(6,4) not null,
  streak_watch_misses   integer      not null,
  is_demo               boolean      not null default false
);
--> statement-breakpoint

-- ===========================================================================
-- 2. Seed — exactly ONE default-bands row on the REAL partition (is_demo = false).
--    Idempotent: the guard skips the insert if a real row already exists (no unique key
--    on this singleton, so guard with NOT EXISTS rather than ON CONFLICT). NO is_demo=true
--    row — the demo partition uses the code-side DEFAULT_BANDS fallback (06-03).
-- ===========================================================================
insert into public.insight_thresholds
  (savings_rate_healthy, savings_rate_watch, reserve_healthy, reserve_watch, budget_over_watch_pct, streak_watch_misses, is_demo)
select 0.20, 0.10, 6, 3, 0.10, 1, false
where not exists (
  select 1 from public.insight_thresholds where is_demo = false
);
--> statement-breakpoint

-- ===========================================================================
-- 3. RLS — enable + the 0001 allowlist_all `for all to authenticated`.
--    A table without RLS enabled bypasses the allowlist entirely (T-05-07 / T-06-04).
-- ===========================================================================
alter table public.insight_thresholds enable row level security;
--> statement-breakpoint
create policy "allowlist_all" on public.insight_thresholds
  for all to authenticated
  using      ( public.is_email_allowed((select auth.jwt() ->> 'email')) )
  with check ( public.is_email_allowed((select auth.jwt() ->> 'email')) );
--> statement-breakpoint

-- ===========================================================================
-- 4. Anon SELECT policy — the ADDITIVE public-demo surface (0011/0014 pattern).
--    CRITICAL LEAK GUARD: insight_thresholds is a financial/household SETTINGS table, so the
--    predicate MUST be the is_demo-scoped `using ( is_demo = true )` — NEVER an always-true
--    predicate (a catastrophic permanent leak in a public CV repo). SELECT-ONLY: no anon
--    insert/update/delete policy → anon can read the bounded is_demo=true partition (empty
--    until a demo row is ever seeded) and write NOTHING (RLS denies every anon write / T-06-03).
-- ===========================================================================
create policy "demo_anon_read" on public.insight_thresholds
  for select to anon using ( is_demo = true );
--> statement-breakpoint
