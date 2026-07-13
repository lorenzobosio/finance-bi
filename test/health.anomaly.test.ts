import { describe, expect, it } from "vitest";

// Wave-0 TDD RED (AI-05, D-10/11/13) — freezes the PURE anomaly-detector contract for the
// not-yet-existent `@/lib/health/anomaly` (a later Phase-6 plan builds it). FAILS at
// import-resolution until the module lands — the intended Nyquist RED anchor, NOT a bug.
//
// Mirrors `computeStreak`'s discipline (`src/lib/goal/streak.ts:39`): a PURE fn over mart-derived
// rows + an INJECTED `now` (never `new Date()` inside) so the suite is deterministic — no I/O.
// Signature: `(costcenterBva, categoryBreakdown, now, monthsWithData) → Flag[]`.
//
// D-10/D-11: detection is deterministic (the AI never decides WHETHER something is over budget — it
// only ranks/phrases). A flag fires when `remaining < 0` (over budget) OR the linear mid-month pace
// projection `actual ÷ (dayOfMonth/daysInMonth)` exceeds `budget` (on-pace-to-exceed) AND the day is
// past a small floor (no day-1 noise). The MoM/statistical-spike branch is GATED behind
// "≥2 months of data" — with `monthsWithData < 2` NO spike flag is produced, regardless of inputs
// (build the gate, not rich stats).
//
// Synthetic € only; no PII.
import { detectAnomalies, type Flag } from "@/lib/health/anomaly";

// A mid-month clock: 15 July 2026 → dayOfMonth 15 of 31 (≈0.484 of the month elapsed). Injected.
const MID_MONTH = new Date("2026-07-15T00:00:00Z");
// A day-1 clock — the pace projection must NOT fire this early (no day-1 noise).
const DAY_ONE = new Date("2026-07-01T00:00:00Z");

// A cost-center budget-vs-actual row (the v_costcenter_bva slice the detector reads).
const bva = (costCenter: string, budget: number, actual: number) => ({ costCenter, budget, actual });

describe("detectAnomalies — over-budget fires when remaining < 0 (D-11)", () => {
  it("emits one flag carrying {scope, actual, budget, remaining, onPace} for an over-budget row", () => {
    const flags: Flag[] = detectAnomalies([bva("lorenzo", 500, 600)], [], MID_MONTH, 3);
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({
      scope: "lorenzo",
      actual: 600,
      budget: 500,
      remaining: -100,
    });
    expect(typeof flags[0].onPace).toBe("boolean");
  });
});

describe("detectAnomalies — on-pace-to-exceed fires mid-month (D-11)", () => {
  it("flags a not-yet-over row whose linear projection exceeds budget (onPace true, remaining > 0)", () => {
    // budget 1000, actual 600 at day 15/31 → projection 600 ÷ (15/31) = 1240 > 1000.
    const flags = detectAnomalies([bva("fernanda", 1000, 600)], [], MID_MONTH, 3);
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({ scope: "fernanda", onPace: true, remaining: 400 });
  });

  it("does NOT fire on a steady under-budget row (projection below budget)", () => {
    // budget 1000, actual 300 at day 15/31 → projection ≈ 620 < 1000 → no flag.
    expect(detectAnomalies([bva("shared", 1000, 300)], [], MID_MONTH, 3)).toEqual([]);
  });

  it("does NOT fire on day 1 despite a high projection (no day-1 noise floor)", () => {
    // budget 1000, actual 100 at day 1/31 → projection would be huge, but the day is below the
    // floor AND the row is not over budget → zero flags.
    expect(detectAnomalies([bva("shared", 1000, 100)], [], DAY_ONE, 3)).toEqual([]);
  });
});

describe("detectAnomalies — the statistical-spike branch is GATED at <2 months (D-11)", () => {
  it("produces NO spike flag from category history when monthsWithData < 2, regardless of inputs", () => {
    // A category with a large cost would look spike-worthy, but with only 1 month of data the spike
    // branch is gated off entirely → no flag (budget-relative inputs are empty here).
    const flags = detectAnomalies([], [{ bucketLabel: "Groceries", costs: 9999 }], MID_MONTH, 1);
    expect(flags).toEqual([]);
  });
});

describe("detectAnomalies — determinism (pure, injected clock)", () => {
  it("returns the same ordered output for the same inputs", () => {
    const rows = [bva("lorenzo", 500, 600), bva("fernanda", 1000, 600)];
    const a = detectAnomalies(rows, [], MID_MONTH, 3);
    const b = detectAnomalies(rows, [], MID_MONTH, 3);
    expect(b).toEqual(a);
  });
});
