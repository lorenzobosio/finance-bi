import { createClient } from "@/lib/supabase/server";
import { isDemoForReads } from "@/lib/demo/mode";
import { buildTxQuery, parseTxParams, type TxParams } from "@/lib/transactions/query";
import { csvFilename, toCsv, type TxCsvRow } from "@/lib/transactions/csv";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/**
 * GET /api/transactions/export — the OWNER-ONLY filtered-transactions CSV export (TXN-02, D-05).
 *
 * The couple's real rows (merchant/counterparty) are a PII boundary. This route re-runs the SAME
 * filtered read the /transactions page uses (reusing `buildTxQuery` from 08-04 with the SAME URL
 * params) WITHOUT the pagination limit — it streams the FULL filtered set as a `text/csv` download.
 *
 * AUTH (T-08-16): owner-only. `getUser()` → 401 if no session (RLS denies too — belt & braces).
 * A demo session (`isDemoForReads()`) → 403: a demo/anon caller can NEVER export the real rows.
 * This route is DELIBERATELY NOT in middleware PUBLIC_PATHS (unlike /api/health + /api/revalidate)
 * so on the real deploy an unauthenticated request is redirected to /login before it even lands.
 *
 * NO PRIVILEGED KEY (T-08-17 / FND-03): the read uses @supabase/ssr under the anon key + the user's
 * JWT only — the elevated service-role key is never imported here; RLS + the owner JWT authorize.
 *
 * NO PII IN ERRORS (T-08-20 / V7): any failure returns a bare status code, never a row in the body.
 *
 * `force-dynamic` — the export reflects live filtered data; it is never statically optimized.
 */
export const dynamic = "force-dynamic";

/** The projected row shape from `buildTxQuery` (SELECT_COLUMNS) that the CSV needs. */
type TxQueryRow = {
  id: string;
  booking_date: string;
  description: string | null;
  description_raw: string | null;
  counterparty: string | null;
  amount_eur: string | number | null;
  flow_type: string | null;
  cost_center: string | null;
  categories: { name: string | null } | { name: string | null }[] | null;
};

/** numeric columns arrive from supabase-js as strings; parse to a finite number (0 fallback). */
function num(v: string | number | null | undefined): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Flatten a PostgREST embedded relation (object or single-element array) to its `name`. */
function embedName(
  rel: { name: string | null } | { name: string | null }[] | null,
): string | null {
  if (rel === null) return null;
  return Array.isArray(rel) ? (rel[0]?.name ?? null) : rel.name;
}

/**
 * fetchAllFiltered — re-run `buildTxQuery` under the owner JWT + RLS, ignoring pagination: page
 * through the GENERALIZED KEYSET cursor (same active sort column + id tiebreaker as the page) until
 * the filtered set is exhausted, so the export is the FULL filtered set, not a single page. The
 * household dataset is small (A5); the loop is guarded so a pathological set can never spin forever.
 */
async function fetchAllFiltered(
  supabase: SupabaseClient<Database>,
  baseParams: TxParams,
  demoFilter: boolean,
): Promise<TxQueryRow[]> {
  const CHUNK = 1000;
  const all: TxQueryRow[] = [];
  let cursor = baseParams.cursor ?? null;

  for (let guard = 0; guard < 10_000; guard++) {
    const params: TxParams = { ...baseParams, cursor, limit: CHUNK };
    const { data, error } = await buildTxQuery(supabase, params, demoFilter);
    if (error) throw error;

    const rows = (data ?? []) as TxQueryRow[];
    const hasNext = rows.length > CHUNK; // buildTxQuery fetches limit+1 to detect the next page
    const page = hasNext ? rows.slice(0, CHUNK) : rows;
    all.push(...page);
    if (!hasNext) break;

    const last = page[page.length - 1];
    const value =
      baseParams.sort === "amount_eur" ? String(last.amount_eur) : last.booking_date;
    cursor = { value, id: last.id };
  }

  return all;
}

export async function GET(req: Request): Promise<Response> {
  const supabase = await createClient();

  // Owner-only: a validated session is required (RLS denies anon too — belt & braces).
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  // A demo session (the public deploy or the in-app toggle) can NEVER export the real rows.
  if (await isDemoForReads()) return new Response("Forbidden", { status: 403 });

  // Same zod-parsed, allowlisted, esc()-neutralized params as the /transactions page (T-08-19).
  const url = new URL(req.url);
  const record: Record<string, string | undefined> = {};
  for (const [k, v] of url.searchParams.entries()) record[k] = v;
  const params = parseTxParams(record);

  try {
    // Real partition only — the export is the owner's own real data (demo is already 403'd above).
    const rows = await fetchAllFiltered(supabase, params, false);

    const csvRows: TxCsvRow[] = rows.map((r) => ({
      bookingDate: r.booking_date,
      merchant: r.description ?? r.counterparty ?? r.description_raw ?? "Unknown",
      category: embedName(r.categories),
      costCenter: r.cost_center,
      amountEur: num(r.amount_eur),
      flowType: r.flow_type,
    }));

    return new Response(toCsv(csvRows), {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${csvFilename()}"`,
      },
    });
  } catch {
    // Never leak a row or the query in the body/logs (V7) — a bare status code only.
    return new Response("Export failed", { status: 500 });
  }
}
