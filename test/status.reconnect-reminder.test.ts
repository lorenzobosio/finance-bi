import { describe, expect, it } from "vitest";

// Wave-0 TDD RED (Phase-14 REM-01, D-01) — freezes the two NEW pure derivations that 14-02 will
// ADD to the ALREADY-EXISTING `src/lib/status/connection-status.ts`:
//   • deriveExpiresInDays(expiresAt: Date | null, now: Date): number | null
//   • deriveReconnectState(consentStatus: string | null, expiresInDays: number | null): ReconnectState
//   • the named constant EXPIRING_SOON_THRESHOLD_DAYS (= 14, per D-01)
//
// The module ALREADY exists (getConnectionStatus/deriveFreshness/deriveNeedsReconnect), but these
// three named exports are ABSENT until 14-02. Importing them with a COMPUTED dynamic-import specifier
// keeps `tsc --noEmit` green while they are missing (the recurring-series.action.test.ts idiom — the
// specifier is a runtime string TypeScript never resolves), and the suite is RED at RUNTIME: the
// plucked members are `undefined`, so calling them throws "is not a function" until 14-02 lands them.
//
// CLOCK RULE (Pitfall 3): this derivation is ALWAYS fed the REAL wall clock. In every case the
// injected `now` STANDS IN FOR `new Date()` — NEVER `demoAwareNow` (the demo clock, pinned
// 2026-03-31, would compute a wrong/negative countdown for a real-time consent-expiry fact).
//
// Synthetic dates only; no PII.

const STATUS_MODULE = "@/lib/status/connection-status";

const DAY_MS = 24 * 3600 * 1000;

type DeriveExpiresInDays = (expiresAt: Date | null, now: Date) => number | null;
type ReconnectState = "none" | "expiring" | "expired";
type DeriveReconnectState = (
  consentStatus: string | null,
  expiresInDays: number | null,
) => ReconnectState;

interface StatusModule {
  deriveExpiresInDays: DeriveExpiresInDays;
  deriveReconnectState: DeriveReconnectState;
  EXPIRING_SOON_THRESHOLD_DAYS: number;
}

async function loadStatus(): Promise<StatusModule> {
  const mod = (await import(/* @vite-ignore */ STATUS_MODULE)) as Record<string, unknown>;
  return {
    deriveExpiresInDays: mod.deriveExpiresInDays as DeriveExpiresInDays,
    deriveReconnectState: mod.deriveReconnectState as DeriveReconnectState,
    EXPIRING_SOON_THRESHOLD_DAYS: mod.EXPIRING_SOON_THRESHOLD_DAYS as number,
  };
}

// A fixed REAL-clock instant — this `now` is `new Date()`'s stand-in, never the demo clock.
const NOW = new Date("2026-07-16T00:00:00Z");

describe("deriveExpiresInDays() — REM-01 countdown from connections.expires_at (REAL clock)", () => {
  it("returns null for a legacy null expires_at (Pitfall 6 — never triggers a reminder)", async () => {
    const { deriveExpiresInDays } = await loadStatus();
    expect(deriveExpiresInDays(null, NOW)).toBeNull();
  });

  it("treats an expires_at exactly EXPIRING_SOON_THRESHOLD_DAYS ahead as the inclusive boundary", async () => {
    const { deriveExpiresInDays, EXPIRING_SOON_THRESHOLD_DAYS } = await loadStatus();
    // Reference the threshold SYMBOLICALLY (never a hard-coded 14 alongside it).
    const boundary = new Date(NOW.getTime() + EXPIRING_SOON_THRESHOLD_DAYS * DAY_MS);
    expect(deriveExpiresInDays(boundary, NOW)).toBe(EXPIRING_SOON_THRESHOLD_DAYS);
  });

  it("returns <= 0 for an expires_at in the past (today / overdue)", async () => {
    const { deriveExpiresInDays } = await loadStatus();
    const past = new Date(NOW.getTime() - 3 * DAY_MS);
    expect(deriveExpiresInDays(past, NOW)).toBeLessThanOrEqual(0);
  });
});

describe("EXPIRING_SOON_THRESHOLD_DAYS — the D-01 named constant", () => {
  it("is 14 days (kept a named constant, never inlined into copy)", async () => {
    const { EXPIRING_SOON_THRESHOLD_DAYS } = await loadStatus();
    expect(EXPIRING_SOON_THRESHOLD_DAYS).toBe(14);
  });
});

describe("deriveReconnectState() — expired SUPERSEDES expiring (UI-SPEC mutual exclusion, D-01)", () => {
  it("returns 'expired' when consent_status is 'expired' EVEN IF expiresInDays is comfortably positive", async () => {
    const { deriveReconnectState } = await loadStatus();
    expect(deriveReconnectState("expired", 30)).toBe("expired");
    expect(deriveReconnectState("expired", 5)).toBe("expired");
  });

  it("returns 'expiring' when not expired and expiresInDays <= threshold (inclusive boundary)", async () => {
    const { deriveReconnectState, EXPIRING_SOON_THRESHOLD_DAYS } = await loadStatus();
    expect(deriveReconnectState("active", 10)).toBe("expiring");
    expect(deriveReconnectState("active", EXPIRING_SOON_THRESHOLD_DAYS)).toBe("expiring");
  });

  it("returns 'none' when not expired and expiresInDays is null or beyond the threshold", async () => {
    const { deriveReconnectState } = await loadStatus();
    expect(deriveReconnectState("active", null)).toBe("none");
    expect(deriveReconnectState(null, null)).toBe("none");
    expect(deriveReconnectState("active", 30)).toBe("none");
  });
});
