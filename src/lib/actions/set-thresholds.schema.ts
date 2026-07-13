// set-thresholds write-plane INPUT CONTRACT (D-07, HEALTH-01).
//
// Split out of `set-thresholds.ts` because a Next 15 FILE-level `'use server'` module may export
// ONLY async functions — this plain module holds the zod schema the action and the unit test
// import (mirrors set-launch-date.schema.ts). The bands GATE the scorecard reads: a malformed or
// out-of-range edge is rejected BEFORE any DB write.

import { z } from "zod";

/**
 * The scorecard-band input contract (flat, form-shaped). Each editable edge is a finite number with
 * sane personal-finance bounds:
 *   • savings-rate edges are fractions in [0,1] (invested ÷ revenue);
 *   • reserve edges are months-of-cost ≥ 0;
 *   • budget-adherence tolerance is an over-budget fraction in [0,1];
 *   • the €4k streak tolerance is a non-negative integer miss count.
 * Unknown keys are stripped (zod default) — the first half of the mass-assignment guard; the action
 * then maps ONLY these validated fields to columns (the second half).
 */
export const SetThresholdsInputSchema = z.object({
  savingsRateHealthy: z.number().min(0).max(1),
  savingsRateWatch: z.number().min(0).max(1),
  reserveHealthy: z.number().min(0),
  reserveWatch: z.number().min(0),
  budgetAdherenceWatchOverPct: z.number().min(0).max(1),
  streakWatchMisses: z.number().int().min(0),
});

export type SetThresholdsInput = z.infer<typeof SetThresholdsInputSchema>;
