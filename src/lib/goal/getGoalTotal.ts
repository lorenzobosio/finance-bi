// src/lib/goal/getGoalTotal.ts — the SINGLE swappable €100k-progress abstraction (GOAL-06, D5-02).
//
// THE LOCKED HARD VISUAL RULE (RESEARCH Anti-Patterns / Pitfall 1): the €100k-progress figure is the
// WEALTH COST BASIS (`state.wealth`) — NOT "total invested across all buckets" (Σ investimento, which
// is LARGER once a surplus transfer funds Brazil/Adventures). Every surface reads THIS function, so
// Phase-6 can swap ONLY its internals (cost basis → market value) without touching a single page.
//
// PURE: reads `state.wealth` off the fold result — no DB, no clock.

import type { BucketState } from "./allocation";
import { activeDenominator } from "./allocation";

/**
 * The optional market-value valuation the Phase-12 swap supplies (Pattern 4). `wealthMarketValue` is
 * the live Wealth market value when priced, or null when UNPRICED — in which case `getGoalTotal` falls
 * back to the honest cost basis (`state.wealth`), never a stale/false market figure. A non-positive or
 * non-finite value (0, negative, NaN, ±Infinity) is ALSO treated as "not genuinely valued" and falls
 * back to cost basis — a live position with real units × a real price is always > 0, so a 0 here means
 * "priced but zero units" (e.g. contributions not yet recorded, or all legs predate the first price),
 * which must NOT collapse the €100k figure to a false €0.
 */
export interface GoalValuation {
  wealthMarketValue: number | null;
}

/**
 * The €100k-progress figure. By default = the Wealth cost basis (`state.wealth`). NOT Σ investimento.
 * This is the one place the "what counts toward €100k" definition lives.
 *
 * NON-BREAKING Phase-12 swap (D-05/D-07, Pattern 4): pass an optional `valuation` and the figure is
 * valued at MARKET when a live `wealthMarketValue` exists, falling back to the cost basis when it is
 * null OR the arg is omitted — the HONEST default. All 1-arg callers are unaffected (`?? state.wealth`).
 */
export function getGoalTotal(
  state: Pick<BucketState, "wealth">,
  valuation?: GoalValuation,
): number {
  const mv = valuation?.wealthMarketValue;
  // A genuine live valuation is a POSITIVE, FINITE number. null/undefined (unpriced), 0 (priced but
  // zero units), a negative, or a non-finite value all mean "not genuinely valued" → fall back to the
  // honest cost basis. Using `> 0` (not `?? `) is deliberate: `0 ?? wealth === 0` would collapse the
  // €100k figure to a false €0.
  return typeof mv === "number" && Number.isFinite(mv) && mv > 0 ? mv : state.wealth;
}

// Re-export the multi-goal denominator (GOAL-12) so callers can pull both the progress numerator and
// its active denominator from one module; the implementation lives beside the fold in allocation.ts.
export { activeDenominator };
