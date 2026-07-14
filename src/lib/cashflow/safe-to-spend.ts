// src/lib/cashflow/safe-to-spend.ts — the PURE safe-to-spend engine (FLOW-02, D-04).
//
// The "operating figure": how much is genuinely free to spend after this month's committed recurring
// outflows and the remaining budget are set aside. A PURE builder over already-computed aggregates
// (mirrors src/lib/health/snapshot.ts) — no I/O, no clock, no DB import; the RSC injects the
// liquid balance + remaining outflows + remaining budget.
//
// D-04 (the calm-honest contract): the display `value` is FLOORED at 0 and the shortfall is surfaced
// as an explicit positive `over` — the UI renders "over committed", NEVER a bare scary `-€X`. NaN-safe
// on missing/zero inputs.
//
// `computeRunway` is RE-EXPORTED here so the frozen 09-01 contract can import both engines from this
// single module path (test/cashflow.safe-to-spend.test.ts); the runway logic lives in ./runway.ts.

export { computeRunway } from "./runway";
export type { RunwayInput, RunwayResult } from "./runway";

/** Coerce any DB/derived number to a finite value (non-finite → 0). */
function finite(n: number): number {
  return Number.isFinite(n) ? n : 0;
}

export interface SafeToSpendInput {
  /** Liquid balance = Σ latest v_account_summary.current_balance where is_investment=false (OQ2). */
  liquidBalance: number;
  /** Remaining committed recurring outflows this period (active, is_income=false series). */
  remainingRecurringOutflows: number;
  /** Remaining budget this period = Σ max(0, budget − actual) across cost centers. */
  remainingBudget: number;
}

export interface SafeToSpendResult {
  /** The safe-to-spend figure, FLOORED at 0 (never a bare negative). */
  value: number;
  /** The overage (> 0 when committed outflows + budget exceed the balance), else 0 — "over committed". */
  over: number;
}

/**
 * computeSafeToSpend — `liquidBalance − remainingRecurringOutflows − remainingBudget`, with the
 * display `value` floored at 0 and the shortfall exposed as a positive `over` (D-04). Never a bare
 * negative; NaN-safe on missing/zero inputs.
 */
export function computeSafeToSpend(input: SafeToSpendInput): SafeToSpendResult {
  const balance = finite(input.liquidBalance);
  const committed =
    finite(input.remainingRecurringOutflows) + finite(input.remainingBudget);

  const raw = balance - committed;

  return {
    value: Math.max(0, raw), // floored — the calm figure, never a scary bare negative
    over: Math.max(0, -raw), // the honest shortfall surfaced as "over committed"
  };
}
