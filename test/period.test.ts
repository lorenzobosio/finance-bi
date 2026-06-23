import { describe, expect, it } from "vitest";

// BI-04 — comparability helpers. period_key is the YYYYMM int join key from
// dim_calendar (schema.ts: MoM compares adjacent period_keys, YoY uses period_key-100).
// These helpers gate the "Provisional" flag (current open month) and the "Not enough
// history yet" YoY fallback (~12 months) from UI-SPEC §7.
//
// All functions take an INJECTED `now: Date` (mirroring connection-status.ts
// deriveFreshness) so this suite is deterministic and DB-free — no Date.now().
import {
  currentPeriodKey,
  isProvisional,
  periodKeyForYoY,
  hasYoYHistory,
} from "@/lib/period";

describe("currentPeriodKey — YYYYMM int from the injected now (BI-04)", () => {
  it("derives 202606 from June 2026", () => {
    expect(currentPeriodKey(new Date("2026-06-15"))).toBe(202606);
  });

  it("zero-pads single-digit months", () => {
    expect(currentPeriodKey(new Date("2026-01-15"))).toBe(202601);
    expect(currentPeriodKey(new Date("2026-12-31"))).toBe(202612);
  });
});

describe("isProvisional — true only for the current open month (UI-SPEC §7)", () => {
  const now = new Date("2026-06-15");

  it("is true for the period equal to now's month", () => {
    expect(isProvisional(202606, now)).toBe(true);
  });

  it("is false for a past (closed) month", () => {
    expect(isProvisional(202605, now)).toBe(false);
  });

  it("is false for a future month", () => {
    expect(isProvisional(202607, now)).toBe(false);
  });
});

describe("periodKeyForYoY — period_key minus 100 (BI-04 YoY join key)", () => {
  it("maps a mid-year period to the same month a year earlier", () => {
    expect(periodKeyForYoY(202606)).toBe(202506);
  });

  it("crosses the year boundary correctly (January)", () => {
    expect(periodKeyForYoY(202601)).toBe(202501);
  });
});

describe("hasYoYHistory — the ~12-month gate (UI-SPEC §7)", () => {
  it("is false with 11 distinct populated periods", () => {
    const eleven = Array.from({ length: 11 }, (_, i) => 202501 + i);
    expect(hasYoYHistory(eleven)).toBe(false);
  });

  it("is true once 12 distinct populated periods exist", () => {
    const twelve = Array.from({ length: 12 }, (_, i) => 202501 + i);
    expect(hasYoYHistory(twelve)).toBe(true);
  });

  it("counts DISTINCT periods only — duplicates do not inflate the count", () => {
    const elevenDistinctWithDupes = [
      ...Array.from({ length: 11 }, (_, i) => 202501 + i),
      202501,
      202502,
    ];
    expect(hasYoYHistory(elevenDistinctWithDupes)).toBe(false);
  });
});
