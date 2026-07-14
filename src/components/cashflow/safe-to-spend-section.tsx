// safe-to-spend-section — the FLOW-02 server-driven operating figures (UI-SPEC §1).
//
// An async RSC that resolves three already-computed aggregates under RLS through the is_demo
// chokepoint, then hands them to the PURE engines (computeSafeToSpend / computeRunway) and renders
// two KpiCards REUSED VERBATIM (no new card shell):
//   1. liquid balance  = Σ latest v_account_summary.current_balance where is_investment=false (OQ2)
//   2. remaining budget = Σ max(0, budget − actual) this period from v_costcenter_bva (cost-center grain)
//   3. active recurring OUTFLOWS (is_income=false) → the remaining bills still due this period AND
//      the monthly committed burn (cadence-normalized) that runway divides into.
//
// Every demo-bearing read threads `.eq("is_demo", demoFilter)` (the anon /cashflow demo caps to
// is_demo=true; a missing filter would blend the real household's balances/budgets/subscriptions with
// the demo partition — T-09-07 / demo-read-filter guard). The period is derived from the injected
// demo-aware `asOf`, NEVER the wall clock (Pitfall 2). Reads go through @supabase/ssr under RLS —
// NEVER the server-only marts module (FND-03). The figures stay CALM: safe-to-spend floors at 0 with
// an explicit "over committed" pill (never a bare −€X); runway never shows NaN/∞ (D-04/D-05).

import { GaugeCircle, Wallet } from "lucide-react";

import { KpiCard, type KpiStatus } from "@/components/kpi-card";
import { computeRunway, computeSafeToSpend } from "@/lib/cashflow/safe-to-spend";
import { formatEUR, formatMonths } from "@/lib/format";
import { currentPeriodKey } from "@/lib/period";
import { createClient } from "@/lib/supabase/server";

/** numeric columns arrive from supabase-js as strings; parse to a finite number (0 fallback). */
function num(v: string | number | null | undefined): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Normalize a recurring series amount to a per-MONTH figure by cadence (committed monthly burn). */
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

// Runway "watch" threshold (Claude's discretion, D-05): under this many months reads the calm
// warning "Getting tight" (never "danger"/"broke" — UI-SPEC §1).
const RUNWAY_WATCH_MONTHS = 3;

export async function SafeToSpendSection({
  demoFilter,
  asOf,
}: {
  demoFilter: boolean;
  asOf: Date;
}) {
  const supabase = await createClient();
  const period = currentPeriodKey(asOf);

  // 1. Liquid balance = the latest CLBD per NON-investment account (the ETF pocket is excluded — it
  //    is the €100k cost basis, not spendable). Demo-partitioned.
  const { data: summaryRows, error: summaryError } = await supabase
    .from("v_account_summary")
    .select("current_balance, is_investment, is_demo")
    .eq("is_demo", demoFilter);
  if (summaryError) throw summaryError;

  // 2. Remaining budget = Σ max(0, budget − actual) at cost-center grain (category_id null) this
  //    period. Overspent centers contribute 0 (never a negative claim). Demo-partitioned.
  const { data: bvaRows, error: bvaError } = await supabase
    .from("v_costcenter_bva")
    .select("cost_center, category_id, period_key, budget, actual, is_demo")
    .eq("period_key", period)
    .eq("is_demo", demoFilter)
    .is("category_id", null);
  if (bvaError) throw bvaError;

  // 3. Active recurring OUTFLOWS (is_income=false) → remaining-this-period bills + monthly burn.
  //    Demo-partitioned.
  const { data: seriesRows, error: seriesError } = await supabase
    .from("recurring_series")
    .select("amount_eur, cadence, next_date, status, is_income, is_demo")
    .eq("is_demo", demoFilter)
    .eq("status", "active")
    .eq("is_income", false);
  if (seriesError) throw seriesError;

  const liquidBalance = (summaryRows ?? [])
    .filter((r) => !r.is_investment)
    .reduce((acc, r) => acc + num(r.current_balance), 0);

  const remainingBudget = (bvaRows ?? []).reduce(
    (acc, r) => acc + Math.max(0, num(r.budget) - num(r.actual)),
    0,
  );

  // Remaining recurring outflows = active outflow series whose next_date still falls in THIS period
  // (same YYYYMM as asOf) and is not already in the past — the bills still due this month.
  const asOfIso = asOf.toISOString().slice(0, 10);
  let remainingRecurringOutflows = 0;
  let committedMonthlyBurn = 0;
  for (const r of seriesRows ?? []) {
    const amount = Math.abs(num(r.amount_eur));
    committedMonthlyBurn += monthlyEquivalent(amount, r.cadence);

    const next = r.next_date;
    if (!next) continue;
    const nextKey = Number(next.slice(0, 7).replace("-", ""));
    if (nextKey === period && next >= asOfIso) {
      remainingRecurringOutflows += amount;
    }
  }

  const safe = computeSafeToSpend({
    liquidBalance,
    remainingRecurringOutflows,
    remainingBudget,
  });
  const runway = computeRunway({ liquidBalance, committedMonthlyBurn });

  // Safe-to-spend: normal → no pill; over → the calm amber "over committed" copy (never a bare −€X).
  const safeStatus: KpiStatus | undefined =
    safe.over > 0
      ? {
          label: `${formatEUR(safe.over, 0)} over committed — trim to stay on plan`,
          tone: "warning",
        }
      : undefined;

  // Runway: null (no committed burn) → calm neutral note; finite & under the watch threshold →
  // "Getting tight" (warning); otherwise no pill. Never NaN/∞.
  let runwayValue: string;
  let runwayStatus: KpiStatus | undefined;
  if (runway.months === null) {
    runwayValue = "—";
    runwayStatus = { label: "No fixed commitments yet", tone: "neutral" };
  } else {
    runwayValue = formatMonths(runway.months);
    runwayStatus =
      runway.months < RUNWAY_WATCH_MONTHS
        ? { label: "Getting tight", tone: "warning" }
        : undefined;
  }

  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold">Safe to spend</h2>
      <div className="grid grid-cols-1 gap-4 @xl/main:grid-cols-2">
        <KpiCard
          label="Safe to spend"
          icon={<Wallet />}
          value={formatEUR(safe.value, 0)}
          valueNumber={safe.value}
          status={safeStatus}
        >
          <p className="text-xs text-muted-foreground">after bills &amp; budgets this month</p>
        </KpiCard>

        <KpiCard
          label="Runway"
          icon={<GaugeCircle />}
          value={runwayValue}
          status={runwayStatus}
        >
          <p className="text-xs text-muted-foreground">at your committed burn</p>
        </KpiCard>
      </div>
    </section>
  );
}
