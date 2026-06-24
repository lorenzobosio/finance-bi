import { PiggyBank, ShieldCheck, Users } from "lucide-react";

import { BusinessReadCard } from "@/components/business-read-card";
import { ProgressBar } from "@/components/charts/progress-bar";
import { NetWorthTrend, type NetWorthPoint } from "@/components/charts/net-worth-trend";
import { GoalHeroCard } from "@/components/goal-hero-card";
import { Greeting } from "@/components/greeting";
import { KpiCard, type KpiStatus } from "@/components/kpi-card";
import { formatEUR, formatMonths } from "@/lib/format";
import { resolveMe } from "@/lib/identity/me";
import { currentPeriodKey, isProvisional } from "@/lib/period";
import { createClient } from "@/lib/supabase/server";

// Home — the BALANCED fintech composition (D3-06). Four bands top-to-bottom:
//   A — Goal Hero (live €100k cost-basis) + the house-as-business margin read, side by side.
//   B — the KPI row (€4k this month [celebration host] · per-person budgets · months-of-reserve).
//   C — the net-worth / balance trend area chart.
//   D — an empty AI "phrase of the day" slot (Phase 6).
//
// It RE-SKINS the existing Phase-2 Home: same RLS mart reads (anon+JWT via @supabase/ssr — NEVER
// the Drizzle client, NEVER service_role), the same shared ?period selector, the same first-class
// comparability states (Provisional pill, never-fake-€0, "Missed only on a closed month"). The
// rich Goal-Hero journey/streak/bucket content is Phase 5; here we build the LAYOUT on real data.

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

  // Resolve the signed-in person → display name for the greeting h1 (PERS-02, D4-25). One
  // resolver (shared with the sidebar); identity follows the SESSION, so demo mode never changes
  // it and the persona names never reach the greeting (D4-26). Unmapped/null → generic greeting.
  const { displayName } = await resolveMe();

  // --- Reads (all under RLS via @supabase/ssr) -----------------------------------------
  // 1. The selected month's headline KPIs (the full P&L row drives the business read).
  const { data: kpiRow, error: kpiError } = await supabase
    .from("v_home_kpis")
    .select("period_key, revenue, investimento, costs, sublet_net, result, margin, net_worth")
    .eq("period_key", period)
    .maybeSingle();

  // 2. Cumulative investimento cost-basis (sum across every populated period) — the €100k
  //    progress value + the 12-mo invested sparkline. Also the "any data ingested yet?" probe.
  const { data: allPnl, error: pnlError } = await supabase
    .from("v_pnl_monthly")
    .select("period_key, investimento, costs");

  // 3. Per-person budget-vs-actual at cost-center grain (category_id null) for this period.
  const { data: bvaRows } = await supabase
    .from("v_costcenter_bva")
    .select("cost_center, category_id, period_key, budget, actual")
    .eq("period_key", period)
    .is("category_id", null);

  // 4. The net-worth balance trend (Band C). Typed read; the chart is a client island.
  const { data: balanceTrend } = await supabase
    .from("v_balance_trend")
    .select("date, net_worth")
    .order("date", { ascending: true });

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

  // --- Derive the Goal Hero + business read --------------------------------------------
  const revenue = num(kpiRow?.revenue);
  const investimentoThisMonth = num(kpiRow?.investimento);
  const costsThisMonth = num(kpiRow?.costs);
  const subletNet = num(kpiRow?.sublet_net);
  const result = num(kpiRow?.result);
  const margin = kpiRow?.margin === null || kpiRow?.margin === undefined ? null : num(kpiRow.margin);

  const investedToDate = (allPnl ?? []).reduce((acc, r) => acc + num(r.investimento), 0);

  // The 12-mo invested sparkline: the running cumulative cost-basis over the last 12 periods.
  const periodsAsc = (allPnl ?? [])
    .slice()
    .sort((a, b) => Number(a.period_key) - Number(b.period_key));
  let runningInvested = 0;
  const cumulativeInvested = periodsAsc.map((r) => {
    runningInvested += num(r.investimento);
    return runningInvested;
  });
  const sparkline = cumulativeInvested.slice(-12);

  // Net worth + months-of-reserve (BI-07). Net worth from v_home_kpis; reserve = liquid cash ÷
  // trailing-3-month average costs, computed inline (the page must NOT import the Drizzle-backed
  // marts module into the src/app bundle, T-02-11 / RESEARCH Pitfall 3).
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

  // The net-worth trend points for the chart island.
  const trendPoints: NetWorthPoint[] = (balanceTrend ?? []).map((r) => ({
    date: r.date,
    netWorth: num(r.net_worth),
  }));

  // €4k card status — the open month is NEVER red (UI-SPEC §1). The celebration moment fires
  // only when the month has reached €4.000.
  const remaining = MONTHLY_TARGET_EUR - investimentoThisMonth;
  const fourKHit = investimentoThisMonth >= MONTHLY_TARGET_EUR;
  const fourKStatus: KpiStatus = fourKHit
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

  return (
    <div className="@container/main space-y-6">
      {/* Page header (h1 left); the shared month selector lives in the shell top bar. */}
      <header className="flex items-center gap-3">
        <Greeting name={displayName} />
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

      {/* BAND A — the balanced split: Goal Hero + business read, side by side on ≥xl. */}
      <div className="grid grid-cols-1 gap-4 @xl/main:grid-cols-2">
        {/* Desktop hero (≥xl) and the mobile reorder share data; render both variants gated. */}
        <GoalHeroCard
          investedToDate={investedToDate}
          goalEur={GOAL_EUR}
          contributionThisMonth={investimentoThisMonth}
          sparkline={sparkline}
          className="hidden @xl/main:flex"
        />
        <GoalHeroCard
          investedToDate={investedToDate}
          goalEur={GOAL_EUR}
          contributionThisMonth={investimentoThisMonth}
          sparkline={sparkline}
          mobile
          className="@xl/main:hidden"
        />
        <BusinessReadCard
          margin={margin}
          revenue={revenue}
          investimento={investimentoThisMonth}
          costs={costsThisMonth}
          subletNet={subletNet}
          result={result}
          href="/spending"
        />
      </div>

      {/* BAND B — the KPI row: €4k this month (celebration host) · budgets · months-of-reserve. */}
      <div className="grid grid-cols-1 gap-4 @xl/main:grid-cols-2 @5xl/main:grid-cols-3">
        {/* €4k this month — the celebration moment + never red on the open month. */}
        <KpiCard
          label="This month invested"
          icon={<PiggyBank />}
          value={formatEUR(investimentoThisMonth, 0)}
          valueNumber={investimentoThisMonth}
          href="/cost-centers"
          status={fourKStatus}
          celebrate={fourKHit}
        >
          <ProgressBar
            value={(investimentoThisMonth / MONTHLY_TARGET_EUR) * 100}
            variant={fourKHit ? "gain" : "warning"}
            label="Progress toward €4.000 this month"
            valueText={`${formatEUR(investimentoThisMonth, 0)} of ${formatEUR(MONTHLY_TARGET_EUR, 0)}`}
          />
        </KpiCard>

        {/* Per-person budget. */}
        <KpiCard
          label="Budgets"
          icon={<Users />}
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

        {/* Months of reserve (secondary KPI). */}
        <KpiCard
          label="Months of reserve"
          icon={<ShieldCheck />}
          value={monthsReserve === null ? "—" : formatMonths(monthsReserve)}
          status={
            monthsReserve === null
              ? { label: "Not enough history yet", tone: "neutral" }
              : undefined
          }
        />
      </div>

      {/* BAND C — the net-worth / balance trend. */}
      <section className="relative overflow-hidden rounded-xl bg-card p-6 text-card-foreground shadow-sm ring-1 ring-foreground/10 before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-foreground/10">
        <NetWorthTrend data={trendPoints} />
      </section>

      {/* BAND D — AI "phrase of the day" slot (Phase 6, intentionally empty this phase). */}
      {/* TODO(Phase 6): mount the AI insights strip here, reading the `insights` table. */}
    </div>
  );
}
