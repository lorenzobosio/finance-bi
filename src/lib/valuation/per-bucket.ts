// src/lib/valuation/per-bucket.ts — per-bucket market-value allocation (ETF-05, D-04). PURE.
//
// Per-bucket market value = each bucket's SHARE of total cost basis × the total market value:
//   perBucketMarketValue(bucketCostBasis, totalCostBasis, totalMarketValue)
//     = (bucketCostBasis / totalCostBasis) × totalMarketValue        (D-04 cost-basis pro-rata)
// Because the shares are a linear partition of totalMarketValue, the three bucket shares SUM (±float
// tolerance) to totalMarketValue — no value is invented or lost. A zero/negative total cost basis → 0
// (the zero-total guard, no divide-by-zero).
//
// ALTERNATIVE (D-04, documented not implemented): the exact UNITS-PER-BUCKET variant tracks each
// bucket's own units (Σ leg ÷ close for that bucket's legs) × latestClose. It differs from the
// cost-basis pro-rata ONLY when contributions to different buckets landed at DIFFERENT prices (e.g.
// Wealth funded when the ETF was cheap, Brazil when it was dear) — then each bucket's realized entry
// price diverges. Cost-basis pro-rata is chosen for the MVP: simpler, always sums exactly, and the
// price-timing skew across buckets is second-order for this couple's cadence.
//
// PURE — no DB/UI import, no clock; deterministic; NaN/∞-safe.

/** Coerce any value to a finite number (NaN/±∞/nullish → 0) — the NaN-safety guard. */
function finite(n: number): number {
  return Number.isFinite(n) ? n : 0;
}

/**
 * A bucket's pro-rata share of the total market value: (bucketCostBasis / totalCostBasis) ×
 * totalMarketValue. Returns 0 when totalCostBasis ≤ 0 (the zero-total guard — no divide-by-zero).
 */
export function perBucketMarketValue(
  bucketCostBasis: number,
  totalCostBasis: number,
  totalMarketValue: number,
): number {
  const total = finite(totalCostBasis);
  if (total <= 0) return 0;
  return (finite(bucketCostBasis) / total) * finite(totalMarketValue);
}
