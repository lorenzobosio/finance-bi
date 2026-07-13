import { describe, expect, it } from "vitest";

// Wave-0 RED (DEMO-01, D4-01/03/04/05/06/07/08/18) — freezes the deterministic seed
// generator contract for the not-yet-existent `src/lib/demo/generator.ts` (a later wave
// creates `generateDemoHousehold(seed?): DemoDataset`). This suite fails at import-resolution
// time until the generator lands — the intended Nyquist RED anchor, NOT a bug.
//
// The generator is the SINGLE source for both the public demo seed AND the Phase-7 E2E
// fixtures (D4-18), so this file IS the fixture contract: it feeds the generator's output
// through the LIVE `src/lib/db/marts.ts` pure formulas (the same math the SQL views run) and
// asserts the 5 narrative facts reconcile EXACTLY. Any change that breaks this blocks Phase 7.
//
// No real figures / no PII: the only money literal asserted is the LOCKED ~€55,000 demo
// investimento cost-basis (D4-01), which is fictional-by-design. The no-PII regex below proves
// the serialized dataset carries no @-sign, no IBAN shape, and no real owner names.
import {
  sumInvestimento,
  computePnl,
  computeMonthsOfReserve,
  subletNet,
  type MartTx,
} from "@/lib/db/marts";
// The not-yet-existent generator — RED on import until the later wave builds it.
import { generateDemoHousehold, DEMO_PERSONA } from "@/lib/demo/generator";

// The LOCKED demo investimento cost-basis (D4-01, ~€55k bucket). Asserted as a concrete figure
// so the streak arithmetic must reconcile to it exactly (no PRNG on the streak totals — D4-05).
// It is the nearest whole-€4k-streak total to the "~€55,000" CONTEXT figure: 14 paying months ×
// €4,000 = €56,000 (one €0 break month excluded). The all-€4k streak assertions below
// (every non-break month === 4000) are only satisfiable on a €4,000 multiple, so the locked
// figure is €56,000 — past the crossed €50k milestone, €75k still pending, ~56% to €100k.
const DEMO_INVESTIMENTO_TOTAL = 56000;

// Map the generator's transaction rows onto the pure-mart row shape (`MartTx`). The generator
// emits live-schema columns (flow_type / amount_eur / cost_center / category_id); the marts read
// positive magnitudes, so this adapter mirrors what the SQL view's FILTERs do.
function toMartRows(ds: ReturnType<typeof generateDemoHousehold>): MartTx[] {
  return ds.transactions.map((t) => ({
    flowType: t.flowType,
    amount: Math.abs(t.amountEur),
    costCenter: t.costCenter,
    categoryId: t.categoryId ?? null,
  }));
}

describe("generateDemoHousehold — determinism (D4-05)", () => {
  it("is byte-deterministic: the same seed yields deep-equal output across two calls", () => {
    const a = generateDemoHousehold(42);
    const b = generateDemoHousehold(42);
    expect(b).toEqual(a);
    // Serialized form is identical too (the Phase-7 single-source guarantee).
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });

  it("defaults to a fixed seed when none is passed (reproducible fixture)", () => {
    expect(generateDemoHousehold()).toEqual(generateDemoHousehold());
  });
});

describe("generateDemoHousehold — the 5 narrative facts reconcile through marts.ts (D4-18)", () => {
  const ds = generateDemoHousehold(42);
  const rows = toMartRows(ds);

  it("fact 1 — investimento legs sum EXACTLY to the locked ~€55,000 (D4-01)", () => {
    // sumInvestimento over the investimento flow_type legs is the goal cost-basis — NOT a
    // balance row (D4-04). The streak totals are arithmetic, so this is exact, not approximate.
    expect(sumInvestimento(rows)).toBe(DEMO_INVESTIMENTO_TOTAL);
  });

  it("fact 2 — the €4k streak has a multi-month run, exactly ONE €0 break, then recovery (D4-03)", () => {
    const monthly = ds.investmentStreak; // [{ periodKey, amountEur }, …] ascending
    expect(monthly.length).toBeGreaterThanOrEqual(6);
    const zeroMonths = monthly.filter((m) => m.amountEur === 0);
    expect(zeroMonths).toHaveLength(1); // exactly ONE deliberate break (a clean €0, not partial)
    const breakIdx = monthly.findIndex((m) => m.amountEur === 0);
    // a multi-month €4k run BEFORE the break …
    expect(breakIdx).toBeGreaterThanOrEqual(2);
    expect(monthly.slice(0, breakIdx).every((m) => m.amountEur === 4000)).toBe(true);
    // … and a resumed €4k AFTER it (recovery).
    expect(monthly.slice(breakIdx + 1).every((m) => m.amountEur === 4000)).toBe(true);
    // the streak amounts reconcile to the locked total.
    expect(monthly.reduce((acc, m) => acc + m.amountEur, 0)).toBe(DEMO_INVESTIMENTO_TOTAL);
  });

  it("fact 3 — milestones 10k/25k/50k are achieved; 75k is NOT (D4-03)", () => {
    const byThreshold = new Map(ds.milestones.map((m) => [m.thresholdEur, m]));
    for (const t of [10000, 25000, 50000]) {
      expect(byThreshold.get(t)?.achievedAt).toBeTruthy();
    }
    const m75 = byThreshold.get(75000);
    expect(m75).toBeDefined();
    expect(m75?.achievedAt ?? null).toBeNull(); // tension: 75k pending (~55% to €100k)
  });

  it("fact 4 — months-of-reserve is finite from the cash-only ~€12k split (D4-04)", () => {
    const reserve = computeMonthsOfReserve(ds.cashReserveEur, ds.trailingMonthlyCosts);
    expect(reserve).not.toBeNull();
    expect(Number.isFinite(reserve as number)).toBe(true);
    expect(reserve as number).toBeGreaterThan(0);
  });

  it("fact 5 — the full P&L computes (revenue − investimento − costs + sublet_net) without NaN", () => {
    const buckets = {
      revenue: rows
        .filter((r) => r.flowType === "revenue" && r.costCenter !== "sublocacao")
        .reduce((acc, r) => acc + r.amount, 0),
      investimento: sumInvestimento(rows),
      costs: rows
        .filter((r) => r.flowType === "cost" && r.costCenter !== "sublocacao")
        .reduce((acc, r) => acc + r.amount, 0),
      subletNet: subletNet(rows),
    };
    const pnl = computePnl(buckets);
    expect(Number.isNaN(pnl.result)).toBe(false);
    expect(pnl.investimento).toBe(DEMO_INVESTIMENTO_TOTAL);
  });
});

describe("generateDemoHousehold — no PII in the serialized dataset (D4-06, R-D)", () => {
  const ds = generateDemoHousehold(42);
  const serialized = JSON.stringify(ds);

  it("contains no @-sign (no email literal anywhere in the seed)", () => {
    expect(serialized.includes("@")).toBe(false);
  });

  it("contains no IBAN-shaped token (two letters, two digits, then 4+ alphanumerics)", () => {
    // Pattern only — never a real IBAN. Word-boundaried so ordinary words do not false-positive.
    const ibanShape = /\b[A-Z]{2}[0-9]{2}[A-Z0-9]{4,}\b/;
    expect(ibanShape.test(serialized)).toBe(false);
  });

  it("sets counterparty_iban null on every transaction row (D4-06)", () => {
    expect(ds.transactions.every((t) => t.counterpartyIban === null)).toBe(true);
  });

  it("uses the fictional DEMO_PERSONA names, never the real owners (D4-08/26)", () => {
    expect(DEMO_PERSONA.members.length).toBeGreaterThanOrEqual(2);
    const lc = serialized.toLowerCase();
    // The real owner names must never appear in a public-demo artifact.
    expect(lc.includes("lorenzo")).toBe(false);
    expect(lc.includes("fernanda")).toBe(false);
    // The persona labels DO appear (they drive the cost-center labels in the demo).
    expect(DEMO_PERSONA.members.every((name) => name.length > 0)).toBe(true);
  });

  it("flags every generated row is_demo=true (the isolation invariant, D4-09)", () => {
    expect(ds.transactions.every((t) => t.isDemo === true)).toBe(true);
  });
});

// Wave-0 TDD RED (GOAL-04/07/08/10, D5-16) — the demo bucket-funding contract. Plan 09 extends the
// generator with a few SURPLUS (>€4k) transfer months + an early demo launch date so the waterfall
// funds Brazil/Adventures and a €10k Adventures-small tranche unlocks, ON TOP OF the existing
// break-and-recover streak (D4-03). This freezes what the extended demo MUST reconcile to when
// folded through the (future) pure engine `@/lib/goal/allocation` — RED today for two right reasons:
// the engine does not exist yet (Plan 02) AND the generator seeds no surplus yet (Plan 09).
//
// A DYNAMIC import of the not-yet-existent engine keeps the rest of this (green) suite green — only
// these folded cases fail. Synthetic € only; the no-PII + arithmetic-total invariants above stay.
describe("generateDemoHousehold — demo funds the buckets when folded through the pure engine (GOAL-07/08/10)", () => {
  const ds = generateDemoHousehold(42);

  // Build allocation transfers from the demo's monthly investimento legs (post-launch, > €0).
  function transfersFromStreak() {
    return ds.investmentStreak
      .filter((m) => m.amountEur > 0)
      .map((m) => {
        const year = Math.floor(m.periodKey / 100);
        const month = String(m.periodKey % 100).padStart(2, "0");
        return { kind: "transfer" as const, amount: m.amountEur, bookingDate: `${year}-${month}-15` };
      });
  }

  it("seeds ≥1 surplus (>€4k) transfer month so the waterfall can spill into Brazil/Adventures (Plan 09)", () => {
    // RED until Plan 09: today every paying month is EXACTLY €4,000 (nothing spills past Wealth).
    expect(ds.investmentStreak.some((m) => m.amountEur > 4000)).toBe(true);
  });

  it("folds to a funded Brazil bucket (balance > 0) and ≥1 UNLOCKED Adventures-small tranche (spendable > 0)", async () => {
    const eng = (await import("@/lib/goal/allocation")) as Record<string, unknown>;
    const foldAllocation = eng.foldAllocation as (
      events: Array<{ kind: "transfer"; amount: number; bookingDate: string }>,
      opts: { launchDate: string | null },
    ) => { brazil: number };
    const spendableAdventuresSmall = eng.spendableAdventuresSmall as (
      s: { advSmallUnlocked: number },
    ) => number;

    const state = foldAllocation(transfersFromStreak(), { launchDate: "2025-01-01" });
    expect(state.brazil).toBeGreaterThan(0); // Brazil sinking fund accrued from the surplus
    expect(spendableAdventuresSmall(state as unknown as { advSmallUnlocked: number })).toBeGreaterThan(0); // a tranche unlocked
  });

  it("preserves the break-and-recover streak alongside the new bucket funding (D4-03)", () => {
    // The bucket surplus must NOT erase the deliberate €0 break + recovery narrative.
    const zeros = ds.investmentStreak.filter((m) => m.amountEur === 0);
    expect(zeros).toHaveLength(1);
    const breakIdx = ds.investmentStreak.findIndex((m) => m.amountEur === 0);
    expect(breakIdx).toBeGreaterThanOrEqual(2); // a run before the break
    expect(ds.investmentStreak.slice(breakIdx + 1).every((m) => m.amountEur >= 4000)).toBe(true); // recovery
  });
});
