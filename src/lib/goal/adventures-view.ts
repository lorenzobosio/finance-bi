// src/lib/goal/adventures-view.ts — the PURE honest Adventures "accruing" decomposition (D5-11, G5).
//
// No DB, no clock, no I/O. The Adventures bucket has TWO locked pools with DIFFERENT unlock gates:
//   • advSmallLocked accrues after each €10k Wealth gate and RELEASES at the NEXT €10k gate.
//   • advBig is the epic-trip pool — it only unlocks at the €100k major (the active goal denominator).
//
// The UAT (G5) caught the dishonest copy: lumping BOTH pools under one "unlocks at the next €10k"
// label falsely promises the epic-trip money at €60k when it is actually gated at €100k. This module
// returns one honestly-tagged part PER non-zero pool so each surface can label its TRUE threshold.

import { activeDenominator, type BucketState } from "./allocation";
import { LEVEL_STEP_EUR } from "./constants";

/** One locked Adventures pool with its TRUE unlock threshold. */
export interface AccruingPart {
  /** The locked € amount in this pool. */
  amount: number;
  /** The Wealth € at which this pool unlocks (small → next €10k gate; big → €100k major). */
  unlocksAtEur: number;
  /** "small" = the released-at-each-€10k tranche; "big" = the epic-trip pool (unlocks at €100k). */
  kind: "small" | "big";
}

/**
 * accruingParts — the honest per-pool locked-money decomposition (G5 / D5-11). Returns ONLY the
 * non-zero locked pools, each tagged with its real unlock gate: the small pool at the next €10k
 * Wealth gate, the big (epic-trip) pool at the active €100k major (activeDenominator of Wealth).
 * An all-zero-locked state returns []. NEVER tags the big pool at the €10k gate (the UAT bug).
 */
export function accruingParts(
  state: Pick<BucketState, "wealth" | "advSmallLocked" | "advBig">,
): AccruingPart[] {
  const nextGate = (Math.floor(state.wealth / LEVEL_STEP_EUR) + 1) * LEVEL_STEP_EUR;
  const nextMajor = activeDenominator(state.wealth);
  const parts: AccruingPart[] = [];
  if (state.advSmallLocked > 0) {
    parts.push({ amount: state.advSmallLocked, unlocksAtEur: nextGate, kind: "small" });
  }
  if (state.advBig > 0) {
    parts.push({ amount: state.advBig, unlocksAtEur: nextMajor, kind: "big" });
  }
  return parts;
}
