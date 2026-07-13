import { describe, expect, it } from "vitest";

// Wave-0 RED stub (CAT-06, BI-01/02/07) — freezes the analytics-mart contract for the
// not-yet-existent src/lib/db/marts.ts (Plan 03 creates the typed pgView definitions +
// the pure formula helpers the SQL views replicate). This suite fails at import-resolution
// time until those helpers land — the intended Nyquist RED anchor, NOT a bug.
//
// Mart-harness decision (RESEARCH § Validation Architecture): a PURE-TS formula/filter
// MIRROR — NOT pg-mem / a fixture DB. The SQL views replicate the same math, so asserting
// the pure formula here keeps the suite DB-free, deterministic, and dependency-free
// (no pg-mem added to package.json — T-02-SC).
//
// Fixtures use SYNTHETIC round numbers only (1000, 500, …) — never real salary/rent/balance
// figures, no real merchant names, no IBANs (T-02-01, source-cleanliness guard stays green).
import {
  householdResult,
  householdMargin,
  sumCosts,
  sumRevenue,
  subletNet,
  budgetVsActual,
  monthsOfReserve,
  type MartTx,
  type PnlBuckets,
} from "@/lib/db/marts";
import { applyRules, type RuleAccount } from "@/lib/ingestion/rules/engine";

// A minimal classified-transaction row the pure mart formulas consume. `flowType` and
// `costCenter` are the engine's outputs (rules.test.ts contract); the marts read them.
const tx = (
  flowType: MartTx["flowType"],
  amount: number,
  costCenter: MartTx["costCenter"] = "shared",
  categoryId: string | null = null,
): MartTx => ({ flowType, amount, costCenter, categoryId });

describe("P&L formula (BI-01) — result = revenue − investimento − costs + sublet_net", () => {
  it("computes household result from the four buckets", () => {
    // revenue 1000, investimento 400, costs 300, sublet_net 100 → 1000 − 400 − 300 + 100 = 400
    expect(
      householdResult({ revenue: 1000, investimento: 400, costs: 300, subletNet: 100 }),
    ).toBe(400);
  });

  it("margin = result ÷ revenue", () => {
    expect(
      householdMargin({ revenue: 1000, investimento: 400, costs: 300, subletNet: 100 }),
    ).toBeCloseTo(0.4, 5);
  });

  it("revenue = 0 → margin is null (no divide-by-zero, BI-01)", () => {
    expect(
      householdMargin({ revenue: 0, investimento: 0, costs: 0, subletNet: 0 }),
    ).toBeNull();
  });
});

describe("exclusion invariant (CAT-06) — investimento/transferencia never enter cost/revenue SUMs", () => {
  const rows: MartTx[] = [
    tx("revenue", 1000),
    tx("cost", 300),
    tx("investimento", 400),
    tx("transferencia", 250),
  ];

  it("sumCosts excludes investimento and transferencia", () => {
    expect(sumCosts(rows)).toBe(300);
  });

  it("sumRevenue excludes investimento and transferencia", () => {
    expect(sumRevenue(rows)).toBe(1000);
  });
});

describe("sublet-net invariant (BI-01/D2-07) — household excludes sublet gross, counts net once", () => {
  const rows: MartTx[] = [
    tx("revenue", 800, "sublocacao"), // sublet rent received (gross leg)
    tx("cost", 200, "sublocacao"), // sublet utilities paid (gross leg)
    tx("revenue", 1000, "shared"), // household salary
  ];

  it("household revenue excludes the sublet gross legs", () => {
    expect(sumRevenue(rows.filter((r) => r.costCenter !== "sublocacao"))).toBe(1000);
  });

  it("subletNet = received − paid, counted exactly once", () => {
    expect(subletNet(rows)).toBe(600); // 800 − 200
  });
});

describe("budget-vs-actual at BOTH grains (BI-02/D2-14)", () => {
  it("cost-center grain when categoryId is null", () => {
    const out = budgetVsActual({ costCenter: "lorenzo", categoryId: null, budget: 1000, actual: 750 });
    expect(out.grain).toBe("cost_center");
    expect(out.remaining).toBe(250);
  });

  it("category grain when categoryId is set", () => {
    const out = budgetVsActual({ costCenter: "lorenzo", categoryId: "cat-food", budget: 500, actual: 600 });
    expect(out.grain).toBe("category");
    expect(out.remaining).toBe(-100); // over budget
  });
});

describe("months-of-reserve (BI-07) — cash ÷ trailing-3-month avg costs", () => {
  it("divides liquid cash by the trailing-3-month average monthly cost", () => {
    // cash 9000, trailing-3 costs [3000, 3000, 3000] → avg 3000 → 3 months
    expect(monthsOfReserve(9000, [3000, 3000, 3000])).toBeCloseTo(3, 5);
  });
});

// Wave-0 RED (DSN-06b) — the negative-cost-margin bug guard, end-to-end engine→mart.
// RED until Plan 03-02 classifies an unmatched positive inflow as `revenue`
// (revenue_unclassified). TODAY `applyRules` returns `cost` for such an inflow, so the
// mart would sum a positive €150 inflow INTO costs (inflating costs and crushing margin) and
// NEVER into revenue — the exact bug this phase fixes. We classify with the real engine, then
// feed the engine's output into the pure mart SUMs, proving the inflow lands in revenue, not
// cost. Synthetic round numbers only — no real figures.
describe("mart never sums a positive inflow as a negative cost (DSN-06b, engine→mart)", () => {
  const SHARED: RuleAccount = {
    id: "acct-shared",
    iban: "DE00SHARED",
    defaultCostCenter: "shared",
    isInvestment: false,
  };
  const accountsById = new Map<string, RuleAccount>([[SHARED.id, SHARED]]);

  // An unmatched positive inflow (not salary/sublet/transfer/credit-onto-investing).
  const classification = applyRules(
    {
      accountId: SHARED.id,
      amount: 150,
      counterpartyName: "Guest",
      counterpartyIban: "DE00GUEST",
      normalizedDescription: "payment received",
    },
    accountsById,
  );

  const martRow: MartTx = {
    flowType: classification.flowType,
    amount: 150,
    costCenter: classification.costCenter,
    categoryId: null,
  };

  it("a revenue_unclassified inflow counts as REVENUE", () => {
    expect(sumRevenue([martRow])).toBe(150);
  });

  it("a revenue_unclassified inflow NEVER subtracts from costs", () => {
    expect(sumCosts([martRow])).toBe(0);
  });
});

// Wave-0 TDD RED (BI-08, D5-19) — the operating-margin reframe helper. The headline house-as-
// business figure becomes OPERATING MARGIN (revenue − costs (+ subletNet)); investimento moves
// BELOW the line (never subtracted from operating margin) and the "EXCLUDED / −44,5%" label is
// dropped. Add a pure `operatingMargin(b: PnlBuckets)` sibling to householdResult so the number is
// tested like every other formula. RED until Plan 02 adds the helper — a DYNAMIC import keeps the
// rest of this (green) suite green; only these cases fail (operatingMargin is undefined today).
describe("operating-margin (BI-08) — operatingMargin = revenue − costs (+ subletNet), investimento NOT subtracted", () => {
  it("operating-margin: returns a €-value distinct from householdResult (investimento below the line)", async () => {
    const mod = (await import("@/lib/db/marts")) as Record<string, unknown>;
    const operatingMargin = mod.operatingMargin as (b: PnlBuckets) => number;
    // RED trigger: the helper does not exist yet.
    expect(typeof operatingMargin).toBe("function");

    // revenue 1000, costs 300, subletNet 100 → operating margin = 1000 − 300 + 100 = 800.
    const b: PnlBuckets = { revenue: 1000, investimento: 400, costs: 300, subletNet: 100 };
    expect(operatingMargin(b)).toBe(800);
    // …and distinct from the full household result, which DOES subtract investimento (400) → 400.
    expect(operatingMargin(b)).not.toBe(householdResult(b));
    expect(householdResult(b)).toBe(400);
  });

  it("operating-margin: investimento is below the line — changing it does not move operating margin", async () => {
    const mod = (await import("@/lib/db/marts")) as Record<string, unknown>;
    const operatingMargin = mod.operatingMargin as (b: PnlBuckets) => number;
    expect(typeof operatingMargin).toBe("function");

    const base: PnlBuckets = { revenue: 1000, investimento: 400, costs: 300, subletNet: 100 };
    const moreInvested: PnlBuckets = { ...base, investimento: 9999 };
    expect(operatingMargin(moreInvested)).toBe(operatingMargin(base));
  });
});
