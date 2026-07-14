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
