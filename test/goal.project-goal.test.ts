import { describe, expect, it } from "vitest";
import { etaLine } from "@/lib/goal/hero-view";

// Wave-0 TDD RED (WHATIF-01, D-01/D-02/D-03) — freezes the pure `projectGoal` engine contract for
// the not-yet-existent module `@/lib/goal/project-goal.ts` (built GREEN in Wave 1 / plan 10-02).
// RED at RUNTIME only ("Cannot find package '@/lib/goal/project-goal'"); the COMPUTED import
// specifier keeps `tsc --noEmit` green while the module is absent (07-01/08-01/09 convention — a
// static `import`/`import type` of the missing module would be a TS2307 typecheck break).
//
// `projectGoal` WRAPS the existing `computeEta` (momentum.ts) and reuses `GOAL_EUR` — the correct
// amount of new math is near-zero orchestration (clamp, subtract lump, adjust pace, add skip delay,
// delegate to computeEta). The single highest-value invariant (D-03, RESEARCH Pitfall 1): the
// HONEST confidence gate is driven by the REAL trailing history, NOT the synthetic constant slider
// pace (whose coefficient of variation is 0 and would otherwise always read `confident:true`).
//
// Synthetic € only; no PII. Do NOT weaken any assertion to make it pass — RED-first.

const MODULE = "@/lib/goal/project-goal";

/** The frozen input shape (structural — never statically imported from the absent module). */
interface ProjectGoalInput {
  currentInvested: number;
  baseMonthlyContribution: number;
  trailingContributions: number[];
  extraMonthly?: number;
  lumpSum?: number;
  skipMonths?: number;
  goal?: number;
}

/** The frozen result shape. `eta` is `EtaResult`-compatible so `etaLine(result.eta)` round-trips. */
interface EtaShape {
  confident: boolean;
  minYears: number | null;
  maxYears: number | null;
  message: string;
  confidence: number;
}
interface ProjectGoalResult {
  eta: EtaShape;
  monthsToGoal: number | null;
  projectedMonthly: number;
  confident: boolean;
  confidence: number;
}

interface ProjectGoalModule {
  projectGoal: (input: ProjectGoalInput) => ProjectGoalResult;
}

async function load(): Promise<ProjectGoalModule> {
  const mod = (await import(/* @vite-ignore */ MODULE)) as Record<string, unknown>;
  return { projectGoal: mod.projectGoal as ProjectGoalModule["projectGoal"] };
}

/** A confident baseline: ≥2 funded, low-CV (zero-variance) trailing history → the gate passes. */
const CONFIDENT_BASE: ProjectGoalInput = {
  currentInvested: 4000,
  baseMonthlyContribution: 4000,
  trailingContributions: [4000, 4000, 4000],
};

describe("projectGoal — steady confident pace (WHATIF-01, D-01/D-02)", () => {
  it("returns confident:true, a non-null EtaResult range, and a positive numeric monthsToGoal", async () => {
    const { projectGoal } = await load();
    const r = projectGoal(CONFIDENT_BASE);

    expect(r.confident).toBe(true);
    expect(r.eta.confident).toBe(true);
    expect(typeof r.eta.minYears).toBe("number");
    expect(typeof r.eta.maxYears).toBe("number");
    expect(Number.isFinite(r.eta.minYears as number)).toBe(true);
    expect(Number.isFinite(r.eta.maxYears as number)).toBe(true);
    expect(r.eta.maxYears as number).toBeGreaterThanOrEqual(r.eta.minYears as number);

    expect(typeof r.monthsToGoal).toBe("number");
    expect(r.monthsToGoal as number).toBeGreaterThan(0);
    expect(Number.isFinite(r.monthsToGoal as number)).toBe(true);
    expect(r.projectedMonthly).toBeGreaterThan(0);
  });
});

describe("projectGoal — lump sum ≥ remaining → reached now (WHATIF-01, D-07, Pitfall 3)", () => {
  it("fully covers the remaining balance → monthsToGoal === 0 (panel special-cases the copy, not etaLine)", async () => {
    const { projectGoal } = await load();
    // remaining = goal − currentInvested − lumpSum; a lump ≥ the shortfall drives remaining to 0.
    const r = projectGoal({
      ...CONFIDENT_BASE,
      currentInvested: 40_000,
      lumpSum: 70_000, // 40k + 70k ≥ 100k → remaining 0
    });
    // The engine returns 0 (NOT etaLine, whose roundYears floors at 1 year — Pitfall 3).
    expect(r.monthsToGoal).toBe(0);
  });
});

describe("projectGoal — skipMonths shifts the ETA later (WHATIF-01, A5)", () => {
  it("a positive skipMonths yields larger min/maxYears and a larger monthsToGoal than skipMonths=0", async () => {
    const { projectGoal } = await load();
    const base = projectGoal({ ...CONFIDENT_BASE, skipMonths: 0 });
    const delayed = projectGoal({ ...CONFIDENT_BASE, skipMonths: 6 });

    expect(base.confident).toBe(true);
    expect(delayed.confident).toBe(true);
    expect(delayed.eta.minYears as number).toBeGreaterThan(base.eta.minYears as number);
    expect(delayed.eta.maxYears as number).toBeGreaterThan(base.eta.maxYears as number);
    expect(delayed.monthsToGoal as number).toBeGreaterThan(base.monthsToGoal as number);
  });
});

describe("projectGoal — zero contribution never yields Infinity/NaN (WHATIF-01, Pitfall 5)", () => {
  it("projectedMonthly <= 0 → not confident, monthsToGoal null, all numeric fields finite", async () => {
    const { projectGoal } = await load();
    const r = projectGoal({
      currentInvested: 4000,
      baseMonthlyContribution: 0,
      extraMonthly: 0,
      trailingContributions: [4000, 4000, 4000],
    });
    expect(r.confident).toBe(false);
    expect(r.monthsToGoal).toBeNull();
    // Never Infinity/NaN — the divide-by-zero-safe contract.
    expect(Number.isFinite(r.projectedMonthly)).toBe(true);
    expect(Number.isNaN(r.projectedMonthly)).toBe(false);
    expect(r.projectedMonthly).not.toBe(Infinity);
  });
});

describe("projectGoal — confidence-CV pitfall: flat synthetic pace must NOT flip confidence (WHATIF-01, D-03, Pitfall 1)", () => {
  it("a <2-funded-month baseline stays confident:false regardless of large slider values (the anti-Pitfall-1 honesty gate)", async () => {
    const { projectGoal } = await load();
    // Only ONE funded trailing month → the REAL history fails the confidence gate. The sliders
    // project a CONSTANT pace (coefficient of variation 0) which, if fed to computeEta as the GATE,
    // would read confident:true and silently defeat the Phase-5 honesty gate. The engine MUST gate
    // on `trailingContributions`, so even huge extraMonthly/lumpSum cannot manufacture confidence.
    const r = projectGoal({
      currentInvested: 1000,
      baseMonthlyContribution: 4000,
      trailingContributions: [4000, 0, 0], // one funded month → below MIN_FUNDED_MONTHS
      extraMonthly: 2000,
      lumpSum: 15_000,
    });
    expect(r.confident).toBe(false);
    expect(r.eta.confident).toBe(false);
    expect(r.monthsToGoal).toBeNull();
  });

  it("a HIGH-CV (too-noisy) baseline stays confident:false regardless of slider values", async () => {
    const { projectGoal } = await load();
    // ≥2 funded months but wildly noisy → CV above the gate ceiling → still not confident.
    const r = projectGoal({
      currentInvested: 1000,
      baseMonthlyContribution: 4000,
      trailingContributions: [10_000, 100, 8000, 50], // very high coefficient of variation
      extraMonthly: 2000,
      lumpSum: 15_000,
    });
    expect(r.confident).toBe(false);
    expect(r.monthsToGoal).toBeNull();
  });
});

describe("projectGoal — negative / NaN inputs clamp to a finite result (WHATIF-01, Pitfall 5)", () => {
  it("negative extraMonthly and NaN currentInvested coerce/clamp → never NaN/Infinity in any numeric field", async () => {
    const { projectGoal } = await load();
    const r = projectGoal({
      currentInvested: NaN,
      baseMonthlyContribution: 4000,
      trailingContributions: [4000, 4000, 4000],
      extraMonthly: -9999, // negative → clamp so projectedMonthly stays ≥ 0
      lumpSum: NaN,
      skipMonths: -3,
    });
    // Every numeric field must be finite (mirror the cashflow finite() guard).
    expect(Number.isFinite(r.projectedMonthly)).toBe(true);
    expect(r.projectedMonthly).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(r.confidence)).toBe(true);
    if (r.monthsToGoal !== null) {
      expect(Number.isFinite(r.monthsToGoal)).toBe(true);
      expect(Number.isNaN(r.monthsToGoal)).toBe(false);
    }
    if (r.eta.minYears !== null) {
      expect(Number.isFinite(r.eta.minYears)).toBe(true);
    }
    if (r.eta.maxYears !== null) {
      expect(Number.isFinite(r.eta.maxYears)).toBe(true);
    }
  });
});

describe("projectGoal — return-shape compatible with etaLine (WHATIF-01, Pitfall 2)", () => {
  it("etaLine(result.eta) round-trips to a non-empty string (no bespoke date formatter)", async () => {
    const { projectGoal } = await load();
    // etaLine is imported STATICALLY (hero-view.ts already exists) and called on result.eta.
    const confidentLine = etaLine(projectGoal(CONFIDENT_BASE).eta);
    expect(typeof confidentLine).toBe("string");
    expect(confidentLine.length).toBeGreaterThan(0);

    // The not-confident branch must ALSO be etaLine-compatible (returns the "building" copy).
    const notConfident = projectGoal({
      currentInvested: 1000,
      baseMonthlyContribution: 4000,
      trailingContributions: [4000], // below the gate
    });
    const buildingLine = etaLine(notConfident.eta);
    expect(typeof buildingLine).toBe("string");
    expect(buildingLine.length).toBeGreaterThan(0);
  });
});
