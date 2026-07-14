// src/lib/cashflow/runway.ts — the PURE runway engine (FLOW-02, D-05).
//
// Conceptual sibling of the existing months-of-reserve scorecard read: how many months the liquid
// balance covers at the household's committed monthly burn. A PURE builder over already-computed
// aggregates — no I/O, no clock, no DB import (mirrors src/lib/health/snapshot.ts). NaN-safe:
// zero/negative/non-finite committed burn returns the healthy/unbounded sentinel `months: null`
// (NEVER NaN/Infinity — mirrors the momentum.ts:64 divide-by-zero guard).

/** Coerce any DB/derived number to a finite value (non-finite → 0). */
function finite(n: number): number {
  return Number.isFinite(n) ? n : 0;
}

export interface RunwayInput {
  /** Liquid balance (sum of non-investment account balances). */
  liquidBalance: number;
  /** The committed monthly burn — active recurring outflows normalized to a monthly figure. */
  committedMonthlyBurn: number;
}

export interface RunwayResult {
  /** Months of runway; `null` = healthy/unbounded sentinel (zero committed burn). Never NaN/Infinity. */
  months: number | null;
}

/**
 * computeRunway — `liquidBalance / committedMonthlyBurn`. Divide-by-zero (or a non-positive /
 * non-finite burn) returns the healthy sentinel `{ months: null }`, never NaN/Infinity. A zero
 * balance against a positive burn is the honest `{ months: 0 }`.
 */
export function computeRunway(input: RunwayInput): RunwayResult {
  const balance = Math.max(0, finite(input.liquidBalance));
  const burn = finite(input.committedMonthlyBurn);

  // Zero/negative burn → nothing is draining the balance: healthy/unbounded, never a divide-by-zero.
  if (burn <= 0) return { months: null };

  const months = balance / burn;
  return { months: Number.isFinite(months) ? months : null };
}
