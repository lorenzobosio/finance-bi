// src/lib/goal/momentum.ts — the HONEST ETA behind a CONFIDENCE GATE (D5-15). PURE.
//
// D5-15: the ETA is a RANGE, never a single false-precise date.
//   - Under ~2 funded months (or high variance) → the "building your pace" state: confident=false,
//     NO numeric ETA (min/max null), a warm message.
//   - Post-gate → a bracketed { minYears, maxYears } from a trailing run-rate ± variance buffer.
//   - Zero run-rate / divide-by-zero → null years, NEVER NaN.
//
// The signature is built so Phase-10 `projectGoal({ monthlyContribution })` reuses this core.

/** Minimum funded (>0) months before any numeric ETA is shown (the confidence gate). */
const MIN_FUNDED_MONTHS = 2;
/** ± buffer around the trailing run-rate that widens the honest range. */
const RANGE_BUFFER = 0.15;
/** Coefficient-of-variation ceiling above which the pace is "too noisy" → building state. */
const MAX_CV = 0.75;

export interface EtaInput {
  /** Euros still to invest to reach the active goal. */
  remaining: number;
  /** The trailing monthly contribution amounts (most-recent window). */
  monthlyContributions: number[];
}

export interface EtaResult {
  /** True only when the gate passes AND a positive, low-variance run-rate exists. */
  confident: boolean;
  /** Lower bound in years (faster pace), or null when not confident / zero run-rate. */
  minYears: number | null;
  /** Upper bound in years (slower pace), or null when not confident / zero run-rate. */
  maxYears: number | null;
  /** A human message — the warm "building your pace" copy when not confident. */
  message: string;
  /** 0..1 confidence weight (funded-month coverage tempered by variance). */
  confidence: number;
}

const BUILDING_MESSAGE =
  "Building your pace — a couple more funded months and we'll show an honest estimate.";

/**
 * Compute the honest ETA range (or the building state) from a trailing run-rate. Pure and NaN-safe:
 * a zero or too-noisy run-rate, or under ~2 funded months, returns the null-range building state.
 */
export function computeEta({ remaining, monthlyContributions }: EtaInput): EtaResult {
  const funded = monthlyContributions.filter((c) => c > 0);
  const fundedMonths = funded.length;

  const building = (confidence: number): EtaResult => ({
    confident: false,
    minYears: null,
    maxYears: null,
    message: BUILDING_MESSAGE,
    confidence,
  });

  // Gate 1: not enough funded months yet.
  if (fundedMonths < MIN_FUNDED_MONTHS) return building(0);

  const n = monthlyContributions.length;
  const avg = monthlyContributions.reduce((a, c) => a + c, 0) / n;

  // Gate 2: zero run-rate → null years, never NaN (divide-by-zero guard).
  if (avg <= 0) return building(0);

  // Gate 3: too-noisy pace (high coefficient of variation) → building state.
  const variance =
    monthlyContributions.reduce((a, c) => a + (c - avg) ** 2, 0) / n;
  const cv = Math.sqrt(variance) / avg;
  const confidence = Math.max(0, Math.min(1, 1 - cv));
  if (cv > MAX_CV) return building(confidence);

  // Post-gate: an honest RANGE. Faster pace (higher rate) → fewer years and vice-versa.
  const fastRate = avg * (1 + RANGE_BUFFER);
  const slowRate = avg * (1 - RANGE_BUFFER);
  const minYears = remaining / fastRate / 12;
  const maxYears = remaining / slowRate / 12;

  return { confident: true, minYears, maxYears, message: "On track.", confidence };
}
