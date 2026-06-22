import { describe, expect, it } from "vitest";

// Phase 1 / Plan 05 — the status-banner derivation contract (ING-05/ING-06).
//
// This suite tests ONLY the PURE derivation helpers from connection-status.ts:
//   - deriveFreshness(lastSyncAt, now) -> "fresh" | "stale" | "unknown" (the 36h threshold)
//   - deriveNeedsReconnect(consentStatus) -> boolean
// No DB, no network, no React rendering — the helpers are factored to be pure so the
// freshness/reconnect logic is unit-tested without touching Supabase or the user JWT.
// getConnectionStatus() (the @supabase/ssr server read) is exercised at the human checkpoint.

import {
  STALE_THRESHOLD_HOURS,
  deriveFreshness,
  deriveNeedsReconnect,
} from "@/lib/status/connection-status";

const NOW = new Date("2026-06-22T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3600 * 1000);

describe("STALE_THRESHOLD_HOURS", () => {
  it("is 36 (one daily cron cycle + a half-day grace)", () => {
    expect(STALE_THRESHOLD_HOURS).toBe(36);
  });
});

describe("deriveFreshness", () => {
  it("returns 'fresh' for a sync 1h ago (within 36h)", () => {
    expect(deriveFreshness(hoursAgo(1), NOW)).toBe("fresh");
  });

  it("returns 'fresh' right at the 36h boundary", () => {
    expect(deriveFreshness(hoursAgo(36), NOW)).toBe("fresh");
  });

  it("returns 'stale' for a sync 40h ago (older than 36h)", () => {
    expect(deriveFreshness(hoursAgo(40), NOW)).toBe("stale");
  });

  it("returns 'unknown' when last_pull_at is null (never synced)", () => {
    expect(deriveFreshness(null, NOW)).toBe("unknown");
  });
});

describe("deriveNeedsReconnect", () => {
  it("is true when consent_status is 'expired'", () => {
    expect(deriveNeedsReconnect("expired")).toBe(true);
  });

  it("is false when consent_status is 'active'", () => {
    expect(deriveNeedsReconnect("active")).toBe(false);
  });

  it("is false when consent_status is null (no recorded lapse)", () => {
    expect(deriveNeedsReconnect(null)).toBe(false);
  });
});
