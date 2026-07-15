// src/lib/fx/convert.ts — the PURE EUR→USD/BRL conversion engine + remittance view-model (ETF-03 /
// BRL-01, D-02). DB-free, clock-free, no I/O (mirrors src/lib/goal/momentum.ts).
//
// The ECB rate is quote-per-EUR (A5): EUR/USD=1.1405 ⇒ €X becomes X·1.1405 USD, so `convert(eur, rate)
// = eur * rate` (NEVER eur / rate — inverting would 1/x the figure). Every numeric path COERCES FINITE
// so a NaN/±∞ input never leaks a NaN money figure (the momentum/projection `finite()` discipline).
//
// The remittance view-model carries the rate + its as-of date so a converted figure is NEVER shown
// without provenance (UI-SPEC §4). `latestRate` returns the newest row for a quote, falling back to the
// last-known when today's publish is absent (weekends/holidays repeat the last business-day rate,
// Pitfall 6). This engine returns PLAIN numbers + the rate/date — formatting (formatEUR/formatBRL)
// happens at the display boundary, never here.

import type { FxRow } from "@/lib/fx/parse-ecb";

/** The exact fields the EUR/BRL remittance card renders: the figure + its mandatory provenance. */
export interface RemittanceView {
  eur: number;
  brl: number;
  rate: number;
  rateDate: string;
}

/** Coerce any input to a finite number (NaN / ±∞ → 0) — the money-figure NaN guard. */
function finite(n: number): number {
  return Number.isFinite(n) ? n : 0;
}

/**
 * Convert a EUR amount to a quote currency at a quote-per-EUR rate: `convert(1000, 1.1405) = 1140.5`.
 * Both inputs are finite-coerced, so a NaN amount or ±∞ rate yields a finite figure, never NaN.
 */
export function convert(amountEur: number, rate: number): number {
  return finite(amountEur) * finite(rate);
}

/** EUR→USD — the same multiply, semantically named for the ETF-valuation path. */
export function toUSD(amountEur: number, rate: number): number {
  return convert(amountEur, rate);
}

/** EUR→BRL — the same multiply, semantically named for Fernanda's remittance view. */
export function toBRL(amountEur: number, rate: number): number {
  return convert(amountEur, rate);
}

/**
 * Select the newest-dated row for a quote (lexicographic YYYY-MM-DD compare = chronological). Returns
 * the last-known row when today's publish is absent (Pitfall 6), or `null` when the quote is entirely
 * missing — the caller then shows the honest "no rate yet" state rather than a bare/NaN figure.
 */
export function latestRate(rows: FxRow[], quote: string): FxRow | null {
  let best: FxRow | null = null;
  for (const row of rows) {
    if (row.quote !== quote) continue;
    if (best === null || row.rateDate > best.rateDate) best = row;
  }
  return best;
}

/**
 * Build the EUR/BRL remittance view-model from a EUR amount + the latest BRL rate row. Returns `null`
 * when there is no rate — a converted figure is NEVER shown without its rate + as-of date (UI-SPEC §4).
 */
export function remittanceView(
  amountEur: number,
  latestBrl: FxRow | null,
): RemittanceView | null {
  if (latestBrl === null) return null;
  return {
    eur: finite(amountEur),
    brl: toBRL(amountEur, latestBrl.rate),
    rate: latestBrl.rate,
    rateDate: latestBrl.rateDate,
  };
}
