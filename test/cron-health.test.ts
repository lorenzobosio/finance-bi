import { describe, expect, it } from "vitest";

// Wave-0 TDD RED (OBS-02, D-09) — freezes the PURE cron/ingest-health derivation contract for the
// not-yet-existent `@/lib/status/ingest-health` (built GREEN in 07-07). RED at RUNTIME (module does
// not resolve); the COMPUTED import specifier keeps `tsc --noEmit` green. Mirrors the injected-`now`
// determinism of `deriveFreshness` in `src/lib/status/connection-status.ts`.
//
// The signal: how long since the last SUCCESSFUL ingest (import_batches heartbeat). Within the
// threshold → 'fresh'; beyond it → 'stale'; never ingested (null) → 'unknown'. `now` is injected so
// the derivation is deterministic (no wall-clock). Threshold inclusive at the boundary.

const MODULE = "@/lib/status/ingest-health";

interface IngestHealth {
  deriveIngestHealth: (lastSuccessAt: Date | null, now: Date) => "fresh" | "stale" | "unknown";
  INGEST_STALE_HOURS: number;
}

async function loadHealth(): Promise<IngestHealth> {
  const mod = (await import(/* @vite-ignore */ MODULE)) as Record<string, unknown>;
  return {
    deriveIngestHealth: mod.deriveIngestHealth as IngestHealth["deriveIngestHealth"],
    INGEST_STALE_HOURS: mod.INGEST_STALE_HOURS as number,
  };
}

const NOW = new Date("2026-07-14T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3600 * 1000);

describe("deriveIngestHealth — the stale threshold", () => {
  it("exposes INGEST_STALE_HOURS = 36 (one daily cron cycle + grace)", async () => {
    const { INGEST_STALE_HOURS } = await loadHealth();
    expect(INGEST_STALE_HOURS).toBe(36);
  });
});

describe("deriveIngestHealth — fresh/stale/unknown", () => {
  it("a last success WITHIN the threshold is 'fresh'", async () => {
    const { deriveIngestHealth } = await loadHealth();
    expect(deriveIngestHealth(hoursAgo(10), NOW)).toBe("fresh");
  });

  it("a last success BEYOND the threshold is 'stale'", async () => {
    const { deriveIngestHealth } = await loadHealth();
    expect(deriveIngestHealth(hoursAgo(48), NOW)).toBe("stale");
  });

  it("EXACTLY at the threshold is 'fresh' (inclusive boundary)", async () => {
    const { deriveIngestHealth, INGEST_STALE_HOURS } = await loadHealth();
    expect(deriveIngestHealth(hoursAgo(INGEST_STALE_HOURS), NOW)).toBe("fresh");
  });

  it("null (never ingested) is 'unknown'", async () => {
    const { deriveIngestHealth } = await loadHealth();
    expect(deriveIngestHealth(null, NOW)).toBe("unknown");
  });
});
