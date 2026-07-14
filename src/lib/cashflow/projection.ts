// src/lib/cashflow/projection.ts — the FLOW-04 cash-flow projection engine (D-09). PURE.
//
// Steps a balance FORWARD month-by-month over `horizonMonths` (default 6):
//   close = opening + expectedRecurringIncome − expectedRecurringOutflows − budgetedDiscretionary;
//   next month's opening = this month's close.
//
// The engine tells the WHOLE truth: it does NOT clamp below zero — the safe-to-spend KPI floors for
// calm, but the projection chart shows the honest below-zero warning zone (D-10 / UI-SPEC §4).
//
// The per-step transform is factored + exported as `stepBalance` so Phase-10 `projectGoal({
// monthlyContribution })` reuses the exact balance-forward stepping (momentum.ts:9 convention).
// PURE — no DB/UI import, no clock; deterministic on injected inputs; NaN/∞-safe (D-12).

/** Coerce any value to a finite number (NaN/±∞/nullish → 0) — the D-12 NaN-safety guard. */
function finite(n: number): number {
  return Number.isFinite(n) ? n : 0;
}

/** The default projection horizon in months (D-09). */
export const DEFAULT_HORIZON_MONTHS = 6;

/** One projected month in the balance-forward series. */
export interface ProjectionMonth {
  /** YYYYMM integer period key (dim_calendar grain). */
  periodKey: number;
  /** Balance at the start of the month. */
  opening: number;
  /** Balance at the end of the month (opening + income − outflows − discretionary). */
  close: number;
  /** True for a forward-looking (estimated) month; false for a realized actual. */
  isProjected: boolean;
}

/** The already-resolved inputs the RSC injects (no I/O inside the engine). */
export interface ProjectionInputs {
  /** The balance the projection starts from (the latest known/actual position). */
  openingBalance: number;
  /** YYYYMM of the FIRST projected month. */
  startPeriodKey: number;
  /** Expected recurring income per month (cadence-normalized). */
  expectedRecurringIncome: number;
  /** Expected recurring outflows (bills) per month (cadence-normalized). */
  expectedRecurringOutflows: number;
  /** Budgeted discretionary spend per month beyond the recurring bills. */
  budgetedDiscretionary: number;
}

/** The per-month net flow (income − outflows − discretionary). */
export interface MonthlyFlow {
  income: number;
  outflows: number;
  discretionary: number;
}

/**
 * The single balance-forward step, factored for Phase-10 reuse (D-09): given an opening balance and
 * a month's flows, return the closing balance. Does NOT clamp below zero — the whole honest truth.
 * NaN/∞-safe. `projectGoal({ monthlyContribution })` reuses this exact stepping.
 */
export function stepBalance(opening: number, flow: MonthlyFlow): number {
  return (
    finite(opening) +
    finite(flow.income) -
    finite(flow.outflows) -
    finite(flow.discretionary)
  );
}

/**
 * The next YYYYMM period key, rolling the year at December (`202612` → `202701`). Pure integer math
 * on the period-key encoding (never a Date) so the engine stays clock-free and deterministic.
 */
export function nextPeriodKey(periodKey: number): number {
  const year = Math.floor(periodKey / 100);
  const month = periodKey % 100; // 1-based
  if (month >= 12) return (year + 1) * 100 + 1;
  return year * 100 + (month + 1);
}

/**
 * Project the cash-flow balance forward `horizonMonths` months (default 6, D-09). Each month steps
 * `close = opening + income − outflows − discretionary` with the next month's opening chained to this
 * month's close. Emits one `ProjectionMonth` per month, all `isProjected: true` (these are estimates;
 * the actual/realized segment is supplied by the caller/chart). Pure, deterministic, NaN/∞-safe; the
 * engine NEVER clamps below zero (D-10 — the chart shows the honest warning zone).
 */
export function projectCashflow(
  inputs: ProjectionInputs,
  horizonMonths: number = DEFAULT_HORIZON_MONTHS,
): ProjectionMonth[] {
  const flow: MonthlyFlow = {
    income: inputs.expectedRecurringIncome,
    outflows: inputs.expectedRecurringOutflows,
    discretionary: inputs.budgetedDiscretionary,
  };

  const horizon = Math.max(0, Math.floor(finite(horizonMonths)));
  const months: ProjectionMonth[] = [];

  let opening = finite(inputs.openingBalance);
  let periodKey = inputs.startPeriodKey;

  for (let i = 0; i < horizon; i++) {
    const close = stepBalance(opening, flow);
    months.push({ periodKey, opening, close, isProjected: true });
    opening = close; // next month's opening = this month's close
    periodKey = nextPeriodKey(periodKey);
  }

  return months;
}
