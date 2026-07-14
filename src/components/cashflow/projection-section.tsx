// projection-section — the FLOW-04 server-driven cash-flow projection (UI-SPEC §4).
//
// An async RSC that resolves the projection INPUTS under RLS through the is_demo chokepoint, then
// hands them to the PURE `projectCashflow` engine and renders `<CashflowProjection>`:
//   1. opening balance + the solid actual segment = the month-end net worth from `v_balance_trend`
//      (the same source `net-worth-trend` reads); the newest month is the projection's opening.
//   2. expected recurring income / outflows = active `recurring_series` (is_income true/false),
//      cadence-normalized to a per-month figure.
//   3. budgeted discretionary = Σ cost-center budgets this period BEYOND the recurring bills
//      (max(0, budgets − recurring outflows)) so a bill is never double-subtracted.
//
// Every demo-bearing read threads `.eq("is_demo", demoFilter)` (v_balance_trend / recurring_series /
// budgets) — a missing filter would blend the real household's balances/subscriptions/budgets with the
// public demo partition (T-09-07 / demo-read-filter guard). The period is derived from the injected
// demo-aware `asOf`, NEVER the wall clock (Pitfall 2). Reads go through @supabase/ssr under RLS —
// NEVER the server-only marts module (FND-03). The engine does not clamp below zero; the chart shows
// the honest warning zone (D-10).

import {
  CashflowProjection,
  type CashflowActualPoint,
} from "@/components/cashflow/cashflow-projection";
import { nextPeriodKey, projectCashflow } from "@/lib/cashflow/projection";
import { currentPeriodKey } from "@/lib/period";
import { createClient } from "@/lib/supabase/server";

/** numeric columns arrive from supabase-js as strings; parse to a finite number (0 fallback). */
function num(v: string | number | null | undefined): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Normalize a recurring series amount to a per-MONTH figure by cadence (committed monthly flow). */
function monthlyEquivalent(amount: number, cadence: string): number {
  switch (cadence) {
    case "weekly":
      return amount * (52 / 12); // ~4.33 payments/month
    case "yearly":
      return amount / 12;
    case "monthly":
    default:
      return amount;
  }
}

/** How many trailing actual months to draw as the solid segment before the dashed projection. */
const ACTUAL_MONTHS = 6;
/** The projection horizon in months (D-09 default). */
const HORIZON_MONTHS = 6;

export async function ProjectionSection({
  demoFilter,
  asOf,
}: {
  demoFilter: boolean;
  asOf: Date;
}) {
  const supabase = await createClient();
  const period = currentPeriodKey(asOf);

  // 1. The realized balance history (month-end net worth per period) — the solid actual segment and
  //    the projection's opening. Demo-partitioned.
  const { data: trendRows, error: trendError } = await supabase
    .from("v_balance_trend")
    .select("date, period_key, net_worth, is_demo")
    .eq("is_demo", demoFilter)
    .order("date", { ascending: true });
  if (trendError) throw trendError;

  // 2. Active recurring series → per-month expected income / outflows. Demo-partitioned.
  const { data: seriesRows, error: seriesError } = await supabase
    .from("recurring_series")
    .select("amount_eur, cadence, status, is_income, is_demo")
    .eq("is_demo", demoFilter)
    .eq("status", "active");
  if (seriesError) throw seriesError;

  // 3. Cost-center budgets this period (category_id null grain) → discretionary ceiling. Demo-partitioned.
  const { data: budgetRows, error: budgetError } = await supabase
    .from("budgets")
    .select("amount_eur, category_id, period_key, is_demo")
    .eq("is_demo", demoFilter)
    .eq("period_key", period)
    .is("category_id", null);
  if (budgetError) throw budgetError;

  // Reduce the (daily) trend to the LAST net worth per period_key — the month-end actuals.
  const byPeriod = new Map<number, number>();
  for (const r of trendRows ?? []) {
    byPeriod.set(r.period_key, num(r.net_worth)); // ascending order → last write wins = month-end
  }
  const actuals: CashflowActualPoint[] = [...byPeriod.entries()]
    .sort((a, b) => a[0] - b[0])
    .slice(-ACTUAL_MONTHS)
    .map(([periodKey, balance]) => ({ periodKey, balance }));

  // Expected per-month recurring income + outflows (cadence-normalized).
  let expectedRecurringIncome = 0;
  let expectedRecurringOutflows = 0;
  for (const r of seriesRows ?? []) {
    const monthly = monthlyEquivalent(Math.abs(num(r.amount_eur)), r.cadence);
    if (r.is_income) expectedRecurringIncome += monthly;
    else expectedRecurringOutflows += monthly;
  }

  // Budgeted discretionary = cost-center budgets BEYOND the recurring bills (never double-subtract a
  // bill that also sits inside a budget). Floors at 0.
  const totalBudget = (budgetRows ?? []).reduce((acc, r) => acc + num(r.amount_eur), 0);
  const budgetedDiscretionary = Math.max(0, totalBudget - expectedRecurringOutflows);

  // The opening balance = the newest realized month (or 0 if there is no history yet). The projection
  // starts the month AFTER the latest actual.
  const openingBalance = actuals.length ? actuals[actuals.length - 1].balance : 0;
  const startPeriodKey = actuals.length
    ? nextPeriodKey(actuals[actuals.length - 1].periodKey)
    : nextPeriodKey(period);

  const projectedMonths = projectCashflow(
    {
      openingBalance,
      startPeriodKey,
      expectedRecurringIncome,
      expectedRecurringOutflows,
      budgetedDiscretionary,
    },
    HORIZON_MONTHS,
  );

  const projected = projectedMonths.map((m) => ({ periodKey: m.periodKey, balance: m.close }));

  return <CashflowProjection actuals={actuals} projected={projected} />;
}
