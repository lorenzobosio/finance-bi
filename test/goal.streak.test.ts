import { describe, expect, it } from "vitest";

// Wave-0 TDD RED (GOAL-04, D5-06/08) — freezes the €4k-streak contract for the not-yet-existent
// pure engine `src/lib/goal/streak.ts` (Plan 02 builds it). FAILS at import-resolution until the
// module lands — the intended Nyquist RED anchor, NOT a bug.
//
// D5-06: a streak HIT = TOTAL invested that calendar month ≥ €4,000, independent of the internal
//        bucket split — INCLUDING debt settlement. A €4,000 transfer that settled €200 of Brazil
//        debt (leaving Wealth only €3,800) STILL counts (the streak reads total monthly
//        investimento, never the Wealth allocation — Pitfall 3).
// D5-08: a genuine CLOSED-month miss resets `current` to 0 but PRESERVES `longest`; the comeback is
//        flagged; the current provisional (open) month is a filling head, EXCLUDED from the closed
//        count. No streak-freeze / forgiveness.
//
// `computeStreak` is PURE with an INJECTED `now` (mirrors src/lib/period.ts). Synthetic amounts only.
import { computeStreak, type StreakResult } from "@/lib/goal/streak";

const TARGET = 4000; // the €4k pay-yourself-first monthly target (BI / GOAL).

// A fixed clock: July 2026 → currentPeriodKey 202607 is the OPEN (provisional) month; the last
// CLOSED month is 202606. Every fixture is deterministic against this injected `now`.
const NOW = new Date("2026-07-13T00:00:00Z");

describe("computeStreak() — D5-06 debt-settlement still counts (Pitfall 3)", () => {
  it("debt-settlement: a €4,000 month (Wealth only €3,800 after settling €200 debt) still counts as a hit", () => {
    // The map holds TOTAL monthly investimento — 202606 = €4,000 even though €200 settled Brazil
    // debt, so the streak must count it. A month of only €3,800 total would (correctly) be a miss.
    const invByPeriod = new Map<number, number>([
      [202604, TARGET],
      [202605, TARGET],
      [202606, TARGET], // the €4,000 leg that internally settled €200 of Brazil debt
    ]);
    const r: StreakResult = computeStreak(invByPeriod, NOW);
    expect(r.current).toBe(3); // all three closed months hit → an unbroken run of 3
    expect(r.isBroken).toBe(false);
  });

  it("debt-settlement contrast: a €3,800 TOTAL month is a genuine miss (below €4k)", () => {
    const invByPeriod = new Map<number, number>([
      [202604, TARGET],
      [202605, TARGET],
      [202606, 3800], // total < €4k → the streak breaks on the last closed month
    ]);
    const r = computeStreak(invByPeriod, NOW);
    expect(r.current).toBe(0); // last closed month missed → current resets
    expect(r.isBroken).toBe(true);
  });
});

describe("computeStreak() — D5-08 break resets current, keeps longest, flags the comeback", () => {
  // Run A (longest): 202510,202511,202512,202601,202602 → 5 consecutive hits.
  // Miss           : 202603 = €0 (the deliberate break).
  // Run B (current): 202604,202605,202606 → 3 consecutive hits through the last closed month.
  // Provisional    : 202607 (the open month) = €4,000 — a filling head, excluded from the count.
  const invByPeriod = new Map<number, number>([
    [202510, TARGET],
    [202511, TARGET],
    [202512, TARGET],
    [202601, TARGET],
    [202602, TARGET],
    [202603, 0], // break
    [202604, TARGET],
    [202605, TARGET],
    [202606, TARGET],
    [202607, TARGET], // provisional / open month
  ]);
  const r = computeStreak(invByPeriod, NOW);

  it("keeps the longest run across the break", () => {
    expect(r.longest).toBe(5);
  });

  it("resets current to the post-break run length (not the all-time longest)", () => {
    expect(r.current).toBe(3);
  });

  it("flags the comeback (resumed after a genuine break)", () => {
    expect(r.comeback).toBe(true);
  });

  it("excludes the current provisional (open) month from the closed count, but reports it as a filling head", () => {
    expect(r.provisionalHit).toBe(true); // 202607 already ≥ €4k
    // The provisional month is NOT counted in `current` (which is the closed run of 3, not 4).
    expect(r.current).toBe(3);
  });
});
