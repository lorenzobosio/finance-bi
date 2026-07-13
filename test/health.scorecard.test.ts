import { describe, expect, it } from "vitest";

// Wave-0 TDD RED (HEALTH-01/02, D-06/08/09) — freezes the scorecard ASSEMBLER contract for the
// not-yet-existent pure module `@/lib/health/scorecard` (a later Phase-6 plan builds it). FAILS at
// import-resolution until the module lands — the intended Nyquist RED anchor, NOT a bug.
//
// The load-bearing invariant (HEALTH-02): the assembler NEVER recomputes a metric — it takes the
// PRE-COMPUTED values (from the existing pure helpers `savingsRate`, `monthsOfReserve`,
// `getGoalTotal`-MoM, `computeStreak`, and the bva overspend) plus a resolved thresholds object, and
// only resolves each into a discrete band + KpiTone. The AI never computes a scorecard number.
//
// D-09 (Pitfall 4): an income-dependent metric with no income (`savingsRate`/`monthsOfReserve`
// === null — the marts null-not-NaN convention) maps to a NEUTRAL "Not yet — starts at launch"
// read (band `neutral`, tone `neutral`) — NEVER `off-track`/`loss`. Tone map (UI-SPEC §2,
// kpi-card.tsx): healthy→gain, watch→warning, off-track→loss, neutral→neutral.
//
// D-08: investmentGrowth carries `basis: "contributions"` (cost-basis momentum, not market return).
//
// Synthetic € only; no PII.
import { assembleScorecard } from "@/lib/health/scorecard";
import type { StreakResult } from "@/lib/goal/streak";

// A resolved thresholds object (the nested shape `readInsightThresholds` returns) — the DEFAULT_BANDS
// numbers, inlined so this suite is RED ONLY for the absent scorecard module.
const THRESHOLDS = {
  savingsRate: { healthy: 0.2, watch: 0.1 },
  reserve: { healthy: 6, watch: 3 },
  budgetAdherence: { watchOverPct: 0.1 },
  streak: { watchMisses: 1 },
};

const HEALTHY_STREAK: StreakResult = {
  current: 5,
  longest: 6,
  comeback: false,
  provisionalHit: true,
  isBroken: false,
};

const BROKEN_STREAK: StreakResult = {
  current: 0,
  longest: 5,
  comeback: false,
  provisionalHit: false,
  isBroken: true,
};

describe("assembleScorecard — 5 metrics, each {value, band, tone} (HEALTH-01)", () => {
  const card = assembleScorecard(
    {
      savingsRate: 0.31,
      monthsOfReserve: 7.2,
      budgetOverspendPct: 0,
      investmentGrowth: 4000,
      streak: HEALTHY_STREAK,
    },
    THRESHOLDS,
  );

  it("returns exactly the 5 scorecard metrics", () => {
    expect(Object.keys(card).sort()).toEqual(
      ["budgetAdherence", "investmentGrowth", "monthsOfReserve", "savingsRate", "streak"].sort(),
    );
  });

  it("every metric carries a value, a band, and a tone", () => {
    for (const key of Object.keys(card) as Array<keyof typeof card>) {
      expect(card[key]).toHaveProperty("value");
      expect(card[key]).toHaveProperty("band");
      expect(card[key]).toHaveProperty("tone");
    }
  });

  it("resolves the all-healthy inputs to healthy/gain (does NOT recompute — echoes the passed value)", () => {
    expect(card.savingsRate).toMatchObject({ value: 0.31, band: "healthy", tone: "gain" });
    expect(card.monthsOfReserve).toMatchObject({ value: 7.2, band: "healthy", tone: "gain" });
    expect(card.budgetAdherence).toMatchObject({ band: "healthy", tone: "gain" });
    expect(card.streak).toMatchObject({ value: 5, band: "healthy", tone: "gain" });
  });

  it("investmentGrowth carries basis:'contributions' (D-08 cost-basis momentum, not market return)", () => {
    expect(card.investmentGrowth).toMatchObject({
      value: 4000,
      band: "healthy",
      tone: "gain",
      basis: "contributions",
    });
  });
});

describe("assembleScorecard — watch + off-track band resolution", () => {
  it("maps the mid bands to watch/warning", () => {
    const card = assembleScorecard(
      {
        savingsRate: 0.15, // 0.10 ≤ r < 0.20
        monthsOfReserve: 4, // 3 ≤ m < 6
        budgetOverspendPct: 0.05, // ≤ 10% over
        investmentGrowth: 4000,
        streak: BROKEN_STREAK, // one recent miss → watch, never shame (D-12)
      },
      THRESHOLDS,
    );
    expect(card.savingsRate).toMatchObject({ band: "watch", tone: "warning" });
    expect(card.monthsOfReserve).toMatchObject({ band: "watch", tone: "warning" });
    expect(card.budgetAdherence).toMatchObject({ band: "watch", tone: "warning" });
    expect(card.streak).toMatchObject({ band: "watch", tone: "warning" });
  });

  it("maps the low bands to off-track/loss (income present)", () => {
    const card = assembleScorecard(
      {
        savingsRate: 0.05, // < 0.10
        monthsOfReserve: 2, // < 3
        budgetOverspendPct: 0.2, // > 10% over
        investmentGrowth: 4000,
        streak: HEALTHY_STREAK,
      },
      THRESHOLDS,
    );
    expect(card.savingsRate).toMatchObject({ band: "off-track", tone: "loss" });
    expect(card.monthsOfReserve).toMatchObject({ band: "off-track", tone: "loss" });
    expect(card.budgetAdherence).toMatchObject({ band: "off-track", tone: "loss" });
  });
});

describe("assembleScorecard — D-09 pre-launch / no-income NEVER shows red (Pitfall 4)", () => {
  const card = assembleScorecard(
    {
      savingsRate: null, // no revenue → the marts null-not-NaN convention
      monthsOfReserve: null, // no cost history
      budgetOverspendPct: 0,
      investmentGrowth: 0,
      streak: BROKEN_STREAK,
    },
    THRESHOLDS,
  );

  it("maps a null savingsRate to neutral, never off-track/loss", () => {
    expect(card.savingsRate.band).toBe("neutral");
    expect(card.savingsRate.tone).toBe("neutral");
    expect(card.savingsRate.band).not.toBe("off-track");
    expect(card.savingsRate.tone).not.toBe("loss");
  });

  it("maps a null monthsOfReserve to neutral, never off-track/loss", () => {
    expect(card.monthsOfReserve.band).toBe("neutral");
    expect(card.monthsOfReserve.tone).toBe("neutral");
    expect(card.monthsOfReserve.tone).not.toBe("loss");
  });
});
