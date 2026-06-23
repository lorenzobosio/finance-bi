import { Coins, Landmark, PiggyBank, ShieldCheck, Target, Users } from "lucide-react";

import { ProgressBar } from "@/components/charts/progress-bar";
import { KpiCard, type KpiStatus } from "@/components/kpi-card";
import { formatEUR, formatMonths, formatPct } from "@/lib/format";
import { currentPeriodKey, isProvisional, previousPeriodKey } from "@/lib/period";
import { createClient } from "@/lib/supabase/server";

// Home — the 4 North-Star KPI cards (BI-05, BI-04, BI-01).
//
// A logged-in user reads "how far to €100k, did we hit €4k, did anyone blow budget, what's
// the margin?" for the SELECTED month (the shared ?period=YYYYMM selector in the shell). All
// reads go through the @supabase/ssr server client under the user JWT + RLS — NEVER the
// Drizzle/postgres client and NEVER service_role (T-02-11 / RESEARCH Pitfall 3).
//
// First-class states (UI-SPEC §7): the current open month shows a Provisional pill and the
// €4k card is NEVER red; "no budgets set" renders a distinct neutral state (never a false
// green); a brand-new account with no ingested data yet shows the calm "Synchronizing" band.

// The €100k goal and the €4k monthly contribution target (CLAUDE.md north-star).
const GOAL_EUR = 100_000;
const MONTHLY_TARGET_EUR = 4_000;

// Per-person cost centers (the household budget owners; `compartilhado`/`sublocacao` are not
// a single person, so the per-person budget card keys off these two — codes from the seed).
const PERSON_COST_CENTERS = [
  { code: "lorenzo", name: "Lorenzo" },
  { code: "fernanda", name: "Fernanda" },
] as const;

/** Parse/clamp the raw ?period search param to a valid YYYYMM int (T-02-12). */
function parsePeriod(raw: string | string[] | undefined, currentKey: number): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || !/^\d{6}$/.test(value)) return currentKey;
  const key = Number(value);
  const month = key % 100;
  if (month < 1 || month > 12) return currentKey;
  if (key > currentKey) return currentKey; // forward-only — no future months
  return key;
}

/** numeric columns arrive from supabase-js as strings; parse to a finite number (0 fallback). */
function num(v: string | number | null | undefined): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const supabase = await createClient();
  const now = new Date();
  const currentKey = currentPeriodKey(now);
  const { period: rawPeriod } = await searchParams;
  const period = parsePeriod(rawPeriod, currentKey);
  const provisional = isProvisional(period, now);

  // --- Reads (all under RLS via @supabase/ssr) -----------------------------------------
  // 1. The selected month's headline KPIs.
  const { data: kpiRow, error: kpiError } = await supabase
    .from("v_home_kpis")
    .select("period_key, revenue, investimento, costs, sublet_net, result, margin, net_worth")
    .eq("period_key", period)
    .maybeSingle();

  // 2. Last month's P&L for the margin MoM delta (year-boundary-safe prev key).
  const { data: prevPnl } = await supabase
    .from("v_pnl_monthly")
    .select("margin")
    .eq("period_key", previousPeriodKey(period))
    .maybeSingle();

  // 3. Cumulative investimento cost-basis (sum across every populated period) — the €100k
  //    progress value. Also doubles as the "any data ingested yet?" probe.
  const { data: allPnl, error: pnlError } = await supabase
    .from("v_pnl_monthly")
    .select("period_key, investimento, costs");

  // 4. Per-person budget-vs-actual at cost-center grain (category_id null) for this period.
  const { data: bvaRows } = await supabase
    .from("v_costcenter_bva")
    .select("cost_center, category_id, period_key, budget, actual")
    .eq("period_key", period)
    .is("category_id", null);

  if (kpiError || pnlError) {
    return (
      <p role="alert" className="text-sm text-[var(--loss)]">
        Couldn&apos;t load this view. The data sync may be in progress. Refresh in a moment;
        if it persists, check the connection on Config.
      </p>
    );
  }

  // First-use (forward-only): no ingested P&L anywhere yet → the calm sync band + €0 states.
  const hasAnyData = (allPnl ?? []).length > 0;

  // --- Derive the 4 KPIs ---------------------------------------------------------------
  const revenue = num(kpiRow?.revenue);
  const investimentoThisMonth = num(kpiRow?.investimento);
  const margin = kpiRow?.margin === null || kpiRow?.margin === undefined ? null : num(kpiRow.margin);
  const prevMargin =
    prevPnl?.margin === null || prevPnl?.margin === undefined ? null : num(prevPnl.margin);

  const investedToDate = (allPnl ?? []).reduce((acc, r) => acc + num(r.investimento), 0);
  const goalPct = Math.min(100, (investedToDate / GOAL_EUR) * 100);

  // Secondary KPIs (BI-07): net worth + months-of-reserve. Net worth comes straight from
  // v_home_kpis; months-of-reserve = liquid cash ÷ trailing-3-month average costs, computed
  // inline here (mirrors src/lib/db/marts.ts monthsOfReserve — the page must NOT import the
  // Drizzle-backed marts module into the src/app bundle, T-02-11 / RESEARCH Pitfall 3).
  const netWorth = num(kpiRow?.net_worth);
  const trailingCosts = (allPnl ?? [])
    .filter((r) => Number(r.period_key) <= period)
    .sort((a, b) => Number(b.period_key) - Number(a.period_key))
    .slice(0, 3)
    .map((r) => num(r.costs));
  const avgCosts = trailingCosts.length
    ? trailingCosts.reduce((acc, c) => acc + c, 0) / trailingCosts.length
    : 0;
  const monthsReserve = avgCosts > 0 ? netWorth / avgCosts : null;

  // €4k card status — the open month is NEVER red (UI-SPEC §1).
  const remaining = MONTHLY_TARGET_EUR - investimentoThisMonth;
  const fourKStatus: KpiStatus =
    investimentoThisMonth >= MONTHLY_TARGET_EUR
      ? { label: "On track", tone: "gain" }
      : provisional
        ? { label: `${formatEUR(remaining, 0)} to go`, tone: "warning" }
        : { label: `Missed — ${formatEUR(remaining, 0)} short`, tone: "loss" };

  // Per-person budget status — names who; distinct neutral "not set" (never a false green).
  const personBva = PERSON_COST_CENTERS.map((p) => {
    const row = (bvaRows ?? []).find((r) => r.cost_center === p.code);
    return row ? { ...p, budget: num(row.budget), actual: num(row.actual) } : null;
  }).filter((x): x is NonNullable<typeof x> => x !== null);

  const overBudget = personBva.filter((p) => p.actual > p.budget);
  let budgetStatus: KpiStatus;
  let budgetHref = "/cost-centers";
  if (personBva.length === 0) {
    budgetStatus = { label: "Budgets not set", tone: "neutral" };
    budgetHref = "/config";
  } else if (overBudget.length === PERSON_COST_CENTERS.length && overBudget.length > 1) {
    budgetStatus = { label: "Both over budget", tone: "loss" };
  } else if (overBudget.length > 0) {
    budgetStatus = { label: `${overBudget[0].name} over budget`, tone: "loss" };
  } else {
    budgetStatus = { label: "On track", tone: "gain" };
  }

  // Margin MoM delta.
  const marginDelta =
    margin !== null && prevMargin !== null ? (margin - prevMargin) * 100 : null;

  return (
    <div className="space-y-6">
      {/* Page header (h1 left); the shared month selector lives in the shell top bar. */}
      <header className="flex items-center gap-3">
        <h1 className="text-xl font-semibold">Home</h1>
        {provisional && (
          <span
            className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-[var(--warning)]"
            title="Month in progress; figures will change."
          >
            Provisional
          </span>
        )}
      </header>

      {/* First-use sync band — calm, never "broken". €0 states render beneath it. */}
      {!hasAnyData && (
        <div
          role="status"
          className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          Synchronizing — your first data appears tomorrow. The daily sync runs each morning;
          no manual import needed.
        </div>
      )}

      {/* The 4 headline KPIs in question order: single col → 2×2 md → 4-across xl. */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {/* 1. €100k progress — STRUCTURAL emphasis (col-span / ring), NOT a bigger font. */}
        <KpiCard
          label="Invested (cost basis)"
          icon={Target}
          value={formatEUR(investedToDate, 0)}
          href="/cost-centers"
          emphasis
          status={{ label: `${formatPct(goalPct)} to goal`, tone: "gain" }}
        >
          <ProgressBar
            value={goalPct}
            variant="default"
            label="Progress toward €100.000"
            valueText={`${formatEUR(investedToDate, 0)} of ${formatEUR(GOAL_EUR, 0)}`}
          />
        </KpiCard>

        {/* 2. €4k this month — open month is never red. */}
        <KpiCard
          label="This month invested"
          icon={PiggyBank}
          value={formatEUR(investimentoThisMonth, 0)}
          href="/cost-centers"
          status={fourKStatus}
        >
          <ProgressBar
            value={(investimentoThisMonth / MONTHLY_TARGET_EUR) * 100}
            variant={investimentoThisMonth >= MONTHLY_TARGET_EUR ? "gain" : "warning"}
            label="Progress toward €4.000 this month"
            valueText={`${formatEUR(investimentoThisMonth, 0)} of ${formatEUR(MONTHLY_TARGET_EUR, 0)}`}
          />
        </KpiCard>

        {/* 3. Per-person budget. */}
        <KpiCard
          label="Budgets"
          icon={Users}
          value={
            personBva.length === 0
              ? formatEUR(0, 0)
              : formatEUR(
                  personBva.reduce((acc, p) => acc + p.actual, 0),
                  0,
                )
          }
          href={budgetHref}
          status={budgetStatus}
        />

        {/* 4. Margin %. */}
        <KpiCard
          label="Margin (% of net revenue)"
          icon={Coins}
          value={margin === null ? "—" : formatPct(margin * 100)}
          href="/spending"
          delta={
            marginDelta === null
              ? undefined
              : {
                  text: formatPct(Math.abs(marginDelta)),
                  direction: marginDelta >= 0 ? "up" : "down",
                  tone: marginDelta >= 0 ? "gain" : "loss",
                }
          }
          status={
            marginDelta === null
              ? {
                  label: revenue === 0 ? "No revenue this month" : "No prior month",
                  tone: "neutral",
                }
              : undefined
          }
        />
      </div>

      {/* Secondary KPIs (BI-07) — cash position + reserve runway, visually lighter. */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground">Cash &amp; reserves</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <KpiCard
            label="Net worth"
            icon={Landmark}
            value={formatEUR(netWorth, 0)}
            href="/cost-centers"
          />
          <KpiCard
            label="Months of reserve"
            icon={ShieldCheck}
            value={monthsReserve === null ? "—" : formatMonths(monthsReserve)}
            status={
              monthsReserve === null
                ? { label: "Not enough history yet", tone: "neutral" }
                : undefined
            }
          />
        </div>
      </section>
    </div>
  );
}
