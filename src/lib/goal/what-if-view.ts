// src/lib/goal/what-if-view.ts — the PURE what-if panel view-model (WHATIF-02, D-04/D-06/D-07).
// No React/DOM/DB import — node-testable, mirroring how `hero-view.ts` splits the glance logic out
// of its client island so the honesty rules are unit-verified, not only human-checked.
//
// The panel is thin glue (state + sliders + `projectGoal`/`etaLine`/`CountUp` reuse); THIS module
// owns the decisions the panel must never get wrong:
//   - the delta vs baseline (round(baseline − scenario); + = sooner) and its qualitative fallback,
//   - direction → semantic signal (sooner→gain, later→warning) — NEVER loss/destructive (D-06),
//   - the honest-caveat selection (low-confidence vs zero-contribution vs none, D-03),
//   - Reset-to-baseline,
//   - purity / no-persist (never mutates or persists real state, D-06/D-08).
//
// The copy strings live here (UI-SPEC §Copywriting) so the panel renders a single source of truth;
// the frozen test asserts the SELECTION (enum keys), not the DOM.

/** The `projectGoal`-result subset the view-model consumes (structural — no import coupling). */
export interface ProjectGoalResultLike {
  monthsToGoal: number | null;
  projectedMonthly: number;
  confident: boolean;
  confidence: number;
}

/** The three slider values. */
export interface SliderValues {
  extraMonthly: number;
  lumpSum: number;
  skipMonths: number;
}

/** The frozen view-model output — the render-ready decisions the panel consumes. */
export interface WhatIfViewModel {
  /** round(baseline.monthsToGoal − scenario.monthsToGoal); positive = sooner. Null when qualitative. */
  deltaMonths: number | null;
  /** The qualitative direction, always available even when a precise count is not. */
  direction: "sooner" | "later" | "none";
  /** True only when BOTH scenario and baseline are confident (a precise month count is allowed). */
  precise: boolean;
  /** Semantic signal: sooner→gain, later→warning, otherwise neutral. NEVER loss/destructive. */
  signal: "gain" | "warning" | "neutral";
  /** Which honest caveat copy the readout selects. */
  caveat: "none" | "low-confidence" | "zero-contribution";
}

/** UI-SPEC §Copywriting Contract — the honest caveat copy, keyed by the view-model selection. */
export const CAVEAT_COPY: Record<"low-confidence" | "zero-contribution", string> = {
  "low-confidence":
    "Not enough history yet — this is a rough estimate, not a promise. Your ETA sharpens after a couple of funded months.",
  "zero-contribution":
    "Add something monthly to project an ETA — at €0/mo there's no pace to measure.",
};

/**
 * The pure what-if decision. Takes the confident/uncertain `projectGoal` results for the current
 * slider `scenario` and the untouched `baseline`, returns the render-ready delta + signal + caveat.
 * PURE: never mutates its inputs, no I/O, returns a fresh plain object.
 */
export function whatIfView(
  scenario: ProjectGoalResultLike,
  baseline: ProjectGoalResultLike,
): WhatIfViewModel {
  // A precise month count is only honest when BOTH sides gate confident (D-03 / Pitfall 1).
  const precise =
    scenario.confident &&
    baseline.confident &&
    scenario.monthsToGoal !== null &&
    baseline.monthsToGoal !== null;

  // Delta = round(baseline − scenario); + = sooner. Null (qualitative) when either side lacks a count.
  const deltaMonths = precise
    ? Math.round((baseline.monthsToGoal as number) - (scenario.monthsToGoal as number))
    : null;

  // Direction: from the precise delta when we have one, else neutral (never a fabricated claim).
  let direction: WhatIfViewModel["direction"] = "none";
  if (deltaMonths !== null) {
    if (deltaMonths > 0) direction = "sooner";
    else if (deltaMonths < 0) direction = "later";
  }

  // Semantic signal — sooner=gain, later=warning; NEVER loss/destructive (this phase has no
  // destructive path, D-06 / UI-SPEC §Color).
  const signal: WhatIfViewModel["signal"] =
    direction === "sooner" ? "gain" : direction === "later" ? "warning" : "neutral";

  // Honest caveat — zero pace first (no ETA can exist), then low-confidence, else none (D-03).
  let caveat: WhatIfViewModel["caveat"] = "none";
  if (scenario.projectedMonthly <= 0) caveat = "zero-contribution";
  else if (!scenario.confident) caveat = "low-confidence";

  return { deltaMonths, direction, precise, signal, caveat };
}

/** Reset the three sliders to baseline (all 0) — the ephemeral, no-persist reset (D-06/D-08). */
export function resetValues(): SliderValues {
  return { extraMonthly: 0, lumpSum: 0, skipMonths: 0 };
}
