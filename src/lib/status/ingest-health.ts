// Server-side cron/ingestion-health derivation (OBS-02, D-09).
//
// The trust risk this guards: an unattended daily pipeline (scripts/ingest.ts on the GitHub
// Actions cron) can silently stop — a lapsed consent, a broken workflow, a failed run — and
// nothing visibly changes until the numbers quietly go stale. This module turns "how long
// since the last SUCCESSFUL ingest" into a queryable, deterministic signal.
//
// The heartbeat: import_batches.finished_at of the latest clean run (see the read seam in
// /api/health + /health). SURFACE ONLY — the reminder/notification is Phase 14 (REM).
//
// PURE + DETERMINISTIC: no I/O, no imports beyond types, `now` injected (mirrors
// deriveFreshness in src/lib/status/connection-status.ts) so the derivation is unit-tested
// with no DB, network, or wall-clock.

/**
 * The ingest-staleness window. A successful ingest within this many hours is "fresh"; older
 * is "stale". 36h = one daily cron cycle (~06:00 Europe/Berlin, D-11) plus a half-day grace —
 * so a single missed/failed daily run flips the surface to stale, mirroring the
 * STALE_THRESHOLD_HOURS=36 rationale for connection freshness. Sits squarely in the 24–48h
 * band the plan specifies. Kept as a named constant — NEVER inlined into a number in copy.
 */
export const INGEST_STALE_HOURS = 36;

export type IngestHealth = "fresh" | "stale" | "unknown";

/**
 * Pure ingest-health derivation: "unknown" when there is no successful ingest on record
 * (null), "fresh" within the 36h threshold (inclusive at the boundary), "stale" beyond it.
 * `now` is injected so the derivation is deterministic. Mirrors deriveFreshness exactly.
 */
export function deriveIngestHealth(lastSuccessAt: Date | null, now: Date): IngestHealth {
  if (lastSuccessAt === null) return "unknown";
  const ageHours = (now.getTime() - lastSuccessAt.getTime()) / (3600 * 1000);
  return ageHours <= INGEST_STALE_HOURS ? "fresh" : "stale";
}

/**
 * Factual, non-shame surface copy for the /health ingestion-health line (T-07-20: never
 * shaming, never red — amber for stale). The number is NOT inlined; the copy stays calm.
 */
export function ingestHealthCopy(health: IngestHealth): string {
  switch (health) {
    case "fresh":
      return "The pipeline is syncing on schedule.";
    case "stale":
      return "No successful sync in over a day and a half — the pipeline may be paused.";
    case "unknown":
      return "No sync recorded yet.";
  }
}

// --- The heartbeat READ seam ------------------------------------------------------------------
//
// PURE w.r.t. the INJECTED client (mirrors src/lib/reconcile/read.ts + src/lib/goal/household.ts:
// NO @supabase / next / drizzle import — the caller hands in the already-constructed @supabase/ssr
// client, cast at the call site). `import_batches` is NOT in the typed `database.types.ts` (it is a
// write-plane heartbeat table), so a structural client interface keeps this off the generated types
// without dragging the Drizzle marts client into the app bundle (FND-03).
//
// A "successful ingest" heartbeat = a clean pull that completed without error: status `success`
// (new tx inserted) OR `empty` (pull ran fine, no new tx). `error`/`auth_expired` are failures and
// are excluded. Tolerant of a read error (returns null → 'unknown', NEVER throws). No PII: a single
// timestamp only.

/** The narrow row the heartbeat read selects (timestamp only — no rows/counts of value). */
interface IngestBatchRow {
  finished_at: string | null;
}

/**
 * The narrow read slice of the supabase-js client the heartbeat needs:
 * `from(table).select(cols).in(col, vals).not(col, op, val).order(col, {ascending}).limit(n).maybeSingle()`.
 * Typed structurally (a self-returning filter builder) so the real `@supabase/ssr` client (cast at
 * the call site) and a test fake both satisfy it without importing the SupabaseClient generics.
 */
interface IngestBatchesBuilder {
  in(col: string, vals: string[]): IngestBatchesBuilder;
  not(col: string, op: string, val: unknown): IngestBatchesBuilder;
  order(col: string, opts: { ascending: boolean }): IngestBatchesBuilder;
  limit(n: number): IngestBatchesBuilder;
  maybeSingle(): PromiseLike<{ data: IngestBatchRow | null; error: unknown }>;
}

export interface IngestHealthReadClient {
  from(table: string): {
    select(cols: string): IngestBatchesBuilder;
  };
}

/**
 * Read the latest SUCCESSFUL `import_batches.finished_at` (the cron heartbeat) via the injected
 * client. Under the owner JWT the RLS `allowlist_all` policy makes this RLS-safe; the public
 * `/api/health` uses its own privileged timestamp-only read instead (Pitfall 5). Returns the Date
 * of the latest clean pull, or null when there is none / on any read error (→ 'unknown').
 */
export async function readLastIngestAt(client: IngestHealthReadClient): Promise<Date | null> {
  const { data, error } = await client
    .from("import_batches")
    .select("finished_at")
    .in("status", ["success", "empty"])
    .not("finished_at", "is", null)
    .order("finished_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data?.finished_at) return null;
  return new Date(data.finished_at);
}
