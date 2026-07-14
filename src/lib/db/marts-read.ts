import "server-only";

// src/lib/db/marts-read.ts — the CACHEABLE, is_demo-PARTITIONED mart read seam (OBS-02, D-08).
//
// THE LOAD-BEARING INVARIANT (Pitfall 2 — the Phase-4 demo-isolation leak, reincarnated):
// `unstable_cache` is PROCESS-GLOBAL while `is_demo` is PER-REQUEST. Next FORBIDS reading the
// request cookie/header store inside a cached callback, so the request-scoped `@supabase/ssr`
// client + the cookie-based demo-read chokepoint CANNOT be used here. Instead the caller resolves
// the demo partition at the PAGE level and passes `isDemo` down as an explicit argument; that
// `isDemo` goes into BOTH the cache KEY and the cache TAG, and the callback filters
// `is_demo = <isDemo>` explicitly. If the key or tag omitted `isDemo`, a cached demo read could be
// served to a real user (or vice-versa) — real + demo figures blended (5,038 → 61,038, the exact
// UAT leak). `test/marts-read.test.ts` PINS that the real key/tag are NEVER equal to the demo ones.
//
// NON-REQUEST CLIENT (critical_steering 2): the callback reads via a direct `postgres`/DATABASE_URL
// connection (the project's Node-side read plane, mirroring scripts/ingest.ts + scripts/reconcile.ts)
// — NEVER the per-request cookie chokepoint / @supabase/ssr (Pitfall 2), and NEVER the Supabase
// service_role key. A direct DB connection runs as the connection role; the EXPLICIT
// `where is_demo = <isDemo>` filter is the isolation control at the cache tier (RLS-equivalent for
// this server-only seam).
//
// SERVER-PLANE ONLY (FND-03): the `import "server-only"` above + the CI .next/static bundle-grep +
// ESLint keep this module (and its DB driver) out of the client bundle. It is imported ONLY by RSC
// pages (src/app/(protected)/page.tsx). If DATABASE_URL is unavailable the read THROWS — the page's
// error boundary ((protected)/error.tsx) owns it; the seam NEVER silently blends partitions.

import { unstable_cache } from "next/cache";

// ---------------------------------------------------------------------------
// Pure cache key/tag helpers — the ISOLATION contract test/marts-read.test.ts asserts. `isDemo`
// differentiates BOTH the key AND the tag; these are the ONLY inputs that partition the cache.
// ---------------------------------------------------------------------------

/**
 * The cache KEY parts for a mart view read. `isDemo` is the last, differentiating segment, so the
 * real (is_demo=false → "real") and demo (is_demo=true → "demo") keys are NEVER equal for any
 * (view, period) — the Pitfall-2 isolation invariant.
 */
export function martsCacheKey(view: string, period: number, isDemo = false): string[] {
  return ["marts", view, String(period), isDemo ? "demo" : "real"];
}

/**
 * The cache TAG for a partition. Real → "marts:real"; demo → "marts:demo". The ingestion cron
 * invalidates ONLY "marts:real" (real is the only partition an ingest changes); the demo partition
 * changes only when the demo seed re-runs. Putting `isDemo` in the tag keeps invalidation targeted
 * AND keeps the two partitions' cache entries from ever colliding under one shared tag.
 */
export function martsCacheTag(isDemo: boolean): string {
  return isDemo ? "marts:demo" : "marts:real";
}

// A stable period sentinel for the all-periods reads (v_pnl_monthly / v_balance_trend) so their
// cache key still carries a period segment (0 = "all periods") distinct from any real YYYYMM key.
const PERIOD_ALL = 0;

// ---------------------------------------------------------------------------
// The non-request read client — a lazily-constructed direct postgres connection (never a cookie
// client, never service_role). Built once per server process and reused across cache misses.
// ---------------------------------------------------------------------------

function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url || url.trim() === "") {
    throw new Error(
      "DATABASE_URL is not set — the mart cache read cannot open a non-request connection.",
    );
  }
  return url;
}

async function connect() {
  const postgres = (await import("postgres")).default;
  return postgres(requireDatabaseUrl(), { max: 1, onnotice: () => {} });
}

let clientPromise: ReturnType<typeof connect> | undefined;

/** The shared non-request read client (lazy singleton). */
function getSql() {
  return (clientPromise ??= connect());
}

// ---------------------------------------------------------------------------
// Row shapes the reads return. numeric(14,x) columns arrive from the postgres driver as STRINGS
// (unparsed) — the page's `num()` coerces them, exactly as it already does for supabase-js strings.
// integer columns (period_key) arrive as numbers.
// ---------------------------------------------------------------------------

/** v_home_kpis row for the selected period (the headline P&L + net worth). */
export interface HomeKpisRow {
  period_key: number;
  revenue: string;
  investimento: string;
  costs: string;
  sublet_net: string;
  result: string;
  margin: string | null;
  net_worth: string;
}

/** v_pnl_monthly row (all periods) — feeds the €100k fold, streak, months-of-reserve. */
export interface PnlMonthlyRow {
  period_key: number;
  investimento: string;
  costs: string;
}

/** v_balance_trend row (all days) — the net-worth area chart. */
export interface BalanceTrendRow {
  date: string;
  net_worth: string;
}

// ---------------------------------------------------------------------------
// Cacheable per-view reads. Each wraps its query in unstable_cache with `isDemo` in the KEY and the
// TAG, and filters `is_demo = <isDemo>` explicitly inside the callback (the isolation control).
// ---------------------------------------------------------------------------

/** The selected period's headline KPIs (the full P&L row). Null when the partition has no such row. */
export function readHomeKpis(isDemo: boolean, period: number): Promise<HomeKpisRow | null> {
  return unstable_cache(
    async () => {
      const sql = await getSql();
      const rows = await sql<HomeKpisRow[]>`
        select period_key, revenue, investimento, costs, sublet_net, result, margin, net_worth
        from v_home_kpis
        where period_key = ${period} and is_demo = ${isDemo}
        limit 1`;
      return rows[0] ?? null;
    },
    martsCacheKey("v_home_kpis", period, isDemo),
    { tags: ["marts", martsCacheTag(isDemo)] },
  )();
}

/** Every populated period's investimento + costs (the €100k cost-basis fold + reserve inputs). */
export function readPnlMonthly(isDemo: boolean): Promise<PnlMonthlyRow[]> {
  return unstable_cache(
    async () => {
      const sql = await getSql();
      const rows = await sql<PnlMonthlyRow[]>`
        select period_key, investimento, costs
        from v_pnl_monthly
        where is_demo = ${isDemo}`;
      // Return a plain array (unstable_cache serializes the result; drop the RowList wrapper).
      return [...rows];
    },
    martsCacheKey("v_pnl_monthly", PERIOD_ALL, isDemo),
    { tags: ["marts", martsCacheTag(isDemo)] },
  )();
}

/** The net-worth-per-day balance trend (Band C), oldest → newest. */
export function readBalanceTrend(isDemo: boolean): Promise<BalanceTrendRow[]> {
  return unstable_cache(
    async () => {
      const sql = await getSql();
      // Cast the date column to text so the shape matches supabase-js (a 'YYYY-MM-DD' string) — the
      // postgres driver would otherwise hand back a Date object for a `date` column.
      const rows = await sql<BalanceTrendRow[]>`
        select "date"::text as date, net_worth
        from v_balance_trend
        where is_demo = ${isDemo}
        order by "date" asc`;
      return [...rows];
    },
    martsCacheKey("v_balance_trend", PERIOD_ALL, isDemo),
    { tags: ["marts", martsCacheTag(isDemo)] },
  )();
}
