-- 0020_fx_rates — the MULTICURRENCY / REMITTANCE persistence layer (ETF-03 / BRL-01, D-01): the
-- `fx_rates` table (the source of truth for the ECB daily reference rates the convert/remittance
-- engines read, 12-03) + the additive is_demo isolation triad. Landed through the project's owner-run
-- BLOCKING `pnpm db:migrate` (every migration since 0010 needs the real DATABASE_URL).
--
-- HAND-WRITTEN, like 0010–0019: this project stopped running `drizzle-kit generate` after 0009 —
-- the migration journal (drizzle/meta/_journal.json) is hand-maintained past idx 9 (sequential
-- +1000 `when` stamps) and every migration since 0010 hand-writes its DDL + RLS in ONE file (the
-- 0001/0002 DDL-vs-RLS convention). This file follows that convention verbatim so `drizzle-kit
-- migrate` applies it and records idx 20. src/lib/db/schema.ts carries the matching `fxRates`
-- pgTable as the DDL source of truth (documentation + future CLI); RLS is not Drizzle-managed
-- (hand-written here only, like every policy since 0001).
--
-- SHAPE (D-01, A5): a rate is quote-per-EUR (base 'EUR', quote 'USD'|'BRL', rate = 1 EUR in quote).
-- `rate` is numeric(18,6) — a HIGHER scale than money's numeric(14,2) — so a 6-dp reference rate never
-- loses precision on the EUR→quote multiply (Pitfall 1). NEVER a float.
--
-- SECURITY — the load-bearing invariant (T-12-03, the anon predicate boundary): `fx_rates` is PII-free
-- (base + quote + date + numeric rate only — no email/IBAN/owner name, T-12-04), but the ADDITIVE anon
-- SELECT policy MUST STILL be the is_demo-scoped `using ( is_demo = true )` — NEVER an always-true
-- predicate (a one-line `using (true)` typo is the catastrophic-leak boundary the 0013/0017/0018 triad
-- guards; the triad discipline is mandatory on every table regardless of content, D-08). SELECT-ONLY
-- for anon: no anon insert/update/delete policy → anon reads the bounded is_demo=true partition (the
-- PII-free seeded demo rates) and writes NOTHING (T-12-05). The `allowlist_all for all to authenticated`
-- policy is the ONLY path a real user reads/writes real (is_demo=false) rates (RLS is the authorization
-- wall; anon and authenticated policies never interact).
--
-- NO real seed here — real rates arrive via the keyless ECB feed (scripts/fetch-fx.ts, 12-05); the
-- PII-free demo rates are seeded by scripts/seed-demo.ts (is_demo=true). NO PII / email / IBAN /
-- owner-name literal — static DDL only (T-12-04).

-- ===========================================================================
-- 1. fx_rates — the ETF-03 / BRL-01 reference-rate table (mirrors src/lib/db/schema.ts fxRates).
--    base + quote name the pair (base 'EUR'); rate_date is the ECB publication date; rate
--    numeric(18,6) is quote-per-EUR (never a float — Pitfall 1). is_demo `not null default false` →
--    any real rate writer keeps writing is_demo=false rows unchanged; it is the column the anon policy
--    below filters on. The UNIQUE (base, quote, rate_date, is_demo) key makes the seed's + the ECB
--    pull's delete/upsert idempotent and keeps the real + demo partitions from colliding on the same
--    (pair, date).
-- ===========================================================================
create table public.fx_rates (
  id uuid primary key default gen_random_uuid(),
  base text not null,
  quote text not null,
  rate_date date not null,
  rate numeric(18,6) not null,
  is_demo boolean not null default false,
  unique (base, quote, rate_date, is_demo)
);
--> statement-breakpoint

-- ===========================================================================
-- 2. RLS + the authenticated allowlist policy — copied verbatim from the 0001 pattern. Enable RLS
--    (no table ships without it) then the single `allowlist_all for all to authenticated` policy
--    gating on the 2-email allowlist (`public.is_email_allowed((select auth.jwt() ->> 'email'))` in
--    both `using` and `with check` — the initplan-cached select wrapper is the documented Supabase
--    performance pattern). This is the ONLY path a real user reads/writes real (is_demo=false) rates.
-- ===========================================================================
alter table public.fx_rates enable row level security;
--> statement-breakpoint
create policy "allowlist_all" on public.fx_rates
  for all to authenticated
  using      ( public.is_email_allowed((select auth.jwt() ->> 'email')) )
  with check ( public.is_email_allowed((select auth.jwt() ->> 'email')) );
--> statement-breakpoint

-- ===========================================================================
-- 3. Anon SELECT policy — the ADDITIVE public-demo surface (0011/0014/0015/0016/0017/0018 pattern).
--    CRITICAL LEAK GUARD: the predicate MUST be the is_demo-scoped `using ( is_demo = true )` — NEVER
--    an always-true predicate (a `using (true)` typo is the permanent-leak boundary in a public CV
--    repo — the T-12-03 boundary; this table is PII-free but the triad discipline is mandatory, D-08).
--    SELECT-ONLY: no anon insert/update/delete policy → anon reads the bounded is_demo=true partition
--    (the seeded demo rates) and writes NOTHING (RLS denies every anon write / T-12-05).
-- ===========================================================================
create policy "demo_anon_read" on public.fx_rates
  for select to anon using ( is_demo = true );
--> statement-breakpoint
