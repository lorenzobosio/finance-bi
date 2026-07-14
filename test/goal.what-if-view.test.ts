import { describe, expect, it } from "vitest";

// Wave-0 TDD RED (WHATIF-02, D-04/D-06/D-07) — freezes the PURE what-if panel view-model contract
// for the not-yet-existent module `@/lib/goal/what-if-view.ts` (built GREEN in Wave 2 / plan 10-03).
// RED at RUNTIME only ("Cannot find package '@/lib/goal/what-if-view'"); the COMPUTED import
// specifier keeps `tsc --noEmit` green while the module is absent (07-01/08-01/09 convention).
//
// The panel's DOM render is human-verified UAT (the vitest env is `node`, no DOM). What is
// node-testable — and what THIS suite freezes — is the panel's PURE decision logic, extracted into
// a helper the way `hero-view.ts` splits glance logic out of its client island (RESEARCH route (a)):
//   - the delta vs baseline (round(baseline − scenario); + = sooner) and its qualitative fallback,
//   - the direction → semantic-signal mapping (sooner→gain, later→warning, NEVER loss/destructive —
//     this panel has NO destructive path, D-06 / UI-SPEC §Color),
//   - the honest-caveat selection (low-confidence vs zero-contribution vs none),
//   - Reset-to-baseline,
//   - the purity / no-persist invariant (D-06/D-08 — the panel never mutates or persists real state).
//
// Synthetic € only; no PII. Do NOT weaken any assertion — RED-first; Wave 2 turns this GREEN.

const MODULE = "@/lib/goal/what-if-view";

/** The `projectGoal`-result subset the view-model consumes (structural — never imported). */
interface ProjectGoalResultLike {
  monthsToGoal: number | null;
  projectedMonthly: number;
  confident: boolean;
  confidence: number;
}

/** The frozen view-model output. Enum keys are asserted on (the SELECTION), not free copy. */
interface WhatIfViewModel {
  /** round(baseline.monthsToGoal − scenario.monthsToGoal); positive = sooner. Null when qualitative. */
  deltaMonths: number | null;
  /** The qualitative direction, always available even when a precise count is not. */
  direction: "sooner" | "later" | "none";
  /** True only when BOTH scenario and baseline are confident (a precise month count is allowed). */
  precise: boolean;
  /** Semantic signal: sooner→gain, later→warning, otherwise neutral. NEVER "loss"/"destructive". */
  signal: "gain" | "warning" | "neutral";
  /** Which honest caveat copy the readout selects. */
  caveat: "none" | "low-confidence" | "zero-contribution";
}

interface SliderValues {
  extraMonthly: number;
  lumpSum: number;
  skipMonths: number;
}

interface WhatIfViewModule {
  whatIfView: (
    scenario: ProjectGoalResultLike,
    baseline: ProjectGoalResultLike,
  ) => WhatIfViewModel;
  resetValues: () => SliderValues;
}

async function load(): Promise<WhatIfViewModule> {
  const mod = (await import(/* @vite-ignore */ MODULE)) as Record<string, unknown>;
  return {
    whatIfView: mod.whatIfView as WhatIfViewModule["whatIfView"],
    resetValues: mod.resetValues as WhatIfViewModule["resetValues"],
  };
}

/** A confident baseline result (~30 months to goal). */
const BASELINE: ProjectGoalResultLike = {
  monthsToGoal: 30,
  projectedMonthly: 4000,
  confident: true,
  confidence: 1,
};

describe("whatIfView — delta computation sign (WHATIF-02, D-07)", () => {
  it("more contribution/lump → SOONER (positive delta, direction 'sooner')", async () => {
    const { whatIfView } = await load();
    // A faster scenario reaches the goal in fewer months than the baseline.
    const scenario: ProjectGoalResultLike = { ...BASELINE, monthsToGoal: 22 };
    const vm = whatIfView(scenario, BASELINE);
    // round(30 − 22) = 8, positive → sooner.
    expect(vm.deltaMonths).toBe(8);
    expect(vm.direction).toBe("sooner");
  });

  it("positive skipMonths → LATER (negative delta, direction 'later')", async () => {
    const { whatIfView } = await load();
    const scenario: ProjectGoalResultLike = { ...BASELINE, monthsToGoal: 36 };
    const vm = whatIfView(scenario, BASELINE);
    // round(30 − 36) = −6, negative → later.
    expect(vm.deltaMonths).toBe(-6);
    expect(vm.direction).toBe("later");
  });
});

describe("whatIfView — qualitative vs precise selection (WHATIF-02, UI-SPEC Interaction Contract)", () => {
  it("either side not confident (monthsToGoal null) → qualitative delta, no false-precise count", async () => {
    const { whatIfView } = await load();
    const notConfident: ProjectGoalResultLike = {
      monthsToGoal: null,
      projectedMonthly: 4000,
      confident: false,
      confidence: 0,
    };
    const vm = whatIfView(notConfident, BASELINE);
    expect(vm.precise).toBe(false);
    // A qualitative direction is still offered, but never a fabricated month count.
    expect(vm.deltaMonths).toBeNull();
    expect(["sooner", "later", "none"]).toContain(vm.direction);
  });

  it("both sides confident → a precise month count is allowed", async () => {
    const { whatIfView } = await load();
    const scenario: ProjectGoalResultLike = { ...BASELINE, monthsToGoal: 22 };
    const vm = whatIfView(scenario, BASELINE);
    expect(vm.precise).toBe(true);
    expect(typeof vm.deltaMonths).toBe("number");
  });
});

describe("whatIfView — direction → semantic signal, NO destructive path (WHATIF-02, D-06 / UI-SPEC §Color)", () => {
  it("sooner → the gain signal", async () => {
    const { whatIfView } = await load();
    const vm = whatIfView({ ...BASELINE, monthsToGoal: 22 }, BASELINE);
    expect(vm.signal).toBe("gain");
  });

  it("later → the warning signal, NEVER a loss/destructive signal", async () => {
    const { whatIfView } = await load();
    const vm = whatIfView({ ...BASELINE, monthsToGoal: 36 }, BASELINE);
    expect(vm.signal).toBe("warning");
    // Absolute invariant for this phase: the amber warning, never red/destructive.
    expect(vm.signal).not.toBe("loss");
    expect(vm.signal).not.toBe("destructive");
  });
});

describe("whatIfView — honest caveat selection (WHATIF-02, D-03)", () => {
  it("scenario not confident → the low-confidence caveat is selected", async () => {
    const { whatIfView } = await load();
    const notConfident: ProjectGoalResultLike = {
      monthsToGoal: null,
      projectedMonthly: 4000,
      confident: false,
      confidence: 0,
    };
    const vm = whatIfView(notConfident, BASELINE);
    expect(vm.caveat).toBe("low-confidence");
  });

  it("projectedMonthly <= 0 → the zero-contribution caveat is selected", async () => {
    const { whatIfView } = await load();
    const zeroPace: ProjectGoalResultLike = {
      monthsToGoal: null,
      projectedMonthly: 0,
      confident: false,
      confidence: 0,
    };
    const vm = whatIfView(zeroPace, BASELINE);
    expect(vm.caveat).toBe("zero-contribution");
  });

  it("a confident scenario → no caveat", async () => {
    const { whatIfView } = await load();
    const vm = whatIfView({ ...BASELINE, monthsToGoal: 22 }, BASELINE);
    expect(vm.caveat).toBe("none");
  });
});

describe("whatIfView — reset to baseline (WHATIF-02, D-06)", () => {
  it("resetValues() returns all three slider values to 0", async () => {
    const { resetValues } = await load();
    expect(resetValues()).toEqual({ extraMonthly: 0, lumpSum: 0, skipMonths: 0 });
  });
});

describe("whatIfView — purity / no-persist invariant (WHATIF-02, D-06/D-08)", () => {
  it("does not mutate its inputs and returns a fresh plain object (no I/O, no persistence)", async () => {
    const { whatIfView } = await load();
    const scenario: ProjectGoalResultLike = { ...BASELINE, monthsToGoal: 22 };
    const baseline: ProjectGoalResultLike = { ...BASELINE };
    const scenarioSnapshot = { ...scenario };
    const baselineSnapshot = { ...baseline };

    const vm = whatIfView(scenario, baseline);

    // Inputs unchanged after the call — the node-expressible form of "never mutates real state".
    expect(scenario).toEqual(scenarioSnapshot);
    expect(baseline).toEqual(baselineSnapshot);
    // A fresh plain object, not an alias of either input.
    expect(vm).not.toBe(scenario);
    expect(vm).not.toBe(baseline);
    expect(typeof vm).toBe("object");
  });
});
