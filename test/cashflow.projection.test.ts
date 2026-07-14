import { describe, expect, it } from "vitest";

// Wave-0 TDD RED (FLOW-04, D-09/D-10/D-12) — freezes the cash-flow projection contract for the
// not-yet-existent PURE engine `@/lib/cashflow/projection.ts` (built GREEN in a later Phase-9 plan).
// RED at RUNTIME only ("Cannot find package '@/lib/cashflow/projection'"); the COMPUTED import
// specifier keeps `tsc --noEmit` green while the module is absent.
//
// The engine steps a balance forward month-by-month over `horizonMonths` (default 6, D-09), shaped
// so Phase-10 `projectGoal()` can reuse the stepping loop (momentum.ts:9 note). PURE — no clock;
// deterministic on the injected inputs.
//   - close = opening + expectedRecurringIncome − expectedRecurringOutflows − budgetedDiscretionary;
//     next month's opening = this month's close.
//   - the engine tells the WHOLE truth: it does NOT clamp below zero — the KPI floors, the chart
//     shows the honest warning zone (D-10 / UI-SPEC). `isProjected` drives the dashed segment.
//
// Synthetic € only; no PII.

const MODULE = "@/lib/cashflow/projection";

interface ProjectionMonth {
  periodKey: number; // YYYYMM
  opening: number;
  close: number;
  isProjected: boolean;
}

interface ProjectionInputs {
  openingBalance: number;
  startPeriodKey: number; // YYYYMM of the first projected month
  expectedRecurringIncome: number;
  expectedRecurringOutflows: number;
  budgetedDiscretionary: number;
}

interface ProjectionModule {
  projectCashflow: (inputs: ProjectionInputs, horizonMonths?: number) => ProjectionMonth[];
}

async function load(): Promise<ProjectionModule> {
  const mod = (await import(/* @vite-ignore */ MODULE)) as Record<string, unknown>;
  return { projectCashflow: mod.projectCashflow as ProjectionModule["projectCashflow"] };
}

const SURPLUS: ProjectionInputs = {
  openingBalance: 5000,
  startPeriodKey: 202604,
  expectedRecurringIncome: 8400,
  expectedRecurringOutflows: 3200,
  budgetedDiscretionary: 2000,
};

describe("projectCashflow — default horizon + balance-forward stepping (FLOW-04, D-09)", () => {
  it("defaults to a 6-month horizon", async () => {
    const { projectCashflow } = await load();
    expect(projectCashflow(SURPLUS)).toHaveLength(6);
  });

  it("honors an explicit horizon", async () => {
    const { projectCashflow } = await load();
    expect(projectCashflow(SURPLUS, 3)).toHaveLength(3);
  });

  it("computes month 1 close = opening + income − outflows − discretionary", async () => {
    const { projectCashflow } = await load();
    const m = projectCashflow(SURPLUS, 1)[0];
    // 5000 + 8400 − 3200 − 2000 = 8200
    expect(m.opening).toBe(5000);
    expect(m.close).toBe(8200);
    expect(m.periodKey).toBe(202604);
    expect(m.isProjected).toBe(true);
  });

  it("chains each month's opening to the prior month's close", async () => {
    const { projectCashflow } = await load();
    const months = projectCashflow(SURPLUS, 4);
    for (let i = 1; i < months.length; i++) {
      expect(months[i].opening).toBe(months[i - 1].close);
    }
  });

  it("increments periodKey month-by-month, rolling the year at December", async () => {
    const { projectCashflow } = await load();
    const months = projectCashflow({ ...SURPLUS, startPeriodKey: 202611 }, 3);
    expect(months.map((m) => m.periodKey)).toEqual([202611, 202612, 202701]);
  });
});

describe("projectCashflow — honest below-zero, NO clamp (D-10 / UI-SPEC)", () => {
  it("lets the balance go negative when outflows exceed income (the honest warning zone)", async () => {
    const { projectCashflow } = await load();
    const deficit: ProjectionInputs = {
      openingBalance: 1000,
      startPeriodKey: 202604,
      expectedRecurringIncome: 2000,
      expectedRecurringOutflows: 2500,
      budgetedDiscretionary: 1500,
    };
    // 1000 + 2000 − 2500 − 1500 = −1000 (the engine does NOT clamp)
    const m = projectCashflow(deficit, 1)[0];
    expect(m.close).toBe(-1000);
    expect(m.close).toBeLessThan(0);
  });
});

describe("projectCashflow — deterministic + NaN-safe (D-12)", () => {
  it("is deterministic on injected inputs (two calls deep-equal)", async () => {
    const { projectCashflow } = await load();
    expect(projectCashflow(SURPLUS)).toEqual(projectCashflow(SURPLUS));
  });

  it("never surfaces NaN/Infinity in opening/close", async () => {
    const { projectCashflow } = await load();
    for (const m of projectCashflow(SURPLUS)) {
      expect(Number.isFinite(m.opening)).toBe(true);
      expect(Number.isFinite(m.close)).toBe(true);
    }
  });
});
