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
 * back to the honest cost basis (`state.wealth`), never a stale/false market figure.
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
  return valuation?.wealthMarketValue ?? state.wealth;
}

// Re-export the multi-goal denominator (GOAL-12) so callers can pull both the progress numerator and
// its active denominator from one module; the implementation lives beside the fold in allocation.ts.
export { activeDenominator };
