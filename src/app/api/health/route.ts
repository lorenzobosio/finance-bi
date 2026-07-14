import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/health — public liveness probe (OBS-01, D-06).
 *
 * Returns `{ app: "ok", db: "ok" | "error", ts }` for uptime pings and the E2E smoke
 * (07-08). INTENTIONALLY LOW-INFO: no rows, no secrets, no env — safe to call
 * unauthenticated (added to `PUBLIC_PATHS` in middleware so an uptime ping is not
 * redirected to /login on the real deploy). See threat T-07-13.
 *
 * DB probe: a HEAD count (no row data) against `categories`, a pure fixed-taxonomy
 * reference table (no PII) that is anon-readable (`demo_anon_read using(true)`,
 * migration 0013) AND declared in the hand-authored `database.types.ts` (so the typed
 * anon client accepts it — the plan's `dim_calendar` example is anon-readable but
 * untyped). It runs through the anon `@supabase/ssr` server client under RLS — NEVER the
 * `service_role` client (a public route must not carry the RLS-bypass key). Any error
 * degrades to `db: "error"`; the handler never throws / never 500s (V7 discipline).
 *
 * `force-dynamic` so the liveness answer is never statically cached.
 * (Cron-health `lastIngestAt` is 07-07's job; this route stays minimal.)
 */
export const dynamic = "force-dynamic";

export async function GET() {
  let db: "ok" | "error" = "error";

  try {
    const supabase = await createClient();
    // HEAD count: metadata only, returns no rows — low-info by construction.
    const { error } = await supabase
      .from("categories")
      .select("*", { count: "exact", head: true });
    db = error ? "error" : "ok";
  } catch {
    // Any transport / client failure -> "error"; the probe itself must not throw.
    db = "error";
  }

  return NextResponse.json({
    app: "ok",
    db,
    ts: new Date().toISOString(),
  });
}
