-- 0008_marts_rls — close the access-control + integrity gaps the 0007 marts open.
--
-- TWO jobs, both correctness requirements (T-00-04: no new object ships without RLS):
--
--  1. RLS on every new VIEW. A Postgres view does NOT carry its own RLS policy; instead it
--     inherits the RLS of its UNDERLYING tables WHEN created with `security_invoker = on`
--     (PG 15+). With security_invoker on, an RSC `select v_*` runs under the CALLER's JWT, so
--     the existing `allowlist_all for all to authenticated` policies on transactions/budgets/
--     categories/accounts/cost_centers/balances/dim_calendar (0001) gate the read — the
--     2-email allowlist applies to every mart (T-02-07). The 7 views in 0007 are already
--     created `with (security_invoker = on)`; this migration RE-ASSERTS that control
--     idempotently so the invariant is explicit + verifiable here (and survives a view that
--     might later be recreated without the flag).
--
--  2. The balances UNIQUE(account_id, as_of_date) integrity constraint. balances had only a
--     non-unique account_id index, so a concurrent cron run could insert a duplicate snapshot
--     for the same account/day — and the balance-trend mart assumes ONE row per account/day
--     (Pattern 10 landmine). The UNIQUE constraint + upsertBalance's check-then-write
--     (scripts/ingest.ts) make the daily capture idempotent (T-02-09). The constraint name
--     mirrors the schema.ts uniqueIndex('balances_account_date_uq').
--
-- NO PII, NO € amounts, NO real names — static DDL only (T-02-10).

-- ---------------------------------------------------------------------------
-- 1. Re-assert security_invoker = on for each of the 7 marts (RLS control per view).
--    Idempotent: `alter view … set` is safe to re-run. This is the per-object RLS control
--    the allowlist relies on — every view below runs under the caller's JWT, never the view
--    owner's, so the underlying-table allowlist policies apply to RSC reads.
-- ---------------------------------------------------------------------------
alter view public.v_sublet_pnl         set (security_invoker = on);
--> statement-breakpoint
alter view public.v_pnl_monthly        set (security_invoker = on);
--> statement-breakpoint
alter view public.v_costcenter_bva     set (security_invoker = on);
--> statement-breakpoint
alter view public.v_category_breakdown set (security_invoker = on);
--> statement-breakpoint
alter view public.v_pct_of_revenue     set (security_invoker = on);
--> statement-breakpoint
alter view public.v_balance_trend      set (security_invoker = on);
--> statement-breakpoint
alter view public.v_home_kpis          set (security_invoker = on);
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 2. balances UNIQUE(account_id, as_of_date) — one snapshot per account/day (Pattern 10).
--    Matches schema.ts uniqueIndex('balances_account_date_uq'). A unique INDEX (not a table
--    CONSTRAINT) so it mirrors the Drizzle uniqueIndex and is a valid ON CONFLICT target if
--    upsertBalance is ever switched to ON CONFLICT. `if not exists` keeps the migration
--    re-runnable; balances must already be free of duplicate (account_id, as_of_date) rows
--    for the index to build (upsertBalance has always written one row per pair, so the live
--    data is clean).
-- ---------------------------------------------------------------------------
create unique index if not exists "balances_account_date_uq"
  on public.balances ("account_id", "as_of_date");
--> statement-breakpoint
