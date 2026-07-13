import { describe, expect, it } from "vitest";

// Wave-0 TDD RED (GOAL-03, D5-15) — freezes the honest-ETA contract for the not-yet-existent pure
// engine `src/lib/goal/momentum.ts` (Plan 02 builds it). FAILS at import-resolution until the
// module lands — the intended Nyquist RED anchor, NOT a bug.
//
// D5-15: the ETA is an HONEST RANGE behind a CONFIDENCE GATE, computed from a trailing run-rate.
//   - Under ~2 funded months (or high variance) → the "building your pace" state: confident=false,
//     NO numeric ETA (min/max null). Never a single false-precise date.
//   - Post-gate → a RANGE (minYears/maxYears), never one exact number/date.
//   - Zero run-rate / divide-by-zero → null years, NEVER NaN.
//
// The signature is built so Phase-10 `projectGoal({ monthlyContribution })` reuses the same core.
// Pure; synthetic € only.
import { computeEta, type EtaResult } from "@/lib/goal/momentum";

describe("computeEta() — honest RANGE, never a single date (GOAL-03)", () => {
  it("post-gate: returns a bracketed min/max-years RANGE with a positive run-rate", () => {
    // €96,000 remaining at a steady ~€4,000/mo trailing run-rate → on the order of ~2 years.
    const r: EtaResult = computeEta({
      remaining: 96000,
      monthlyContributions: [4000, 4000, 4000],
    });
    expect(r.confident).toBe(true);
    expect(typeof r.minYears).toBe("number");
    expect(typeof r.maxYears).toBe("number");
    expect(Number.isFinite(r.minYears as number)).toBe(true);
    expect(Number.isFinite(r.maxYears as number)).toBe(true);
    expect(r.minYears as number).toBeGreaterThan(0);
    // A RANGE, not a single point: the upper bound is ≥ the lower bound.
    expect(r.maxYears as number).toBeGreaterThanOrEqual(r.minYears as number);
  });
});

describe("computeEta() — confidence gate (D5-15)", () => {
  it('under ~2 funded months → the "building your pace" state, no numeric ETA', () => {
    const r = computeEta({ remaining: 96000, monthlyContributions: [4000] });
    expect(r.confident).toBe(false);
    expect(r.minYears).toBeNull();
    expect(r.maxYears).toBeNull();
    expect(typeof r.message).toBe("string"); // a warm "building your pace" message, not a date
  });
});

describe("computeEta() — zero run-rate never yields NaN (D5-15)", () => {
  it("zero trailing contributions → null years, never NaN", () => {
    const r = computeEta({ remaining: 96000, monthlyContributions: [0, 0, 0] });
    expect(r.minYears).toBeNull();
    expect(r.maxYears).toBeNull();
    // The core must guard divide-by-zero — never surface NaN to the UI.
    expect(Number.isNaN(r.minYears as unknown as number)).toBe(false);
    expect(Number.isNaN(r.maxYears as unknown as number)).toBe(false);
  });

  it("no history at all → not confident, null range, no NaN", () => {
    const r = computeEta({ remaining: 96000, monthlyContributions: [] });
    expect(r.confident).toBe(false);
    expect(r.minYears).toBeNull();
    expect(r.maxYears).toBeNull();
  });
});
