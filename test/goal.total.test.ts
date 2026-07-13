import { describe, expect, it } from "vitest";

// Wave-0 TDD RED (GOAL-06, D5-02) — freezes the `getGoalTotal()` contract for the not-yet-existent
// pure engine `src/lib/goal/getGoalTotal.ts` (Plan 02 builds it). FAILS at import-resolution until
// the module lands — the intended Nyquist RED anchor, NOT a bug.
//
// THE LOCKED HARD VISUAL RULE (RESEARCH Anti-Patterns / Pitfall 1): the €100k-progress figure is
// the WEALTH cost basis (`state.wealth`) — NOT "total invested across all buckets" (Σ investimento,
// which is larger once a surplus transfer funds Brazil/Adventures). `getGoalTotal()` is the single
// swappable abstraction (Phase 12 swaps only its internals to market value; the page never changes).
// Synthetic round € only — no PII.
import { getGoalTotal } from "@/lib/goal/getGoalTotal";
import { allocate, foldAllocation, type AllocationEvent } from "@/lib/goal/allocation";

describe("getGoalTotal() — returns the Wealth cost basis (GOAL-06)", () => {
  it("equals state.wealth, not the sum across buckets", () => {
    // €4,800 → €4k Wealth, €200 Brazil, €300+€300 Adventures. getGoalTotal reads ONLY Wealth.
    const state = allocate(4800);
    expect(getGoalTotal(state)).toBe(4000);
    expect(getGoalTotal(state)).toBe(state.wealth);
  });
});

describe("getGoalTotal() — STRICTLY LESS than Σ investimento under surplus transfers (Pitfall 1)", () => {
  it("a surplus transfer that funds Brazil/Adventures makes getGoalTotal < total invested", () => {
    const transfers = [4800, 4800]; // each spills €800 past Wealth into Brazil/Adventures
    const totalInvested = transfers.reduce((a, b) => a + b, 0); // Σ investimento = 9600
    const events: AllocationEvent[] = transfers.map((amount, i) => ({
      kind: "transfer",
      amount,
      bookingDate: `2025-0${i + 1}-15`,
    }));
    const state = foldAllocation(events, { launchDate: "2025-01-01" });

    expect(getGoalTotal(state)).toBe(8000); // only the €4k-capped Wealth legs
    expect(getGoalTotal(state)).toBeLessThan(totalInvested); // the €100k figure is the SMALLER one
  });

  it("with pure €4,000 transfers (no surplus) Wealth captures the whole leg → getGoalTotal === Σ invested", () => {
    const events: AllocationEvent[] = [
      { kind: "transfer", amount: 4000, bookingDate: "2025-01-15" },
      { kind: "transfer", amount: 4000, bookingDate: "2025-02-15" },
    ];
    const state = foldAllocation(events, { launchDate: "2025-01-01" });
    expect(getGoalTotal(state)).toBe(8000);
  });
});
