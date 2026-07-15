// src/lib/valuation/valuation.ts — the virtual-holdings valuation engine (ETF-01/02, D-03). PURE.
//
// PSD2 does NOT expose the Revolut investing account (no share count), so units are DERIVED from the
// cost-basis contribution legs against a historical price series:
//   unitsFromContributions = Σ (amountEur ÷ nearestOnOrBefore(priceSeries, leg.periodKey).close)
//   - The DISCRETIONARY near-period rule A2: a leg is priced at the LATEST close ON-OR-BEFORE its own
//     period end (dim_calendar YYYYMM grain) — never a future close (no look-ahead).
//   - A leg with NO price on-or-before its period is SKIPPED — it still counts toward cost basis, but
//     buys 0 units (the bootstrap gap, Pitfall 2). A close ≤ 0 is likewise SKIPPED (guards Infinity/
//     NaN units, Pitfall 1).
//   marketValue(units, latestClose) = units × latestClose, but NULL when the close is null or ≤ 0
//     (UNPRICED — never a false €0, Pitfall 5).
//   unrealizedPnl(mv, costBasis) = mv − costBasis, but NULL when mv is null — the P/L row is HIDDEN,
//     NEVER shown as €0 break-even (Pitfall 5).
//
// CURRENCY-AGNOSTIC: the priceSeries + latestClose are in ONE currency the caller supplies (the 12-06
// page converts USD→EUR via fx BEFORE calling); the engine does no FX — pure arithmetic, no ccy param.
// PURE — no DB/UI import, no clock; deterministic on injected inputs; NaN/∞-safe (Pitfall 1).

/** Coerce any value to a finite number (NaN/±∞/nullish → 0) — the NaN-safety guard (projection.ts:15). */
function finite(n: number): number {
  return Number.isFinite(n) ? n : 0;
}

/** A single contribution (cost-basis) leg, priced at its own period. */
export interface Contribution {
  /** The euro amount of the leg (cost basis). */
  amountEur: number;
  /** YYYYMM integer period key (dim_calendar grain). */
  periodKey: number;
}

/** One point in the historical price series (ascending by periodKey). */
export interface PricePoint {
  /** YYYYMM integer period key (dim_calendar grain). */
  periodKey: number;
  /** The period-close price in the caller's chosen currency. */
  close: number;
}

/**
 * The latest close ON-OR-BEFORE `periodKey` (the discretionary near-period rule A2). Scans the series
 * for the highest periodKey that is ≤ the target — never a future close. Returns null when the leg
 * predates the whole series (the bootstrap gap). Does not assume the series is pre-sorted.
 */
export function nearestOnOrBefore(priceSeries: PricePoint[], periodKey: number): PricePoint | null {
  let best: PricePoint | null = null;
  for (const point of priceSeries) {
    if (point.periodKey <= periodKey && (best === null || point.periodKey > best.periodKey)) {
      best = point;
    }
  }
  return best;
}

/**
 * Derive units from cost-basis legs: Σ (amountEur ÷ nearest-close-on-or-before). A leg with no price
 * on-or-before its period, or whose nearest close is ≤ 0, is SKIPPED (0 units — cost basis only). Pure
 * and NaN/∞-safe: every external number is `finite()`-guarded before entering the fold.
 */
export function unitsFromContributions(
  contribs: Contribution[],
  priceSeries: PricePoint[],
): number {
  let units = 0;
  for (const leg of contribs) {
    const point = nearestOnOrBefore(priceSeries, leg.periodKey);
    if (point === null) continue; // bootstrap gap — cost basis, not units (Pitfall 2)
    const close = finite(point.close);
    if (close <= 0) continue; // guard Infinity/NaN units (Pitfall 1)
    units += finite(leg.amountEur) / close;
  }
  return units;
}

/**
 * Market value = units × latestClose, but NULL when UNPRICED (latestClose is null or ≤ 0). An invalid
 * or missing price is honestly unpriced — never rendered as a false €0 (Pitfall 5).
 */
export function marketValue(units: number, latestClose: number | null): number | null {
  if (latestClose === null || !Number.isFinite(latestClose) || latestClose <= 0) return null;
  return finite(units) * latestClose;
}

/**
 * Unrealized P/L = marketValue − costBasis, but NULL when market value is null — the P/L row is HIDDEN,
 * NEVER shown as €0 break-even (Pitfall 5).
 */
export function unrealizedPnl(mv: number | null, costBasis: number): number | null {
  if (mv === null) return null;
  return finite(mv) - finite(costBasis);
}
