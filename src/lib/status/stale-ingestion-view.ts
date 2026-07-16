// src/lib/status/stale-ingestion-view.ts — the PURE stale-ingestion escalation view-model (REM-03, D-06).
//
// A THIN, deterministic escalation of `deriveIngestHealth`'s already-tested output: it decides whether
// the in-app dead-man's-switch banner shows. The >36h staleness threshold lives upstream as
// INGEST_STALE_HOURS (src/lib/status/ingest-health.ts), computed on the REAL clock in 14-05 (Pitfall 3)
// — NEVER a number or time-math in THIS model. No `new Date()`, no I/O, no copy string (the 14-05
// component owns the one loud banner's locked copy).
//
//   • "stale"             -> { show: true }  (escalate to the shell banner)
//   • "fresh" | "unknown" -> { show: false } (hidden — never-synced-yet is not a staleness alarm)
//
// No PII, no clock.

import type { IngestHealth } from "@/lib/status/ingest-health";

/** The rendered stale-ingestion banner shape — a single escalation gate. */
export interface StaleIngestionView {
  show: boolean;
}

/**
 * buildStaleIngestionView — escalate `deriveIngestHealth`'s output to the banner gate (REM-03, D-06).
 *
 * Deterministic: only "stale" escalates; "fresh" and "unknown" stay hidden. "unknown" (no successful
 * ingest on record) is deliberately NOT an alarm — a pipeline that has never synced is not the same as
 * one that has gone stale.
 */
export function buildStaleIngestionView(health: IngestHealth): StaleIngestionView {
  return { show: health === "stale" };
}
