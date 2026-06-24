// src/lib/onboarding/state.ts — the PURE onboarding predicate (ONB-01 / ONB-02, D4-19).
//
// `getOnboardingState(signals)` is a pure function over three boolean, ALL-PERIODS signals —
// `hasConnection`, `hasBudgets`, `hasTransactions` — returning `{ complete, nextStep, steps[] }`.
// It is re-derived every render (NO stored `onboarding_completed` flag): derived state self-heals,
// so disconnecting a bank re-opens the "connect" step automatically. The order is fixed —
// connect → budgets → alive — and `nextStep` is the FIRST not-done step (null when complete).
//
// ONB-02 (returning user): the signals are ALL-PERIODS (hasTransactions = any period has data),
// so an empty CURRENT month never flips a fully-set-up household back into onboarding. `complete`
// is true ONLY when all three signals are true.
//
// Pure by construction: NO DB handle, NO data-client import. The Home RSC computes the 3 signals
// (is_demo-gated via the chokepoint) and feeds them here; the checklist component renders the
// `steps[]`/`nextStep` it returns. Step targets are `/config?tab=` deep-links (D4-22); the "alive"
// step is informational (Home itself, no link). Mirrors the pure-helper convention of format.ts.

/** The three all-periods boolean signals the onboarding predicate is derived from. */
export interface OnboardingSignals {
  /** Any non-error `connections` row exists (period-agnostic). */
  hasConnection: boolean;
  /** Any `budgets` row exists (period-agnostic). */
  hasBudgets: boolean;
  /** Any P&L data exists in ANY period (reuse the Home `allPnl.length > 0` probe — NOT a 2nd read). */
  hasTransactions: boolean;
}

/** The fixed step ids, in their canonical connect → budgets → alive order. */
export type OnboardingStepId = "connect" | "budgets" | "alive";

/** One rendered step: its id, whether it is done, and its deep-link target (Home for "alive"). */
export interface OnboardingStep {
  id: OnboardingStepId;
  done: boolean;
  /** The `/config?tab=` deep-link (D4-22); the informational "alive" step points at Home ("/"). */
  target: string;
}

/** The derived onboarding state: complete + the next incomplete step + the full step list. */
export interface OnboardingState {
  complete: boolean;
  nextStep: OnboardingStepId | null;
  steps: OnboardingStep[];
}

/**
 * getOnboardingState — derive the onboarding state from the three all-periods signals.
 * Pure: same input → same output, no side effects, no DB. `complete` is true only when all three
 * signals are true; `nextStep` is the first not-done step in the connect → budgets → alive order.
 */
export function getOnboardingState(signals: OnboardingSignals): OnboardingState {
  const steps: OnboardingStep[] = [
    { id: "connect", done: signals.hasConnection, target: "/config?tab=connection" },
    { id: "budgets", done: signals.hasBudgets, target: "/config?tab=budgets" },
    { id: "alive", done: signals.hasTransactions, target: "/" },
  ];

  const firstTodo = steps.find((s) => !s.done);
  const complete = firstTodo === undefined;

  return {
    complete,
    nextStep: complete ? null : (firstTodo as OnboardingStep).id,
    steps,
  };
}
