import { Suspense } from "react";
import { cookies } from "next/headers";
import { PiggyBank, ShieldCheck, Users } from "lucide-react";

import { BusinessReadCard } from "@/components/business-read-card";
import { ProgressBar } from "@/components/charts/progress-bar";
import { NetWorthTrend, type NetWorthPoint } from "@/components/charts/net-worth-trend";
import { GoalHeroCard } from "@/components/goal-hero-card";
import { Greeting } from "@/components/greeting";
import { KpiCard, type KpiStatus } from "@/components/kpi-card";
import { OnboardingChecklist } from "@/components/onboarding-checklist";
import { ScorecardChips } from "@/components/scorecard-chips";
import { Skeleton } from "@/components/ui/skeleton";
import { VoiceCard } from "@/components/voice-card";
import { costCenterDisplayName } from "@/lib/cost-center-display";
import { formatEUR, formatMonths } from "@/lib/format";
import {
  allocate,
  EMPTY_STATE,
  foldAllocation,
  type AllocationEvent,
  type BucketState,
} from "@/lib/goal/allocation";
import { activeDenominator, getGoalTotal } from "@/lib/goal/getGoalTotal";
import { etaLine, nextMilestoneRemaining, streakChainNodes } from "@/lib/goal/hero-view";
import { savingsRate } from "@/lib/goal/level";
import { computeEta } from "@/lib/goal/momentum";
import { computeStreak } from "@/lib/goal/streak";
import { AnomalyChip } from "@/components/anomaly-chip";
import { detectAnomalies } from "@/lib/health/anomaly";
import { assembleScorecard } from "@/lib/health/scorecard";
import {
  readLatestInsight,
  type InsightReadClient,
} from "@/lib/health/insight-read";
import {
  readInsightThresholds,
  type InsightThresholdsReadClient,
} from "@/lib/health/thresholds";
import { resolveMe } from "@/lib/identity/me";
import { resolveMember, type Member } from "@/lib/identity/resolve-member";
import { demoAwareNow, isDemoForReads } from "@/lib/demo/mode";
import { readHomeKpis, readPnlMonthly, readBalanceTrend } from "@/lib/db/marts-read";
import { ONBOARDING_DISMISS_COOKIE } from "@/lib/onboarding/cookie";
import { getOnboardingState } from "@/lib/onboarding/state";
import { currentPeriodKey, isProvisional } from "@/lib/period";
import { createClient } from "@/lib/supabase/server";

// Home — the BALANCED fintech composition (D3-06). The AI VOICE card leads (AI-03, D-14), then four
// bands top-to-bottom:
//   (voice) — the latest AI CFO-memo insight, the FIRST element on Home (Phase 6).
//   A — Goal Hero (live €100k cost-basis) + the house-as-business margin read, side by side.
//   B — the KPI row (€4k this month [celebration host] · per-person budgets · months-of-reserve).
//   C — the net-worth / balance trend area chart.
//
// It RE-SKINS the existing Phase-2 Home: the same first-class comparability states (Provisional pill,
// never-fake-€0, "Missed only on a closed month"), the same shared ?period selector. The three
// headline mart reads (v_home_kpis / v_pnl_monthly / v_balance_trend) now flow through the CACHED,
// is_demo-partitioned seam `@/lib/db/marts-read` (OBS-02, D-08) — the cookie demo-partition is
// resolved at the page level and passed down; the cache callback reads via a non-request client and
// NEVER blends partitions. Per-request reads that legitimately need the session (onboarding probes,
// identity, budgets, household, the insight voice) stay on the anon+JWT @supabase/ssr client under
// RLS — NEVER the Drizzle client, NEVER service_role.
//
// STREAMING (OBS-02): the shell (header + greeting) renders immediately; the data-heavy dashboard
// (<HomeDashboard>) streams in behind a <Suspense> boundary with a layout-matching skeleton.

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

/** numeric columns arrive from the DB as strings; parse to a finite number (0 fallback). */
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
  // Demo-mode partition selector (D4-12) resolved FIRST so the display clock can be demo-anchored
  // (G1/D5-16): in demo mode `now` moves to the demo's latest data month so the current period is
  // populated; real mode is byte-identical (demoAwareNow(false, …) is the identity). The cookie read
  // stays HERE at the page level — `isDemo` is then passed to the cached mart seam as an explicit
  // argument (the cache callback must never read a cookie — Pitfall 2).
  const demoFilter = await isDemoForReads();
  const now = demoAwareNow(demoFilter, new Date());
  const currentKey = currentPeriodKey(now);
  const { period: rawPeriod } = await searchParams;
  const period = parsePeriod(rawPeriod, currentKey);
  const provisional = isProvisional(period, now);

  // Resolve the signed-in person → display name for the greeting h1 (PERS-02, D4-25). One
  // resolver (shared with the sidebar); identity follows the SESSION, so demo mode never changes
  // it and the persona names never reach the greeting (D4-26). Unmapped/null → generic greeting.
  // The email threads to the dashboard for the onboarding-dismissal lookup. This is the only
  // per-request read the shell awaits, so the header renders before the dashboard streams.
  const { displayName, email } = await resolveMe();

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

      {/* The data-heavy dashboard streams behind a Suspense boundary (OBS-02) — the cached mart
          reads + the per-request budget/household/insight reads resolve here, not in the shell. */}
      <Suspense fallback={<DashboardFallback />}>
        <HomeDashboard
          demoFilter={demoFilter}
          period={period}
          now={now}
          provisional={provisional}
          email={email}
        />
      </Suspense>
    </div>
  );
}

/** The Suspense fallback — mirrors the voice card + BAND A/B/C shape so the swap causes no jump. */
function DashboardFallback() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      {/* Voice card slot. */}
      <Skeleton className="h-28 w-full rounded-xl" />
      {/* BAND A — Goal hero + business read. */}
      <div className="grid grid-cols-1 gap-4 @xl/main:grid-cols-2">
        <Skeleton className="h-56 w-full rounded-xl" />
        <Skeleton className="h-56 w-full rounded-xl" />
      </div>
      {/* BAND B — the KPI row. */}
      <div className="grid grid-cols-1 gap-4 @xl/main:grid-cols-2 @5xl/main:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-40 w-full rounded-xl" />
        ))}
      </div>
      {/* Scorecard + BAND C chart. */}
      <Skeleton className="h-32 w-full rounded-xl" />
      <Skeleton className="h-72 w-full rounded-xl" />
      <span className="sr-only">Loading dashboard…</span>
    </div>
  );
}

async function HomeDashboard({
  demoFilter,
  period,
  now,
  provisional,
  email,
}: {
  demoFilter: boolean;
  period: number;
  now: Date;
  provisional: boolean;
  email: string | undefined;
}) {
  const supabase = await createClient();

  // (demoFilter/`now` resolved in the shell so `now` is demo-anchored — EVERY mart read below filters
  // to the same partition so demo and real rows are NEVER summed. Real mode → is_demo=false; the
  // toggle / public demo → true.)

  // --- Reads ---------------------------------------------------------------------------
  // 1. The selected month's headline KPIs (the full P&L row drives the business read) — CACHED,
  //    is_demo-partitioned (readHomeKpis passes `demoFilter` into the cache key + tag).
  const kpiRow = await readHomeKpis(demoFilter, period);

  // 2. Cumulative investimento cost-basis (sum across every populated period) — the €100k progress
  //    value + the 12-mo invested sparkline. Also the "any data ingested yet?" probe. CACHED.
  const allPnl = await readPnlMonthly(demoFilter);

  // 3. Per-person budget-vs-actual at cost-center grain (category_id null) for this period. Stays on
  //    @supabase/ssr (per-request, per-period; also drives the budget KPI + anomaly flags).
  const { data: bvaRows } = await supabase
    .from("v_costcenter_bva")
    .select("cost_center, category_id, period_key, budget, actual")
    .eq("period_key", period)
    .eq("is_demo", demoFilter)
    .is("category_id", null);

  // 4. The net-worth balance trend (Band C). CACHED, is_demo-partitioned; the chart is a client island.
  const balanceTrend = await readBalanceTrend(demoFilter);

  // 4b. The household singleton (D5-01/16): `launch_date` gates the whole game (streak/waterfall/
  //     alerts run only post-launch); NULL = the first-class pre-launch "waiting" state. Demo-
  //     partitioned (T-05-12 — a missing is_demo filter would read the real launch date in demo mode).
  const { data: householdRow } = await supabase
    .from("household")
    .select("launch_date, why, epic_trip_active")
    .eq("is_demo", demoFilter)
    .maybeSingle();

  // 4c. The config-editable scorecard bands (D-07) for the Financial-Health summary. Demo-partitioned
  //     via the readInsightThresholds seam (DEFAULT_BANDS fallback when the partition has no row).
  const healthBands = await readInsightThresholds(
    supabase as unknown as InsightThresholdsReadClient,
    demoFilter,
  );

  // 4d. The latest AI insight (AI-03, D-14/15) — the narrative VOICE rendered FIRST on Home. Read
  //     via the demo-partitioned readLatestInsight seam (threads `.eq("is_demo", …)`, orders newest,
  //     limit 1). null → the warm first-run placeholder; a hard read failure → the degrade line. The
  //     helper never throws (it degrades to null); the try/catch only guards a thrown client so the
  //     KPIs below ALWAYS render — never an empty hole (AI-03). The read lives in the helper (not an
  //     inline `.from("insights")`) so the demo-read-filter guard is satisfied by the helper's own test.
  let latestInsight: Awaited<ReturnType<typeof readLatestInsight>> = null;
  let insightErrored = false;
  try {
    latestInsight = await readLatestInsight(
      supabase as unknown as InsightReadClient,
      demoFilter,
    );
  } catch {
    insightErrored = true;
  }
  // The generated-on date shown in the header lockup (de-DE, mono). An old date honestly signals
  // staleness (D-15) — no separate "stale" banner.
  const insightDateLabel = latestInsight
    ? new Intl.DateTimeFormat("de-DE", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(new Date(latestInsight.createdAt))
    : null;

  // 5. Onboarding existence probes (ONB-01, D4-19/12). hasConnection = any non-error connections
  //    row; hasBudgets = any budgets row (period-agnostic). BOTH are is_demo-gated via the SAME
  //    chokepoint value (demoFilter) — otherwise demo mode would read the REAL connection count
  //    and the real signal could be polluted by demo rows (T-04-PROBE / Eval 12 R2). In demo mode
  //    the seed satisfies all three signals, so getOnboardingState resolves complete:true and the
  //    checklist auto-hides (D4-07). hasTransactions REUSES the existing allPnl probe below — NO
  //    second transactions read (Pitfall 5). Count-only (head:true) — no rows fetched.
  const [{ count: connectionCount }, { count: budgetCount }, { data: dismissalData }] =
    await Promise.all([
      supabase
        .from("connections")
        .select("id", { count: "exact", head: true })
        .eq("is_demo", demoFilter)
        .or("consent_status.is.null,consent_status.neq.error"),
      supabase
        .from("budgets")
        .select("cost_center", { count: "exact", head: true })
        .eq("is_demo", demoFilter),
      // Read the dismissal flag + auth_email alongside the predicate (D4-21 — no extra round-trip,
      // no SSR flash). RLS scopes this to the allowlisted household.
      supabase.from("members").select("id, display_name, auth_email, onboarding_dismissed_at"),
    ]);

  // First-use (forward-only): no ingested P&L anywhere yet → the calm sync band + €0 states.
  const hasAnyData = (allPnl ?? []).length > 0;

  // --- Onboarding predicate (ONB-01/02, D4-19/20) --------------------------------------
  // Derive the non-blocking checklist state from the three all-periods signals. hasTransactions
  // REUSES hasAnyData (the same allPnl probe — never a second read). Re-derived every render, so
  // the predicate self-heals when a bank is disconnected. complete:true → the checklist never
  // renders (a set-up / demo household sees nothing — ONB-02).
  const onboarding = getOnboardingState({
    hasConnection: (connectionCount ?? 0) > 0,
    hasBudgets: (budgetCount ?? 0) > 0,
    hasTransactions: hasAnyData,
  });

  // Dismissal (D4-21): household-scoped members.onboarding_dismissed_at for the signed-in member,
  // read above with the predicate (no extra round-trip). An unmapped-but-allowlisted session
  // degrades to a session cookie (Eval 08 R2). A complete:true household never renders the card
  // regardless of the flag, so this only gates the partial state.
  const members: Member[] = (dismissalData ?? []).map((m) => ({
    id: m.id,
    displayName: m.display_name,
    authEmail: m.auth_email,
  }));
  const me = resolveMember(email, members);
  const dismissedRow = me
    ? (dismissalData ?? []).find((m) => m.id === me.id)?.onboarding_dismissed_at
    : null;
  const cookieStore = await cookies();
  const onboardingDismissed = me
    ? dismissedRow !== null && dismissedRow !== undefined
    : cookieStore.get(ONBOARDING_DISMISS_COOKIE)?.value === "1";

  // The Band-0 checklist renders ONLY when setup is incomplete AND not dismissed (never a route
  // gate / middleware redirect — middleware.ts is FROZEN; this is a calm Home pointer layer).
  const showOnboarding = !onboarding.complete && !onboardingDismissed;

  // --- Derive the Goal Hero + business read --------------------------------------------
  const revenue = num(kpiRow?.revenue);
  const investimentoThisMonth = num(kpiRow?.investimento);
  const costsThisMonth = num(kpiRow?.costs);
  const subletNet = num(kpiRow?.sublet_net);
  const result = num(kpiRow?.result);

  // BI-08 / D5-19: the operating margin (revenue − costs + sublet_net) is the HEADLINE — investing is
  // BELOW the line (pay-yourself-first), not a cost. Computed inline (the page must NOT import the
  // Drizzle-backed marts module, T-02-11); `result` (householdResult) is the net-after-investment.
  const operatingMargin = revenue - costsThisMonth + subletNet;
  const operatingMarginPct = revenue === 0 ? null : operatingMargin / revenue;

  // --- The €100k progress = the WEALTH COST BASIS via getGoalTotal, NOT Σ investimento -----------
  // THE #1 correctness hazard (D5-02 / RESEARCH Pitfall 1): the hero figure is the Wealth cost basis,
  // which is STRICTLY SMALLER than Σ investimento once a surplus transfer funds Brazil/Adventures. We
  // fold the demo-partitioned monthly investimento through the pure allocation waterfall. Leg-level
  // transfers + per-transfer overrides are unavailable at the Home glance grain (only the monthly
  // v_pnl_monthly total is), so we fold ONE transfer per populated month; the Goal page (Plan 05-05+)
  // owns the per-leg/override fold. `launch_date` gates the fold — pre-launch wealth is €0 (D5-02).
  const launchDate = householdRow?.launch_date ?? null;
  const preLaunch = launchDate === null;

  const periodsAsc = (allPnl ?? [])
    .slice()
    .sort((a, b) => Number(a.period_key) - Number(b.period_key));

  const investEvents: AllocationEvent[] = periodsAsc
    .filter((r) => num(r.investimento) > 0)
    .map((r) => {
      const key = Number(r.period_key);
      const mm = String(key % 100).padStart(2, "0");
      return {
        kind: "transfer" as const,
        amount: num(r.investimento),
        bookingDate: `${Math.floor(key / 100)}-${mm}-01`,
        id: key,
      };
    });

  const goalState = foldAllocation(investEvents, { launchDate });
  const goalTotal = getGoalTotal(goalState); // the Wealth cost basis — the €100k hero figure.

  // The 12-mo sparkline now tracks cumulative WEALTH (the €100k figure's trajectory), not Σ
  // investimento. Fold the launch-gated monthly transfers incrementally so each point is running Wealth.
  const liveEvents =
    launchDate === null ? [] : investEvents.filter((e) => e.bookingDate >= launchDate);
  let runningState: BucketState = { ...EMPTY_STATE };
  const cumulativeWealth = liveEvents.map((e) => {
    runningState = allocate(e.amount, runningState, {});
    return runningState.wealth;
  });
  const sparkline = cumulativeWealth.slice(-12);

  // The €4k streak (D5-06/08) over all populated months, launch-gated. Feeds the hero pulse + alert.
  const invByPeriod = new Map<number, number>(
    (allPnl ?? []).map((r) => [Number(r.period_key), num(r.investimento)] as const),
  );
  const streak = computeStreak(invByPeriod, now, launchDate);
  const streakNodes = streakChainNodes(invByPeriod, now, 6, launchDate);

  // The honest, confidence-gated ETA (D5-15) to the active €100k rung, from the trailing pace.
  const launchKey =
    launchDate === null ? null : Number(launchDate.slice(0, 7).replace("-", ""));
  const postLaunchMonthly = periodsAsc
    .filter((r) => (launchKey === null ? false : Number(r.period_key) >= launchKey))
    .map((r) => num(r.investimento));
  const eta = computeEta({
    remaining: Math.max(0, activeDenominator(goalTotal) - goalTotal),
    monthlyContributions: postLaunchMonthly.slice(-6),
  });

  // Pre-launch → the calm hero: no streak/ETA/next-milestone (D5-16). Post-launch → the full glance.
  const heroEtaLine = preLaunch ? undefined : etaLine(eta);
  const heroNextMilestone = preLaunch ? null : nextMilestoneRemaining(goalTotal);
  const heroStreakHits = preLaunch ? undefined : streakNodes.hits;

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

  // --- Financial-Health scorecard (HEALTH-01/02, D-05..09) — NARRATES the values Home ALREADY
  //     computed (never a second mart read): savings rate (level.ts), months-of-reserve, budget
  //     adherence (max over-budget fraction from bvaRows), cost-basis growth momentum (D-08, the MoM
  //     Δ of the getGoalTotal running Wealth), and the €4k streak. Resolved into bands for the 5-chip
  //     summary below the KPI/CFO decomposition (UI-SPEC §2a). Pre-launch / no-income income-dependent
  //     metrics read neutral (D-09) — the couple is currently between incomes, never a red chip.
  const homeSavingsRate = savingsRate(investimentoThisMonth, revenue);
  let budgetOverspendPct = 0;
  for (const r of bvaRows ?? []) {
    const budget = num(r.budget);
    const actual = num(r.actual);
    if (budget > 0 && actual > budget) {
      budgetOverspendPct = Math.max(budgetOverspendPct, (actual - budget) / budget);
    }
  }
  const investmentGrowthMoM =
    cumulativeWealth.length >= 2
      ? cumulativeWealth[cumulativeWealth.length - 1] -
        cumulativeWealth[cumulativeWealth.length - 2]
      : cumulativeWealth.length === 1
        ? cumulativeWealth[0]
        : 0;
  const scorecard = assembleScorecard(
    {
      savingsRate: homeSavingsRate,
      monthsOfReserve: monthsReserve,
      budgetOverspendPct,
      investmentGrowth: investmentGrowthMoM,
      streak,
    },
    healthBands,
  );

  // --- Non-shame anomaly flags (AI-05, D-10/11/12) — the SAME pure detector Cost Centers + REM-02
  //     use. Deterministic over-budget / on-pace flags from the demo-partitioned bvaRows Home ALREADY
  //     read (no second fetch); the statistical-spike branch is gated by the distinct-month count.
  //     The clock is the demo-aware `now` so the demo computes mid-month correctly. Display-only (D-13).
  const monthsWithData = new Set(
    (allPnl ?? []).map((r) => Number(r.period_key)),
  ).size;
  const anomalyFlags = detectAnomalies(
    (bvaRows ?? []).map((r) => ({
      costCenter: r.cost_center,
      budget: num(r.budget),
      actual: num(r.actual),
    })),
    [],
    now,
    monthsWithData,
  ).slice(0, 2);
  // scope code → display name (demo-remapped Alice/Bob on the public deploy — display-only, D4-08/26).
  const anomalyLabels: Record<string, string> = {
    lorenzo: costCenterDisplayName("lorenzo", "Lorenzo", demoFilter),
    fernanda: costCenterDisplayName("fernanda", "Fernanda", demoFilter),
    compartilhado: costCenterDisplayName("compartilhado", "Shared", demoFilter),
  };

  // The net-worth trend points for the chart island.
  const trendPoints: NetWorthPoint[] = (balanceTrend ?? []).map((r) => ({
    date: r.date,
    netWorth: num(r.net_worth),
  }));

  // €4k card status — the open month is NEVER red (UI-SPEC §1). The celebration moment fires
  // only when the month has reached €4.000.
  const remaining = MONTHLY_TARGET_EUR - investimentoThisMonth;
  const fourKHit = investimentoThisMonth >= MONTHLY_TARGET_EUR;
  // A sub-€4k month is NEVER red (D5-07 — no shame): the open month reads "to go" (amber) and a
  // closed miss reads "short — next month" (amber, us-framed), never `--loss`/red.
  const fourKStatus: KpiStatus = fourKHit
    ? { label: "On track", tone: "gain" }
    : provisional
      ? { label: `${formatEUR(remaining, 0)} to go`, tone: "warning" }
      : { label: `${formatEUR(remaining, 0)} short — next month`, tone: "warning" };

  // The warm, us-framed sub-€4k Home alert (D5-07): fires ONLY when the SELECTED month is post-launch
  // and its total investimento is under €4.000. Never red, never "owed"; suppressed entirely pre-launch.
  const periodIsPostLaunch = launchKey !== null && period >= launchKey;
  const showLightMonthAlert =
    !preLaunch && periodIsPostLaunch && investimentoThisMonth < MONTHLY_TARGET_EUR;

  // Per-person budget status — names who; distinct neutral "not set" (never a false green).
  // In demo mode the person LABEL is the anonymized persona (Alice/Bob); the FK code/partition
  // is unchanged (display-only remap — D4-08/26).
  const personBva = PERSON_COST_CENTERS.map((p) => {
    const row = (bvaRows ?? []).find((r) => r.cost_center === p.code);
    const name = costCenterDisplayName(p.code, p.name, demoFilter);
    return row ? { ...p, name, budget: num(row.budget), actual: num(row.actual) } : null;
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
    <>
      {/* The AI voice (AI-03, D-14/15) — the FIRST element of the dashboard, above the KPI/CFO
          decomposition. One warm, true CFO-memo paragraph; the latest insight (any kind) with its
          generated date, or a warm first-run placeholder / degrade line so the goal hero + KPIs
          below always follow. */}
      <VoiceCard
        body={latestInsight?.body}
        dateLabel={insightDateLabel}
        errored={insightErrored}
      />

      {/* BAND 0 — the non-blocking, dismissible onboarding checklist (ONB-01/02, D4-20). Renders
          only when setup is incomplete AND not dismissed; NEVER a route gate / middleware redirect.
          The green steps below explain WHY the sync band shows (complementary, not redundant). */}
      {showOnboarding && (
        <OnboardingChecklist steps={onboarding.steps} nextStep={onboarding.nextStep} />
      )}

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

      {/* Sub-€4k month alert (D5-07) — warm, us-framed, NEVER red, post-launch only. Acknowledges
          what was invested, states the gap without alarm, resets to next month; never "owed". */}
      {showLightMonthAlert && (
        <div
          role="status"
          className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground"
        >
          A lighter month for you two — {formatEUR(investimentoThisMonth, 0)} toward the goal.
          You&apos;ve got next month.
        </div>
      )}

      {/* BAND A — the balanced split: Goal Hero + business read, side by side on ≥xl. */}
      <div className="grid grid-cols-1 gap-4 @xl/main:grid-cols-2">
        {/* Desktop hero (≥xl) and the mobile reorder share data; render both variants gated. */}
        <GoalHeroCard
          investedToDate={goalTotal}
          goalEur={GOAL_EUR}
          contributionThisMonth={investimentoThisMonth}
          sparkline={sparkline}
          preLaunch={preLaunch}
          nextMilestoneRemaining={heroNextMilestone}
          etaLine={heroEtaLine}
          streakHits={heroStreakHits}
          streakProvisionalHit={streakNodes.provisionalHit}
          streakCurrent={streak.current}
          streakLongest={streak.longest}
          className="hidden @xl/main:flex"
        />
        <GoalHeroCard
          investedToDate={goalTotal}
          goalEur={GOAL_EUR}
          contributionThisMonth={investimentoThisMonth}
          sparkline={sparkline}
          preLaunch={preLaunch}
          nextMilestoneRemaining={heroNextMilestone}
          etaLine={heroEtaLine}
          streakHits={heroStreakHits}
          streakProvisionalHit={streakNodes.provisionalHit}
          streakCurrent={streak.current}
          streakLongest={streak.longest}
          mobile
          className="@xl/main:hidden"
        />
        <BusinessReadCard
          operatingMargin={operatingMargin}
          operatingMarginPct={operatingMarginPct}
          revenue={revenue}
          investimento={investimentoThisMonth}
          costs={costsThisMonth}
          subletNet={subletNet}
          netAfterInvestment={result}
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

      {/* Financial-Health scorecard — the compact 5-chip status summary (D-05/06, UI-SPEC §2a),
          below the KPI/CFO decomposition. NARRATES the values above (no second read); pre-launch /
          no-income income-dependent chips read neutral "Not yet", never red (D-09). */}
      <section className="relative overflow-hidden rounded-xl bg-card p-6 text-card-foreground shadow-sm ring-1 ring-foreground/10 before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-foreground/10">
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-muted-foreground">Financial health</h2>
          <a
            href="/health"
            className="text-sm font-medium text-[var(--brand)] hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            View details
          </a>
        </div>
        <ScorecardChips card={scorecard} />
        {/* Non-shame overspend chip — the top 1–2 deterministic flags, below the scorecard chips
            (UI-SPEC §5, D-11/12). Amber-only, factual, DISPLAY ONLY (D-13). */}
        <AnomalyChip
          flags={anomalyFlags}
          monthsWithData={monthsWithData}
          labels={anomalyLabels}
          dayOfMonth={now.getDate()}
          className="mt-4"
        />
      </section>

      {/* BAND C — the net-worth / balance trend. */}
      <section className="relative overflow-hidden rounded-xl bg-card p-6 text-card-foreground shadow-sm ring-1 ring-foreground/10 before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-foreground/10">
        <NetWorthTrend data={trendPoints} />
      </section>
    </>
  );
}
