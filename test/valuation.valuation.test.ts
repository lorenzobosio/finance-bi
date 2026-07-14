import { describe, expect, it } from "vitest";

// Wave-0 TDD RED (ETF-01 / ETF-02 / ETF-03, D-03) — freezes the virtual-holdings valuation contract
// for the not-yet-existent PURE engine `@/lib/valuation/valuation.ts` (built GREEN in a later
// Phase-12 plan). RED at RUNTIME only ("Cannot find package '@/lib/valuation/valuation'"); the
// COMPUTED import specifier keeps `tsc --noEmit` green while the module is absent (the 11-01/10-01/
// 08-01 idiom).
//
// PSD2 does NOT expose the Revolut investing account, so units are DERIVED from the cost-basis legs:
//   unitsFromContributions = Σ (amount_eur ÷ nearest-close-ON-OR-BEFORE that leg's period)
//   - a leg whose period has NO price on-or-before is SKIPPED (contributes to cost basis, NOT units —
//     the bootstrap gap, Pitfall 2); a close ≤ 0 is skipped (guards Infinity/NaN units, Pitfall 1).
//   marketValue(units, latestClose) = units × close, but NULL when close is null or ≤ 0 (UNPRICED).
//   unrealizedPnl(mv, costBasis)    = mv − costBasis, but NULL when mv is null — the P/L row is HIDDEN,
//                                     NEVER shown as €0 break-even (Pitfall 5).
// The priceSeries the engine consumes is ONE currency (EUR-denominated by the caller) — the engine is
// currency-AGNOSTIC (pure arithmetic, no ccy param). Outputs asserted to a tolerance (Pitfall 1).
// Synthetic € only; no PII.

const MODULE = "@/lib/valuation/valuation";

interface Contribution {
  amountEur: number;
  periodKey: number; // YYYYMM
}
interface PricePoint {
  periodKey: number; // YYYYMM, ascending
  close: number;
}

interface ValuationModule {
  unitsFromContributions: (contribs: Contribution[], priceSeries: PricePoint[]) => number;
  marketValue: (units: number, latestClose: number | null) => number | null;
  unrealizedPnl: (mv: number | null, costBasis: number) => number | null;
}

async function load(): Promise<ValuationModule> {
  const mod = (await import(/* @vite-ignore */ MODULE)) as Record<string, unknown>;
  return {
    unitsFromContributions: mod.unitsFromContributions as ValuationModule["unitsFromContributions"],
    marketValue: mod.marketValue as ValuationModule["marketValue"],
    unrealizedPnl: mod.unrealizedPnl as ValuationModule["unrealizedPnl"],
  };
}

const PRICES: PricePoint[] = [
  { periodKey: 202501, close: 90 },
  { periodKey: 202502, close: 100 },
  { periodKey: 202503, close: 120 },
];

describe("unitsFromContributions — Σ(amount ÷ nearest close-on-or-before) (ETF-01/02)", () => {
  it("derives units from each leg at its own period's close", async () => {
    const { unitsFromContributions } = await load();
    const contribs: Contribution[] = [
      { amountEur: 900, periodKey: 202501 }, // 900 / 90  = 10
      { amountEur: 1000, periodKey: 202502 }, // 1000 / 100 = 10
    ];
    expect(unitsFromContributions(contribs, PRICES)).toBeCloseTo(20, 6);
  });

  it("uses the nearest close ON-OR-BEFORE when the exact period has no row", async () => {
    const { unitsFromContributions } = await load();
    // 202504 has no price → nearest on-or-before is 202503 (close 120) → 1200 / 120 = 10.
    const contribs: Contribution[] = [{ amountEur: 1200, periodKey: 202504 }];
    expect(unitsFromContributions(contribs, PRICES)).toBeCloseTo(10, 6);
  });

  it("SKIPS a leg whose period is before any price (bootstrap gap → cost basis, not units)", async () => {
    const { unitsFromContributions } = await load();
    // 202412 predates the whole series → no close on-or-before → contributes 0 units.
    const contribs: Contribution[] = [
      { amountEur: 500, periodKey: 202412 }, // skipped
      { amountEur: 900, periodKey: 202501 }, // 10 units
    ];
    expect(unitsFromContributions(contribs, PRICES)).toBeCloseTo(10, 6);
  });

  it("SKIPS a leg whose nearest close is ≤ 0 (no Infinity/NaN units — Pitfall 1)", async () => {
    const { unitsFromContributions } = await load();
    const withZero: PricePoint[] = [{ periodKey: 202501, close: 0 }, { periodKey: 202502, close: 100 }];
    const units = unitsFromContributions([{ amountEur: 900, periodKey: 202501 }], withZero);
    expect(Number.isFinite(units)).toBe(true);
    expect(units).toBe(0); // the close-0 leg is skipped, not divided
  });

  it("is currency-AGNOSTIC — scaling the whole price series by k scales units by 1/k", async () => {
    const { unitsFromContributions } = await load();
    const contribs: Contribution[] = [{ amountEur: 1000, periodKey: 202502 }];
    const base = unitsFromContributions(contribs, PRICES);
    const scaled = unitsFromContributions(
      contribs,
      PRICES.map((p) => ({ ...p, close: p.close * 2 })),
    );
    expect(scaled).toBeCloseTo(base / 2, 6); // pure arithmetic, no hidden ccy logic
  });
});

describe("marketValue — units × close, null when UNPRICED (ETF-02, Pitfall 5)", () => {
  it("multiplies units by the latest close", async () => {
    const { marketValue } = await load();
    expect(marketValue(30, 130)).toBeCloseTo(3900, 6);
  });

  it("returns null when the close is null (no live price)", async () => {
    const { marketValue } = await load();
    expect(marketValue(30, null)).toBeNull();
  });

  it("returns null when the close is ≤ 0 (invalid price is unpriced, never €0)", async () => {
    const { marketValue } = await load();
    expect(marketValue(30, 0)).toBeNull();
    expect(marketValue(30, -5)).toBeNull();
  });
});

describe("unrealizedPnl — mv − costBasis, null (HIDDEN) when unpriced (Pitfall 5)", () => {
  it("computes a positive P/L (a gain)", async () => {
    const { unrealizedPnl } = await load();
    expect(unrealizedPnl(3900, 3600)).toBeCloseTo(300, 6);
  });

  it("computes a negative P/L (a paper loss)", async () => {
    const { unrealizedPnl } = await load();
    expect(unrealizedPnl(3000, 3600)).toBeCloseTo(-600, 6);
  });

  it("returns null (P/L HIDDEN) when market value is null — NEVER €0 break-even", async () => {
    const { unrealizedPnl } = await load();
    expect(unrealizedPnl(null, 3600)).toBeNull();
  });
});
