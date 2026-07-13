// src/lib/goal/constants.ts — the locked numeric constants of the €100k journey.
//
// PURE data only (no I/O, no clock). Every Phase-5 surface and the pure engine
// modules read these so a single edit re-tunes the whole ladder. No € amounts here
// are PII — they are the owner-confirmed product constants (_GOAL-BUCKETS-SPEC.md).

/** The north-star goal: €100,000 invested (the Wealth cost basis, D5-02). */
export const GOAL_EUR = 100_000;

/** The pay-yourself-first monthly Wealth cap / streak target (€4,000). */
export const MONTHLY_TARGET_EUR = 4_000;

/** The monthly Brazil bucket cap (€200) — filled after Wealth, before Adventures. */
export const BRAZIL_MONTHLY_EUR = 200;

/** A "level" step: every €10,000 of Wealth crosses a tranche gate + level event. */
export const LEVEL_STEP_EUR = 10_000;

/** A "major" step: every €100,000 of Wealth is a major celebration + goal rollover. */
export const MAJOR_STEP_EUR = 100_000;

/** The headline milestone ladder shown on the journey (ascending €). */
export const MILESTONES = [10_000, 25_000, 50_000, 75_000, 100_000] as const;

/** The three analytical bucket codes (Wealth is the €100k engine; the rest are life goals). */
export const BUCKET_CODES = {
  wealth: "wealth",
  brazil: "brazil",
  adventures: "adventures",
} as const;

export type BucketCode = (typeof BUCKET_CODES)[keyof typeof BUCKET_CODES];

/** The Wealth ETF ISIN (the instrument whose cost basis == the €100k figure; Phase-6 swaps to market value). */
export const WEALTH_ISIN = "IE000716YHJ7";
