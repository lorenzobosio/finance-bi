import { describe, expect, it } from "vitest";

// Wave-0 TDD RED (ETF-05, D-04) — freezes the per-bucket allocation contract for the not-yet-existent
// PURE engine `@/lib/valuation/per-bucket.ts` (built GREEN in a later Phase-12 plan). RED at RUNTIME
// only ("Cannot find package '@/lib/valuation/per-bucket'"); the COMPUTED import specifier keeps
// `tsc --noEmit` green while the module is absent (the 11-01/10-01/08-01 idiom).
//
// Per-bucket market value = each bucket's SHARE of total contributions × the total market value:
//   perBucketMarketValue(bucketCostBasis, totalCostBasis, totalMarketValue)
//     = (bucketCostBasis / totalCostBasis) × totalMarketValue          (D-04 cost-basis pro-rata)
// The three bucket shares MUST sum (±tolerance) to the total market value (no value invented or lost).
// A zero/negative total cost basis → 0 (the zero-total guard, no divide-by-zero). The units-per-bucket
// variant (exact when buckets funded at different prices) is documented in the engine as the alt (D-04).
// Synthetic € only; no PII.

const MODULE = "@/lib/valuation/per-bucket";

interface PerBucketModule {
  perBucketMarketValue: (
    bucketCostBasis: number,
    totalCostBasis: number,
    totalMarketValue: number,
  ) => number;
}

async function load(): Promise<PerBucketModule> {
  const mod = (await import(/* @vite-ignore */ MODULE)) as Record<string, unknown>;
  return { perBucketMarketValue: mod.perBucketMarketValue as PerBucketModule["perBucketMarketValue"] };
}

describe("perBucketMarketValue — cost-basis pro-rata (ETF-05)", () => {
  it("allocates a bucket's share = (bucketCB / totalCB) × totalMV", async () => {
    const { perBucketMarketValue } = await load();
    // Wealth €56,000 of €64,000 total cost basis, €70,000 total market value.
    // 56000/64000 × 70000 = 61,250.
    expect(perBucketMarketValue(56000, 64000, 70000)).toBeCloseTo(61250, 4);
  });

  it("the three bucket shares SUM (±tolerance) to the total market value", async () => {
    const { perBucketMarketValue } = await load();
    const totalCB = 64000;
    const totalMV = 70000;
    const wealth = perBucketMarketValue(56000, totalCB, totalMV);
    const brazil = perBucketMarketValue(5000, totalCB, totalMV);
    const adventures = perBucketMarketValue(3000, totalCB, totalMV);
    expect(wealth + brazil + adventures).toBeCloseTo(totalMV, 6);
  });

  it("returns 0 when the total cost basis is 0 (zero-total guard, no divide-by-zero)", async () => {
    const { perBucketMarketValue } = await load();
    expect(perBucketMarketValue(0, 0, 70000)).toBe(0);
  });

  it("returns 0 when the total cost basis is negative (defensive guard)", async () => {
    const { perBucketMarketValue } = await load();
    const v = perBucketMarketValue(1000, -5, 70000);
    expect(Number.isFinite(v)).toBe(true);
    expect(v).toBe(0);
  });
});
