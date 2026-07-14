import { describe, expect, it } from "vitest";

// Wave-0 TDD RED (FLOW-02, D-04/D-05/D-12) — freezes the safe-to-spend + runway contract for the
// not-yet-existent PURE engine `@/lib/cashflow/safe-to-spend.ts` (built GREEN in a later Phase-9
// plan; `computeRunway` may co-locate here per 09-PATTERNS). RED at RUNTIME only ("Cannot find
// package '@/lib/cashflow/safe-to-spend'"); the COMPUTED import specifier keeps `tsc --noEmit` green
// while the module is absent.
//
// The engine is a PURE builder over ALREADY-COMPUTED aggregates (src/lib/health/snapshot.ts:80-119)
// — it never fetches, never reads a clock:
//   - computeSafeToSpend = liquidBalance − remainingRecurringOutflows − remainingBudget; the
//     display `value` is FLOORED at 0 and an explicit `over` (> 0 when committed exceeds balance)
//     is exposed — NEVER a bare scary negative (D-04, the "operating figure" framing).
//   - computeRunway = liquidBalance / committedMonthlyBurn; divide-by-zero → a healthy/∞ sentinel
//     (`months: null`), NEVER NaN/Infinity (mirrors the momentum.ts:64 guard). Sibling of the
//     existing monthsOfReserve scorecard read (D-05).
//
// Synthetic € only; no PII.

const MODULE = "@/lib/cashflow/safe-to-spend";

interface SafeToSpendResult {
  value: number; // floored >= 0
  over: number; // > 0 when committed outflows exceed the balance ("over committed")
}
interface RunwayResult {
  months: number | null; // null = healthy/unbounded sentinel (zero committed burn)
}

interface SafeToSpendModule {
  computeSafeToSpend: (input: {
    liquidBalance: number;
    remainingRecurringOutflows: number;
    remainingBudget: number;
  }) => SafeToSpendResult;
  computeRunway: (input: { liquidBalance: number; committedMonthlyBurn: number }) => RunwayResult;
}

async function load(): Promise<SafeToSpendModule> {
  const mod = (await import(/* @vite-ignore */ MODULE)) as Record<string, unknown>;
  return {
    computeSafeToSpend: mod.computeSafeToSpend as SafeToSpendModule["computeSafeToSpend"],
    computeRunway: mod.computeRunway as SafeToSpendModule["computeRunway"],
  };
}

describe("computeSafeToSpend — the healthy (in-budget) case (FLOW-02, D-04)", () => {
  it("returns balance − committed outflows − remaining budget with over=0", async () => {
    const { computeSafeToSpend } = await load();
    const r = computeSafeToSpend({
      liquidBalance: 3000,
      remainingRecurringOutflows: 800,
      remainingBudget: 1200,
    });
    expect(r.value).toBe(1000);
    expect(r.over).toBe(0);
  });
});

describe("computeSafeToSpend — the OVER-committed case never shows a bare negative (D-04)", () => {
  it("floors value at 0 and surfaces the overage as a positive `over`", async () => {
    const { computeSafeToSpend } = await load();
    const r = computeSafeToSpend({
      liquidBalance: 1000,
      remainingRecurringOutflows: 900,
      remainingBudget: 400,
    });
    // committed (1300) exceeds balance (1000) by 300.
    expect(r.value).toBe(0); // floored — never a scary bare negative
    expect(r.value).toBeGreaterThanOrEqual(0);
    expect(r.over).toBe(300);
  });

  it("keeps over=0 exactly at break-even", async () => {
    const { computeSafeToSpend } = await load();
    const r = computeSafeToSpend({
      liquidBalance: 1000,
      remainingRecurringOutflows: 600,
      remainingBudget: 400,
    });
    expect(r.value).toBe(0);
    expect(r.over).toBe(0);
  });

  it("never surfaces NaN/Infinity", async () => {
    const { computeSafeToSpend } = await load();
    const r = computeSafeToSpend({
      liquidBalance: 0,
      remainingRecurringOutflows: 0,
      remainingBudget: 0,
    });
    expect(Number.isFinite(r.value)).toBe(true);
    expect(Number.isFinite(r.over)).toBe(true);
  });
});

describe("computeRunway — committed-burn months, div-by-zero → healthy sentinel (D-05)", () => {
  it("returns balance / committed monthly burn", async () => {
    const { computeRunway } = await load();
    const r = computeRunway({ liquidBalance: 12000, committedMonthlyBurn: 3000 });
    expect(r.months).toBeCloseTo(4, 5);
    expect(Number.isFinite(r.months as number)).toBe(true);
  });

  it("zero committed burn → a healthy/∞ sentinel (months: null), NEVER NaN/Infinity", async () => {
    const { computeRunway } = await load();
    const r = computeRunway({ liquidBalance: 12000, committedMonthlyBurn: 0 });
    expect(r.months).toBeNull();
    expect(Number.isNaN(r.months as unknown as number)).toBe(false);
    expect(r.months === Infinity).toBe(false);
  });

  it("zero balance with positive burn → 0 months (finite, honest)", async () => {
    const { computeRunway } = await load();
    const r = computeRunway({ liquidBalance: 0, committedMonthlyBurn: 3000 });
    expect(r.months).toBe(0);
  });
});
