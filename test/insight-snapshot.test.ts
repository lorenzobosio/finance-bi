import { describe, expect, it } from "vitest";

// Wave-0 TDD RED (AI-04) — freezes the PII-FIREWALL snapshot-builder contract for the
// not-yet-existent pure builder `@/lib/health/snapshot` (a later Phase-6 plan builds it). FAILS at
// import-resolution until the module lands — the intended Nyquist RED anchor, NOT a bug.
//
// The snapshot is the SINGLE thing the AI model ever sees (Pattern 2). `buildInsightSnapshot` is a
// PURE builder taking AGGREGATE inputs only (kpis, pnl current/previous, goal totals, the assembled
// scorecard, the anomaly flags) and returning the bounded Pattern-2 JSON. Raw `transactions` is
// structurally unreachable.
//
// The load-bearing assertion: the SERIALIZED snapshot contains NO raw-transaction field name — the
// firewall (AI-04). A bounded `anomalies` cap keeps prose runs tiny.
//
// Synthetic € only; no PII.
import { buildInsightSnapshot } from "@/lib/health/snapshot";

const INPUT = {
  period: { current: 202607, previous: 202606, launchDate: "2026-08-01" as string | null },
  kpis: { revenue: 9000, costs: 3200, investimento: 4000, result: 1800, margin: 0.2 },
  pnl: {
    current: { revenue: 9000, costs: 3200, investimento: 4000, subletNet: 200, result: 1800 },
    previous: { revenue: 8800, costs: 3400, investimento: 4000, subletNet: 200, result: 1600 },
  },
  goal: { wealthCostBasis: 56000, pctTo100k: 0.56, growthMoM: 4000 },
  scorecard: {
    savingsRate: { value: 0.31, band: "healthy", tone: "gain" },
    monthsOfReserve: { value: 7.2, band: "healthy", tone: "gain" },
    budgetAdherence: { value: 0, band: "healthy", tone: "gain" },
    investmentGrowth: { value: 4000, band: "healthy", tone: "gain", basis: "contributions" },
    streak: { value: 5, band: "healthy", tone: "gain" },
  },
  anomalies: [
    { scope: "lorenzo", actual: 600, budget: 500, remaining: -100, onPace: true },
    { scope: "fernanda", actual: 700, budget: 600, remaining: -100, onPace: true },
    { scope: "shared", actual: 800, budget: 750, remaining: -50, onPace: true },
    { scope: "groceries", actual: 400, budget: 350, remaining: -50, onPace: true },
    { scope: "transport", actual: 300, budget: 250, remaining: -50, onPace: true },
  ],
};

describe("buildInsightSnapshot — the Pattern-2 bounded aggregates shape (AI-04)", () => {
  const snapshot = buildInsightSnapshot(INPUT);

  it("returns exactly the 6 aggregate keys {period, kpis, pnl, goal, scorecard, anomalies}", () => {
    expect(Object.keys(snapshot).sort()).toEqual(
      ["anomalies", "goal", "kpis", "period", "pnl", "scorecard"].sort(),
    );
  });

  it("echoes the aggregate period + goal fields (pure passthrough, no recompute)", () => {
    expect(snapshot.period).toMatchObject({ current: 202607, previous: 202606 });
    expect(snapshot.goal).toMatchObject({ pctTo100k: 0.56 });
  });

  it("caps the anomalies array to a small number (bounded prose run)", () => {
    expect(snapshot.anomalies.length).toBeLessThanOrEqual(3);
  });
});

describe("buildInsightSnapshot — the PII firewall: no raw-transaction fields (AI-04)", () => {
  const serialized = JSON.stringify(buildInsightSnapshot(INPUT));

  // The raw-tx surface (columns on `transactions` the snapshot must NEVER carry).
  for (const forbidden of [
    "entry_reference",
    "counterparty",
    "booking_date",
    "description",
    "iban",
    "remittance",
  ]) {
    it(`the serialized snapshot contains no "${forbidden}" field`, () => {
      expect(serialized.toLowerCase().includes(forbidden)).toBe(false);
    });
  }
});
