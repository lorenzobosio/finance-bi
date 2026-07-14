import { NextResponse } from "next/server";

import { deriveIngestHealth } from "@/lib/status/ingest-health";
import { createClient } from "@/lib/supabase/server";
// AUDITED server-tier use (FND-03 carve-out): this is the sanctioned "audited Route Handler"
// the no-restricted-imports guard's own message permits. `import_batches` has RLS `allowlist_all`
// and NO anon policy (RESEARCH Pitfall 5), so this PUBLIC route needs the privileged client to read
// the heartbeat — but ONLY a single ISO timestamp leaves, never rows/counts/PII (threat T-07-19).
// The guard's layers 1 (`import "server-only"` in service.ts → build error if bundled) and 3 (the CI
// .next/static bundle grep) still fully keep the key off the client tier; this disables only the
// layer-2 fast-fail lint for this one audited line.
// eslint-disable-next-line no-restricted-imports -- audited Route Handler, timestamp-only read (T-07-19)
import { createServiceClient } from "@/lib/supabase/service";

/**
 * GET /api/health — public liveness + cron-health probe (OBS-01 D-06, OBS-02 D-09).
 *
 * Returns `{ app, db, lastIngestAt, ingestStale, ts }` for uptime pings and the E2E smoke
 * (07-08). INTENTIONALLY LOW-INFO: no rows, no counts, no secrets, no env — safe to call
 * unauthenticated (added to `PUBLIC_PATHS` in middleware so an uptime ping is not
 * redirected to /login on the real deploy). See threats T-07-13, T-07-19.
 *
 * DB probe: a HEAD count (no row data) against `categories`, a pure fixed-taxonomy
 * reference table (no PII) that is anon-readable (`demo_anon_read using(true)`,
 * migration 0013) AND declared in the hand-authored `database.types.ts`. It runs through
 * the anon `@supabase/ssr` server client under RLS — NEVER the `service_role` client for
 * the DB liveness leg. Any error degrades to `db: "error"`; never throws / never 500s.
 *
 * lastIngestAt (OBS-02 / D-09): the timestamp of the latest SUCCESSFUL ingest heartbeat
 * (`import_batches.finished_at` where the run was a clean pull — status in
 * `success`/`empty`; `error`/`auth_expired` are failures). `import_batches` has RLS
 * `allowlist_all` and NO anon policy (RESEARCH Pitfall 5), so this public route uses the
 * PRIVILEGED service client for a strictly timestamp-only read (`select finished_at … limit 1`)
 * — a single ISO timestamp leaves, NEVER rows/counts/PII (threat T-07-19). On any error the
 * value degrades to `null` (never throws). `ingestStale` applies the pure deriveIngestHealth
 * (>36h) so a caller can alarm without re-deriving. SURFACE ONLY — the notification is Phase 14.
 *
 * `force-dynamic` so the liveness answer is never statically cached.
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

  // Cron-health heartbeat: privileged timestamp-only read (Pitfall 5). Returns ONLY the ISO
  // timestamp of the latest clean ingest — no rows, no counts, no PII (T-07-19).
  let lastIngestAt: string | null = null;
  try {
    const service = createServiceClient();
    const { data, error } = await service
      .from("import_batches")
      .select("finished_at")
      .in("status", ["success", "empty"])
      .not("finished_at", "is", null)
      .order("finished_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!error && data?.finished_at) {
      lastIngestAt = new Date(data.finished_at as string).toISOString();
    }
  } catch {
    // A failed privileged read must not break the public probe — degrade to null.
    lastIngestAt = null;
  }

  const ingestStale =
    deriveIngestHealth(lastIngestAt ? new Date(lastIngestAt) : null, new Date()) === "stale";

  return NextResponse.json({
    app: "ok",
    db,
    lastIngestAt,
    ingestStale,
    ts: new Date().toISOString(),
  });
}
