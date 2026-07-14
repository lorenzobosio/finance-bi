-- 0017_accounts_summary — the ACC-01 data foundation: `accounts.is_demo` + an is_demo-scoped
-- anon SELECT policy + the `v_account_summary` latest-CLBD-per-account mart. Landed through the
-- project's owner-run BLOCKING `pnpm db:migrate` (every migration since 0010 needs the real
-- DATABASE_URL).
--
-- HAND-WRITTEN, like 0010–0016: this project stopped running `drizzle-kit generate` after 0009 —
-- the migration journal (drizzle/meta/_journal.json) is hand-maintained past idx 9 (sequential
-- +1000 `when` stamps) and every migration since 0010 hand-writes its DDL + RLS + views in ONE
-- file (the 0001/0002 DDL-vs-RLS/view convention). This file follows that convention verbatim so
-- `drizzle-kit migrate` applies it and records idx 17. src/lib/db/schema.ts carries the matching
-- accounts.is_demo column as the DDL source of truth (documentation + future CLI); views are not
-- Drizzle-managed (like v_balance_trend, v_bucket_spend — hand-written here only).
--
-- WHY a migration at all (overriding CONTEXT D-02's "likely no migration" lean, RESEARCH Pitfall 2):
-- since 0013 `accounts` is deliberately anon-EXCLUDED (it holds real account names/IBANs with no
-- is_demo column to partition on), so a naive anon `/accounts` read renders ZERO cards on the public
-- demo — the exact "€0 across the board" regression 0013 fixed for the marts. This migration re-opens
-- `accounts` to anon SAFELY, scoped to the demo partition via a new is_demo column.
--
-- SECURITY — the load-bearing invariant (T-08-03/04): `accounts` holds real account NAMES (and may
-- hold IBANs) → the ADDITIVE anon SELECT policy MUST be the is_demo-scoped `using ( is_demo = true )`
-- — NEVER an always-true predicate (a one-line `using (true)` typo would publish every real account
-- name/IBAN to the public CV repo — the 0013 leak boundary this reopens). SELECT-ONLY: no anon
-- insert/update/delete policy → anon reads the bounded is_demo=true partition and writes NOTHING. The
-- existing 0001 `allowlist_all for all to authenticated` is UNTOUCHED (a different role path — anon
-- and authenticated policies never interact). `v_account_summary` is `security_invoker = on` so an
-- anon `select v_account_summary` runs under the anon role and the accounts + balances anon
-- is_demo=true policies apply TRANSITIVELY — real account names never reach anon through the view.
--
-- NO PII, NO email/IBAN/owner-name literal — static DDL only (T-08-06).

-- ===========================================================================
-- 1. accounts.is_demo — the partition column (mirrors src/lib/db/schema.ts).
--    `not null default false` → the existing 4 real accounts backfill to false with NO data
--    migration; ingestion (which never sets is_demo) keeps writing is_demo=false accounts
--    unchanged (A4). This column is what the anon policy below filters on.
-- ===========================================================================
alter table public.accounts add column is_demo boolean not null default false;
--> statement-breakpoint

-- ===========================================================================
-- 2. Anon SELECT policy — the ADDITIVE public-demo surface (0011/0014/0015/0016 pattern).
--    CRITICAL LEAK GUARD: `accounts` holds real account names, so the predicate MUST be the
--    is_demo-scoped `using ( is_demo = true )` — NEVER an always-true predicate (a catastrophic
--    permanent leak in a public CV repo — the T-08-03 boundary). SELECT-ONLY: no anon
--    insert/update/delete policy → anon reads the bounded is_demo=true partition (the 4 seeded demo
--    accounts) and writes NOTHING (RLS denies every anon write / T-08-03). RLS is already ENABLED on
--    `accounts` (0001) with the untouched `allowlist_all for all to authenticated`.
-- ===========================================================================
create policy "demo_anon_read" on public.accounts
  for select to anon using ( is_demo = true );
--> statement-breakpoint

-- ===========================================================================
-- 3. v_account_summary — latest-CLBD-balance-per-account mart the /accounts page reads (ACC-01).
--    `security_invoker = on` (byte-identical to 0007/0010) so an anon/RSC `select v_account_summary`
--    runs under the CALLER's role: the accounts anon policy (§2, is_demo=true) + the balances anon
--    policy (0011, is_demo=true) cap anon to the demo partition TRANSITIVELY — real account
--    names/balances never reach anon. The view exposes NO email/IBAN — only name + the latest
--    balance for the demo partition.
--
--    latest: pick the newest snapshot per (account_id, is_demo) via
--    `row_number() over (partition by b.account_id, b.is_demo order by b.as_of_date desc)` (the
--    0010 v_balance_trend latest-snapshot pattern), take rn=1. The driving table is `accounts` with
--    a LEFT JOIN onto `latest` pinned on (account_id, is_demo), so:
--      - every account appears exactly once per partition (no partition crossing — a demo balance
--        never feeds a real account and vice-versa, the is_demo chokepoint);
--      - an account with NO snapshot (the virtual Investing account) yields current_balance = NULL
--        and as_of_date = NULL — its card value is substituted from the Goal engine in 08-03
--        (Pitfall 8). No coalesce/zero-fill is needed here: unlike the dim_calendar-spine marts,
--        anon simply cannot SEE real accounts (RLS filters the whole row), so there is no
--        false-partition row to zero-fill.
--    Columns (declared verbatim in src/lib/database.types.ts for the DAT-03 drift gate — the gate
--    checks the NAME set for v_* views, nullability is view-exempt in types-drift-core):
--      account_id, name, default_cost_center, is_investment, is_demo, current_balance, as_of_date.
-- ===========================================================================
create view public.v_account_summary
  with (security_invoker = on) as
with latest as (
  select
    b.account_id,
    b.is_demo,
    b.balance_eur,
    b.as_of_date,
    row_number() over (
      partition by b.account_id, b.is_demo
      order by b.as_of_date desc
    ) as rn
  from public.balances b
)
select
  a.id                            as account_id,
  a.name                          as name,
  a.default_cost_center           as default_cost_center,
  a.is_investment                 as is_investment,
  a.is_demo                       as is_demo,
  l.balance_eur::numeric(14,2)    as current_balance,
  l.as_of_date::text              as as_of_date
from public.accounts a
left join latest l
  on l.account_id = a.id
 and l.is_demo    = a.is_demo
 and l.rn         = 1;
--> statement-breakpoint
