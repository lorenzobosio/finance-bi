// src/lib/health/scorecard.ts — the PURE Financial-Health scorecard ASSEMBLER (HEALTH-01/02).
//
// THE load-bearing invariant (HEALTH-02): this module NEVER recomputes a metric. It takes the
// ALREADY-computed values (from the existing pure helpers `savingsRate` (level.ts), the inline
// months-of-reserve, the budget overspend %, the `getGoalTotal` MoM cost-basis momentum, and a
// `computeStreak` StreakResult) plus a resolved thresholds object, and only RESOLVES each into a
// discrete band + KpiTone. The AI never computes a scorecard number — it narrates this output.
// No I/O, no clock, and NO arithmetic division of raw revenue/cash — this module maps values to
// bands only; the metric math lives in the pure helpers it consumes.
//
// D-09 (Pitfall 4): an income-dependent metric with no income (`savingsRate` / `monthsOfReserve`
// === null — the marts null-not-NaN convention) maps to a NEUTRAL "Not yet — starts at launch"
// read (band `neutral`, tone `neutral`) — NEVER `off-track` / `loss`.
//
// D-08: investmentGrowth is cost-basis momentum (contributions), NOT market return — it carries
// `basis: "contributions"` and is never framed as a market loss (Phase 12 swaps in market value
// non-breakingly through getGoalTotal).

import type { KpiTone } from "@/components/kpi-card";
import type { StreakResult } from "@/lib/goal/streak";
import type { InsightThresholds } from "@/lib/health/thresholds";

/** The discrete health read for one metric (UI-SPEC §2). */
export type HealthBand = "healthy" | "watch" | "off-track" | "neutral";

/** One resolved scorecard metric: the narrated value + its band + the mapped KpiTone. */
export interface MetricRead {
  value: number | null;
  band: HealthBand;
  tone: KpiTone;
}

/** The investment-growth read additionally declares its basis (D-08 — contributions, not market). */
export interface GrowthRead extends MetricRead {
  basis: "contributions";
}

/** The five ALREADY-computed metric values the assembler narrates (HEALTH-02 — never recomputed). */
export interface ScorecardInputs {
  /** From `savingsRate(invested, revenue)` — null when no revenue (marts null-not-NaN). */
  savingsRate: number | null;
  /** Months-of-reserve (net worth ÷ trailing-avg costs) — null when no cost history. */
  monthsOfReserve: number | null;
  /** Max cost-center over-budget fraction this period (0 when all within budget). */
  budgetOverspendPct: number;
  /** MoM Δ of the `getGoalTotal` Wealth cost basis (D-08 contributions momentum). */
  investmentGrowth: number;
  /** The €4k streak read (from `computeStreak`). */
  streak: StreakResult;
}

/** The five-metric scorecard (HEALTH-01). */
export interface Scorecard {
  savingsRate: MetricRead;
  monthsOfReserve: MetricRead;
  budgetAdherence: MetricRead;
  investmentGrowth: GrowthRead;
  streak: MetricRead;
}

/** band → KpiTone (UI-SPEC §2, mirrors kpi-card): healthy→gain, watch→warning, off-track→loss, neutral→neutral. */
const BAND_TONE: Record<HealthBand, KpiTone> = {
  healthy: "gain",
  watch: "warning",
  "off-track": "loss",
  neutral: "neutral",
};

/** Assemble a {value, band, tone} read from a resolved band. */
function read(value: number | null, band: HealthBand): MetricRead {
  return { value, band, tone: BAND_TONE[band] };
}

/**
 * Resolve a higher-is-better metric against a {healthy, watch} pair. A `null` value (no income —
 * the D-09 gate) is NEUTRAL, never off-track.
 */
function resolveHigherBetter(
  value: number | null,
  bands: { healthy: number; watch: number },
): MetricRead {
  if (value === null) return read(null, "neutral"); // D-09: no income → "Not yet", never red.
  if (value >= bands.healthy) return read(value, "healthy");
  if (value >= bands.watch) return read(value, "watch");
  return read(value, "off-track");
}

/**
 * assembleScorecard — resolve the five ALREADY-computed values into {value, band, tone} reads
 * (HEALTH-01/02). PURE: no I/O, no clock, no recomputation — it maps values → bands only.
 */
export function assembleScorecard(
  inputs: ScorecardInputs,
  bands: InsightThresholds,
): Scorecard {
  // Savings rate + months-of-reserve — income-dependent, higher-is-better, D-09-neutral on null.
  const savingsRate = resolveHigherBetter(inputs.savingsRate, bands.savingsRate);
  const monthsOfReserve = resolveHigherBetter(inputs.monthsOfReserve, bands.reserve);

  // Budget adherence — lower overspend is better. Within budget = healthy; ≤watchOverPct over =
  // watch; beyond = off-track. Not income-dependent (never null → never a spurious neutral).
  const overspend = inputs.budgetOverspendPct;
  const budgetBand: HealthBand =
    overspend <= 0
      ? "healthy"
      : overspend <= bands.budgetAdherence.watchOverPct
        ? "watch"
        : "off-track";
  const budgetAdherence = read(overspend, budgetBand);

  // Investment growth — cost-basis contributions momentum (D-08). Never a market-loss read: positive
  // momentum is healthy; a flat month is neutral; a rare basis decrease is at most watch (non-shame).
  const growth = inputs.investmentGrowth;
  const growthBand: HealthBand =
    growth > 0 ? "healthy" : growth === 0 ? "neutral" : "watch";
  const investmentGrowth: GrowthRead = {
    ...read(growth, growthBand),
    basis: "contributions",
  };

  // €4k streak — a live (unbroken) streak is healthy; a single closed miss is watch, NEVER
  // off-track/loss (D-12 non-shame: watchMisses=1 → 1 miss = watch). The value is the current run.
  const streakBand: HealthBand = inputs.streak.isBroken ? "watch" : "healthy";
  const streak = read(inputs.streak.current, streakBand);

  return { savingsRate, monthsOfReserve, budgetAdherence, investmentGrowth, streak };
}
