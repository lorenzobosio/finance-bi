import { describe, expect, it } from "vitest";

import type { IngestHealth } from "@/lib/status/ingest-health";

// Wave-0 TDD RED (Phase-14 REM-03, D-06) — freezes the pure stale-ingestion escalation view-model
// landing in the not-yet-existent `@/lib/status/stale-ingestion-view`:
//   • buildStaleIngestionView(health: IngestHealth): StaleIngestionView
//
// RED at RUNTIME only: the COMPUTED dynamic-import specifier keeps `tsc --noEmit` green while the
// module is absent (the recurring-series.action.test.ts idiom), and `await import(...)` REJECTS
// ("Cannot find package '@/lib/status/stale-ingestion-view'") until 14-05 lands it.
//
// This is a THIN, deterministic escalation of `deriveIngestHealth`'s output (the >36h threshold lives
// as INGEST_STALE_HOURS upstream — NEVER a number in this model, Pitfall 3, REAL clock upstream):
//   • "stale"            -> { show: true }  (escalate to the shell banner)
//   • "fresh" | "unknown"-> { show: false } (hidden)
//
// No PII, no clock, no I/O.

const VIEW_MODULE = "@/lib/status/stale-ingestion-view";

interface StaleIngestionView {
  show: boolean;
}

type BuildStaleIngestionView = (health: IngestHealth) => StaleIngestionView;

async function loadView(): Promise<{ buildStaleIngestionView: BuildStaleIngestionView }> {
  const mod = (await import(/* @vite-ignore */ VIEW_MODULE)) as Record<string, unknown>;
  return { buildStaleIngestionView: mod.buildStaleIngestionView as BuildStaleIngestionView };
}

describe("buildStaleIngestionView() — the escalation gate (REM-03, D-06)", () => {
  it("'stale' -> { show: true } (escalate to the shell banner)", async () => {
    const { buildStaleIngestionView } = await loadView();
    expect(buildStaleIngestionView("stale").show).toBe(true);
  });

  it("'fresh' -> { show: false } (hidden)", async () => {
    const { buildStaleIngestionView } = await loadView();
    expect(buildStaleIngestionView("fresh").show).toBe(false);
  });

  it("'unknown' -> { show: false } (hidden — never synced yet is not a staleness alarm)", async () => {
    const { buildStaleIngestionView } = await loadView();
    expect(buildStaleIngestionView("unknown").show).toBe(false);
  });
});
