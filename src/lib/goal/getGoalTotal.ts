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
 * The €100k-progress figure = the Wealth cost basis (`state.wealth`). NOT Σ investimento. This is
 * the one place the "what counts toward €100k" definition lives (Phase-6 swaps the internals here).
 */
export function getGoalTotal(state: Pick<BucketState, "wealth">): number {
  return state.wealth;
}

// Re-export the multi-goal denominator (GOAL-12) so callers can pull both the progress numerator and
// its active denominator from one module; the implementation lives beside the fold in allocation.ts.
export { activeDenominator };
