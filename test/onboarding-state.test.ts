import { describe, expect, it } from "vitest";

// Wave-0 RED (ONB-01/02, D4-19/20) — freezes the onboarding predicate for the not-yet-existent
// `src/lib/onboarding/state.ts`. RED on import until the later wave builds it.
//
// `getOnboardingState(signals)` is a PURE function over three ALL-PERIODS boolean signals —
// `hasConnection`, `hasBudgets`, `hasTransactions` — returning `{ complete, nextStep, steps[] }`,
// re-derived every render (no stored flag — derived state self-heals). The ORDER is
// connect → budgets → alive; `nextStep` is the FIRST incomplete step. A returning user who is
// fully set up but whose CURRENT month is empty is NOT re-onboarded (ONB-02 — the predicate reads
// all-periods signals, so an empty current month never flips `complete` back to false).
import { getOnboardingState, type OnboardingSignals } from "@/lib/onboarding/state";

const signals = (
  hasConnection: boolean,
  hasBudgets: boolean,
  hasTransactions: boolean,
): OnboardingSignals => ({ hasConnection, hasBudgets, hasTransactions });

// All 8 boolean combinations of the three signals, with the expected nextStep (first false in
// the connect → budgets → alive order; null when all three are satisfied).
const CASES: Array<{
  c: boolean;
  b: boolean;
  t: boolean;
  complete: boolean;
  nextStep: string | null;
}> = [
  { c: false, b: false, t: false, complete: false, nextStep: "connect" },
  { c: false, b: false, t: true, complete: false, nextStep: "connect" },
  { c: false, b: true, t: false, complete: false, nextStep: "connect" },
  { c: false, b: true, t: true, complete: false, nextStep: "connect" },
  { c: true, b: false, t: false, complete: false, nextStep: "budgets" },
  { c: true, b: false, t: true, complete: false, nextStep: "budgets" },
  { c: true, b: true, t: false, complete: false, nextStep: "alive" },
  { c: true, b: true, t: true, complete: true, nextStep: null },
];

describe("getOnboardingState (ONB-01) — all 8 signal combinations", () => {
  for (const { c, b, t, complete, nextStep } of CASES) {
    it(`connect=${c} budgets=${b} alive=${t} → complete=${complete} nextStep=${nextStep}`, () => {
      const state = getOnboardingState(signals(c, b, t));
      expect(state.complete).toBe(complete);
      expect(state.nextStep).toBe(nextStep);
    });
  }

  it("complete is true ONLY when all three signals are true", () => {
    expect(getOnboardingState(signals(true, true, true)).complete).toBe(true);
    expect(getOnboardingState(signals(true, true, false)).complete).toBe(false);
  });

  it("exposes a three-step list in connect → budgets → alive order", () => {
    const steps = getOnboardingState(signals(false, false, false)).steps;
    expect(steps.map((s) => s.id)).toEqual(["connect", "budgets", "alive"]);
  });
});

describe("getOnboardingState (ONB-02) — a returning user in an empty current month is NOT re-onboarded", () => {
  it("all-periods signals true → complete true even though the current month has no new tx", () => {
    // The signals are ALL-PERIODS (hasTransactions = any period has data), so an empty CURRENT
    // month never flips a fully-set-up household back into onboarding.
    const state = getOnboardingState(signals(true, true, true));
    expect(state.complete).toBe(true);
    expect(state.nextStep).toBeNull();
  });
});
