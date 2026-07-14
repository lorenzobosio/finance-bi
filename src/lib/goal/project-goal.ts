// src/lib/goal/project-goal.ts — the WHATIF-01 pure scenario engine (D-01/D-02). PURE.
//
// ONE engine, THREE callers: the Phase-10 what-if sliders, the Phase-6 AI voice, and the Phase-13
// chat all call `projectGoal()` — so the €100k ETA math lives in EXACTLY one place (D-02). It is a
// thin WRAPPER over `computeEta` (momentum.ts): it never re-derives the ETA range or the variance
// gate; it only orchestrates (clamp inputs, subtract the lump, adjust the pace, add the skip delay,
// delegate to computeEta). No DB / UI / clock import — testable in the node env.
//
// The correctness crux (RESEARCH Pitfall 1 / D-03): the CONFIDENCE VERDICT is gated on the REAL
// trailing history, while the SCENARIO ETA is computed from the slider-adjusted pace. The synthetic
// constant pace (coefficient of variation 0) must NEVER feed the gate — otherwise computeEta would
// always read `confident:true` and silently defeat the Phase-5 honesty gate. NaN/∞-safe (D-12).

import { computeEta, type EtaResult } from "./momentum";
import { GOAL_EUR } from "./constants";

/** Coerce any value to a finite number (NaN/±∞/nullish → 0) — the D-12 guard (cashflow/projection.ts). */
function finite(n: number | undefined): number {
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

/** Clamp a coerced-finite number to ≥ 0. */
function clampNonNegative(n: number | undefined): number {
  return Math.max(0, finite(n));
}

/** The shared what-if input (Phase-6 voice + Phase-13 chat build against this). */
export interface ProjectGoalInput {
  currentInvested: number;
  baseMonthlyContribution: number;
  /** The REAL trailing monthly contributions — the ONLY thing the confidence gate reads (D-03). */
  trailingContributions: number[];
  extraMonthly?: number;
  lumpSum?: number;
  skipMonths?: number;
  goal?: number;
}

/** The shared what-if result. `eta` is an `EtaResult` so `etaLine(result.eta)` round-trips (Pitfall 2). */
export interface ProjectGoalResult {
  eta: EtaResult;
  monthsToGoal: number | null;
  projectedMonthly: number;
  confident: boolean;
  confidence: number;
}

/**
 * Project the €100k ETA for a what-if scenario. PURE. Wraps `computeEta` for BOTH the honest gate
 * (real trailing history) and the scenario range (slider-adjusted constant pace); never re-derives
 * the range/variance math (D-02). NaN/∞-safe: every numeric input is coerced + clamped so no field
 * can be NaN/Infinity.
 */
export function projectGoal(inputs: ProjectGoalInput): ProjectGoalResult {
  // 1. Coerce + clamp every numeric input (mirror the cashflow finite() guard).
  const currentInvested = clampNonNegative(inputs.currentInvested);
  const baseMonthlyContribution = clampNonNegative(inputs.baseMonthlyContribution);
  const extraMonthly = clampNonNegative(inputs.extraMonthly);
  const lumpSum = clampNonNegative(inputs.lumpSum);
  const skipMonths = clampNonNegative(inputs.skipMonths);
  const trailingContributions = Array.isArray(inputs.trailingContributions)
    ? inputs.trailingContributions
    : [];

  // 2. Goal + remaining (the lump is applied up-front toward the balance).
  const goal = finite(inputs.goal) || GOAL_EUR;
  const remaining = Math.max(0, goal - currentInvested - lumpSum);

  // 3. The slider-adjusted go-forward pace.
  const projectedMonthly = Math.max(0, baseMonthlyContribution + extraMonthly);

  // 4. HONEST GATE — driven ONLY by the real trailing history, never the synthetic pace (D-03).
  const gate = computeEta({
    remaining: Math.max(0, goal - currentInvested),
    monthlyContributions: trailingContributions,
  });
  if (!gate.confident) {
    return {
      eta: gate,
      monthsToGoal: null,
      projectedMonthly,
      confident: false,
      confidence: gate.confidence,
    };
  }

  // 5. No go-forward pace → nothing to project; not-confident building result (P6/P13 base-pace-0).
  if (projectedMonthly <= 0) {
    const eta: EtaResult = {
      confident: false,
      minYears: null,
      maxYears: null,
      message: gate.message,
      confidence: gate.confidence,
    };
    return {
      eta,
      monthsToGoal: null,
      projectedMonthly,
      confident: false,
      confidence: gate.confidence,
    };
  }

  // The constant synthetic pace (≥2 samples so computeEta's funded-month gate passes; CV 0).
  const scenarioPace = Array<number>(Math.max(2, trailingContributions.length)).fill(
    projectedMonthly,
  );

  // 6. Lump covers the remaining balance → "reached now" (monthsToGoal 0, NOT etaLine's 1-year floor).
  if (remaining === 0) {
    const reached = computeEta({ remaining: 0, monthlyContributions: scenarioPace });
    return {
      eta: { ...reached, confident: gate.confident, confidence: gate.confidence },
      monthsToGoal: 0,
      projectedMonthly,
      confident: gate.confident,
      confidence: gate.confidence,
    };
  }

  // 7. Confident scenario ETA from the adjusted pace; add the skip delay; OVERRIDE the confidence
  //    verdict with the REAL gate (the synthetic pace informs the RANGE, never the confidence).
  const scenario = computeEta({ remaining, monthlyContributions: scenarioPace });
  const minYears = (scenario.minYears ?? 0) + skipMonths / 12;
  const maxYears = (scenario.maxYears ?? 0) + skipMonths / 12;
  const eta: EtaResult = {
    ...scenario,
    minYears,
    maxYears,
    confident: gate.confident,
    confidence: gate.confidence,
  };
  return {
    eta,
    monthsToGoal: ((minYears + maxYears) / 2) * 12,
    projectedMonthly,
    confident: gate.confident,
    confidence: gate.confidence,
  };
}
