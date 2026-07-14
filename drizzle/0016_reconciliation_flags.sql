-- 0016_reconciliation_flags — the ONE new Phase-7 DB object: a demo-partitioned
-- discrepancy ledger (D-01) the reconcile engine (07-03 cron) writes when a balance
-- delta or a mart-vs-ledger mismatch is detected. Landed through the project's owner-run
-- BLOCKING `pnpm db:migrate` (every migration since 0010 needs the real DATABASE_URL).
--
-- HAND-WRITTEN, like 0010–0015: this project stopped running `drizzle-kit generate` after
-- 0009 — the migration journal (drizzle/meta/_journal.json) is hand-maintained past idx 9
-- (sequential +1000 `when` stamps) and every migration since 0010 hand-writes its DDL + RLS +
-- seeds in ONE file (the 0001/0002 DDL-vs-RLS/seed convention). This file follows that
-- convention verbatim so `drizzle-kit migrate` applies it and records idx 16. src/lib/db/schema.ts
-- carries the matching Drizzle table def as the DDL source of truth (documentation + future CLI).
--
-- SECURITY — the load-bearing invariant (T-07-02/03/04): reconciliation_flags holds the real
-- household's balance/mart DISCREPANCIES → it gets RLS ENABLED + the 0001 allowlist_all policy AND
-- the EXACT 0011/0014/0015 anon predicate `using ( is_demo = true )` — NEVER an always-true
-- predicate (a one-line `using (true)` typo publishes every real discrepancy to the public CV
-- repo — the T-05-01 leak boundary). SELECT-ONLY anon policy → anon reads the bounded is_demo=true
-- partition (empty: the public demo is authored fully-reconciled) and writes NOTHING. New tables
-- inherit the anon/authenticated/service_role grants from the 0001 `alter default privileges`.
--
-- NO PII, NO email/IBAN/owner-name literal — numeric deltas + account_id + period + kind only
-- (T-07-04): NO description/counterparty/name column ever lands here.

-- ===========================================================================
-- 1. Table (DDL — mirrors src/lib/db/schema.ts). Per-account/period discrepancy row.
-- ===========================================================================

-- reconciliation_flags — the per-account/period discrepancy ledger (D-01). DEMO-BEARING:
-- real flags carry is_demo=false; the public demo is authored fully-reconciled (0 open flags,
-- the non-shame demo) so it seeds NONE. account_id is NULLABLE — a household/mart-level flag
-- (mart_vs_ledger) has no single owning account. period_key is the YYYYMM join key (0002).
--   kind          : 'balance_delta' (bank balance vs derived ledger) | 'mart_vs_ledger' (mart total vs source)
--   expected_eur  : what the trusted side says (numeric(14,2) — the Money convention)
--   actual_eur    : what the compared side says
--   delta_eur     : actual − expected (signed; the surfaced discrepancy magnitude)
--   status        : 'open' (unresolved) | 'resolved' (acknowledged/closed)
create table public.reconciliation_flags (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid references public.accounts(id),
  period_key   integer      not null,
  kind         text         not null,
  expected_eur numeric(14,2) not null,
  actual_eur   numeric(14,2) not null,
  delta_eur    numeric(14,2) not null,
  status       text         not null default 'open',
  detected_at  timestamptz  not null default now(),
  is_demo      boolean      not null default false
);
--> statement-breakpoint

-- ===========================================================================
-- 2. Seed — NONE. Flags are written by the reconcile cron (07-03), never seeded.
--    The public demo is authored fully-reconciled (0 open flags — the non-shame demo),
--    so there is NO is_demo=true seed row either (mirrors how 0015 documents its seed choice).
-- ===========================================================================

-- ===========================================================================
-- 3. RLS — enable + the 0001 allowlist_all `for all to authenticated`.
--    A table without RLS enabled bypasses the allowlist entirely (T-05-07 / T-07-03).
-- ===========================================================================
alter table public.reconciliation_flags enable row level security;
--> statement-breakpoint
create policy "allowlist_all" on public.reconciliation_flags
  for all to authenticated
  using      ( public.is_email_allowed((select auth.jwt() ->> 'email')) )
  with check ( public.is_email_allowed((select auth.jwt() ->> 'email')) );
--> statement-breakpoint

-- ===========================================================================
-- 4. Anon SELECT policy — the ADDITIVE public-demo surface (0011/0014/0015 pattern).
--    CRITICAL LEAK GUARD: reconciliation_flags holds the real household's balance/mart
--    discrepancies, so the predicate MUST be the is_demo-scoped `using ( is_demo = true )` —
--    NEVER an always-true predicate (a catastrophic permanent leak in a public CV repo — the
--    T-07-02 boundary). SELECT-ONLY: no anon insert/update/delete policy → anon reads the bounded
--    is_demo=true partition (empty: the demo is fully-reconciled) and writes NOTHING (RLS denies
--    every anon write / T-07-03).
-- ===========================================================================
create policy "demo_anon_read" on public.reconciliation_flags
  for select to anon using ( is_demo = true );
--> statement-breakpoint
