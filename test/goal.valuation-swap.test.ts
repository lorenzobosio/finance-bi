import { describe, expect, it } from "vitest";
import { allocate } from "@/lib/goal/allocation";

// Wave-0 TDD RED (ETF-04, D-05) — freezes the €100k denominator SWAP contract on the SINGLE swap point
// `@/lib/goal/getGoalTotal.ts`. The module ALREADY EXISTS (1-arg, returns `state.wealth`), so this
// suite is imported via the COMPUTED dynamic-import idiom — the 2-arg call must NOT be arity-checked
// at compile time (that would be a TS error today; `tsc --noEmit` stays green). RED at RUNTIME for the
// documented reason: the current 1-arg implementation IGNORES a valuation argument and returns
// `state.wealth`, so the market-value swap case fails until a later Phase-12 plan extends the signature.
//
// The extension is NON-BREAKING (Pattern 4): an OPTIONAL `{ wealthMarketValue }` arg. When a live
// market value exists, `getGoalTotal` returns it (€100k valued at market); when it is null OR the arg
// is omitted, it falls back to the Wealth cost basis — the HONEST default, never a stale/false market
// figure. The frozen `test/goal.total.test.ts` (all 1-arg calls) MUST keep passing verbatim.
//
// Synthetic round € only — no PII.

const MODULE = "@/lib/goal/getGoalTotal";

interface GoalTotalModule {
  getGoalTotal: (
    state: { wealth: number },
    valuation?: { wealthMarketValue: number | null },
  ) => number;
}

async function load(): Promise<GoalTotalModule> {
  const mod = (await import(/* @vite-ignore */ MODULE)) as Record<string, unknown>;
  return { getGoalTotal: mod.getGoalTotal as GoalTotalModule["getGoalTotal"] };
}

describe("getGoalTotal(state, valuation?) — market-value swap with honest fallback (ETF-04)", () => {
  const state = allocate(4800); // €4k Wealth (the rest spills to Brazil/Adventures)

  it("1-arg call is unchanged: returns the Wealth cost basis (the frozen contract)", async () => {
    const { getGoalTotal } = await load();
    expect(getGoalTotal(state)).toBe(4000);
    expect(getGoalTotal(state)).toBe(state.wealth);
  });

  it("returns the live market value when a valuation is passed (RED until the swap lands)", async () => {
    const { getGoalTotal } = await load();
    expect(getGoalTotal(state, { wealthMarketValue: 61000 })).toBe(61000);
  });

  it("falls back to the Wealth cost basis when the market value is null (UNPRICED — honest)", async () => {
    const { getGoalTotal } = await load();
    expect(getGoalTotal(state, { wealthMarketValue: null })).toBe(4000);
  });

  it("falls back to the Wealth cost basis when the valuation arg is omitted (undefined)", async () => {
    const { getGoalTotal } = await load();
    expect(getGoalTotal(state, undefined)).toBe(4000);
  });

  // Audit regression (getGoalTotal 0-vs-null): a wealthMarketValue of 0 is "priced but zero units"
  // (nothing invested via the tracked pipeline yet, or all legs predate the first price) — it must NOT
  // collapse the €100k figure to a false €0. A real live position (units × price) is always > 0, so any
  // non-positive/non-finite value falls back to the honest cost basis, exactly like null.
  it("falls back to the Wealth cost basis when the market value is 0 (priced-but-zero-units, NOT €0)", async () => {
    const { getGoalTotal } = await load();
    expect(getGoalTotal(state, { wealthMarketValue: 0 })).toBe(4000);
  });

  it("falls back to the Wealth cost basis on a negative or non-finite market value", async () => {
    const { getGoalTotal } = await load();
    expect(getGoalTotal(state, { wealthMarketValue: -100 })).toBe(4000);
    expect(getGoalTotal(state, { wealthMarketValue: Number.NaN })).toBe(4000);
    expect(getGoalTotal(state, { wealthMarketValue: Number.POSITIVE_INFINITY })).toBe(4000);
  });
});
