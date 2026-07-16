import { Activity } from "lucide-react";
import { Suspense } from "react";

import { ScorecardChips } from "@/components/scorecard-chips";
import { demoAwareNow, isDemoForReads } from "@/lib/demo/mode";
import { formatEUR, formatMonths, formatPct } from "@/lib/format";
import {
  allocate,
  EMPTY_STATE,
  type AllocationEvent,
  type BucketState,
} from "@/lib/goal/allocation";
import { readHouseholdConfig, type HouseholdReadClient } from "@/lib/goal/household";
import { savingsRate } from "@/lib/goal/level";
import { computeStreak } from "@/lib/goal/streak";
import { assembleScorecard, type MetricRead } from "@/lib/health/scorecard";
import {
  readInsightThresholds,
  type InsightThresholdsReadClient,
} from "@/lib/health/thresholds";
import { currentPeriodKey } from "@/lib/period";
import {
  readOpenReconcileFlags,
  type ReconcileReadClient,
} from "@/lib/reconcile/read";
import {
  deriveIngestHealth,
  ingestHealthCopy,
  readLastIngestAt,
  type IngestHealthReadClient,
} from "@/lib/status/ingest-health";
import { createClient } from "@/lib/supabase/server";

// The Financial-Health scorecard page (`/health`, D-05). It NARRATES the five metrics (HEALTH-02) —
// savings rate · months-of-reserve · budget adherence · investment growth (contributions) · €4k
// streak — each resolved into a healthy/watch/off-track/neutral read against the config-editable
// `insight_thresholds` bands (D-07, with the code-side DEFAULT_BANDS fallback). Reads go through the
// @supabase/ssr server seam under RLS, partitioned by is_demo (Pitfall 3) — NEVER the server-only
// marts module (that stays out of the src/app bundle).
// Pre-launch / no-income income-dependent metrics read neutral "Not yet", never red (D-09).

/** numeric columns arrive from supabase-js as strings; parse to a finite number (0 fallback). */
function num(v: string | number | null | undefined): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export default async function HealthPage() {
  const supabase = await createClient();
  // Demo-mode partition selector resolved FIRST so the display clock is demo-anchored (G1/D5-16);
  // every read below filters to ONE partition — demo and real rows are NEVER summed.
  const demoFilter = await isDemoForReads();
  const now = demoAwareNow(demoFilter, new Date());
  const currentKey = currentPeriodKey(now);

  // The household singleton — launch_date gates the journey; NULL = the pre-launch waiting state.
  const household = await readHouseholdConfig(
    supabase as unknown as HouseholdReadClient,
    demoFilter,
  );
  const launchDate = household.launchDate;

  // The config-editable scorecard bands (D-07) — the real is_demo=false singleton, or DEFAULT_BANDS
  // when the partition has no row (the demo partition seeds none).
  const bands = await readInsightThresholds(
    supabase as unknown as InsightThresholdsReadClient,
    demoFilter,
  );

  // 1. This month's headline KPIs (revenue / invested / costs / net worth).
  const { data: kpiRow } = await supabase
    .from("v_home_kpis")
    .select("period_key, revenue, investimento, costs, net_worth")
    .eq("period_key", currentKey)
    .eq("is_demo", demoFilter)
    .maybeSingle();

  // 2. All-months P&L — the reserve trailing average + the launch-gated cost-basis fold.
  const { data: allPnl } = await supabase
    .from("v_pnl_monthly")
    .select("period_key, investimento, costs")
    .eq("is_demo", demoFilter);

  // 3. Per-cost-center budget-vs-actual (cost-center grain) for the budget-adherence read.
  const { data: bvaRows } = await supabase
    .from("v_costcenter_bva")
    .select("cost_center, category_id, period_key, budget, actual")
    .eq("period_key", currentKey)
    .eq("is_demo", demoFilter)
    .is("category_id", null);

  // Data-reconciliation drill-down (DAT-02) — the OPEN flags for the active partition, is_demo-scoped
  // under RLS (T-07-05: a missing filter would blend real discrepancies into the public demo).
  const { flags: reconcileFlags } = await readOpenReconcileFlags(
    supabase as unknown as ReconcileReadClient,
    demoFilter,
  );

  const hasAnyData = (allPnl ?? []).length > 0;

  // --- Narrate the five metric VALUES via the existing pure helpers (HEALTH-02) -----------------
  const revenue = num(kpiRow?.revenue);
  const investimentoThisMonth = num(kpiRow?.investimento);
  const netWorth = num(kpiRow?.net_worth);

  // Savings rate (level.ts) — null when no revenue (marts null-not-NaN → D-09 neutral).
  const savingsRateValue = savingsRate(investimentoThisMonth, revenue);

  // Months-of-reserve = net worth ÷ trailing-3-month average costs (inline — the page must NOT
  // import the marts module). null when no cost history (→ D-09 neutral).
  const trailingCosts = (allPnl ?? [])
    .filter((r) => Number(r.period_key) <= currentKey)
    .sort((a, b) => Number(b.period_key) - Number(a.period_key))
    .slice(0, 3)
    .map((r) => num(r.costs));
  const avgCosts = trailingCosts.length
    ? trailingCosts.reduce((acc, c) => acc + c, 0) / trailingCosts.length
    : 0;
  const monthsOfReserveValue = avgCosts > 0 ? netWorth / avgCosts : null;

  // Budget adherence — the MAX over-budget fraction across cost centers (0 when all within budget).
  let budgetOverspendPct = 0;
  for (const r of bvaRows ?? []) {
    const budget = num(r.budget);
    const actual = num(r.actual);
    if (budget > 0 && actual > budget) {
      budgetOverspendPct = Math.max(budgetOverspendPct, (actual - budget) / budget);
    }
  }

  // Investment growth = MoM Δ of the getGoalTotal Wealth cost basis (D-08 contributions momentum),
  // folded from the launch-gated monthly investimento through the pure allocation waterfall.
  const investEvents: AllocationEvent[] = (allPnl ?? [])
    .slice()
    .sort((a, b) => Number(a.period_key) - Number(b.period_key))
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
  const liveEvents =
    launchDate === null ? [] : investEvents.filter((e) => e.bookingDate >= launchDate);
  let runningState: BucketState = { ...EMPTY_STATE };
  const cumulativeWealth = liveEvents.map((e) => {
    runningState = allocate(e.amount, runningState, {});
    return runningState.wealth; // getGoalTotal(state) — the €100k cost basis figure.
  });
  const investmentGrowth =
    cumulativeWealth.length >= 2
      ? cumulativeWealth[cumulativeWealth.length - 1] -
        cumulativeWealth[cumulativeWealth.length - 2]
      : cumulativeWealth.length === 1
        ? cumulativeWealth[0]
        : 0;

  // €4k streak (launch-gated), from the monthly investimento map.
  const invByPeriod = new Map<number, number>(
    (allPnl ?? []).map((r) => [Number(r.period_key), num(r.investimento)] as const),
  );
  const streak = computeStreak(invByPeriod, now, launchDate);

  // Resolve the five values → bands (the AI never computes this — HEALTH-02).
  const card = assembleScorecard(
    {
      savingsRate: savingsRateValue,
      monthsOfReserve: monthsOfReserveValue,
      budgetOverspendPct,
      investmentGrowth,
      streak,
    },
    bands,
  );

  // Per-metric numeric detail (font-mono tabular-nums per UI-SPEC §Typography).
  const details: Array<{ label: string; read: MetricRead; display: string; note?: string }> = [
    {
      label: "Savings rate",
      read: card.savingsRate,
      display:
        card.savingsRate.value === null ? "—" : formatPct(card.savingsRate.value * 100),
    },
    {
      label: "Months of reserve",
      read: card.monthsOfReserve,
      display:
        card.monthsOfReserve.value === null
          ? "—"
          : formatMonths(card.monthsOfReserve.value),
    },
    {
      label: "Budget adherence",
      read: card.budgetAdherence,
      display:
        (card.budgetAdherence.value ?? 0) <= 0
          ? "Within budget"
          : `${formatPct((card.budgetAdherence.value ?? 0) * 100)} over`,
    },
    {
      label: "Growth (contributions)",
      read: card.investmentGrowth,
      display: formatEUR(card.investmentGrowth.value ?? 0, 0),
      note: "Cost basis — market value arrives in Phase 12.",
    },
    {
      label: "€4k streak",
      read: card.streak,
      display: formatMonths(card.streak.value ?? 0),
    },
  ];

  return (
    <div className="@container/main space-y-8">
      <header className="flex items-center gap-2">
        <Activity aria-hidden="true" className="size-5 text-[var(--brand)]" />
        <h1 className="text-2xl font-semibold">Financial health</h1>
      </header>

      {!hasAnyData ? (
        <section className="rounded-xl bg-card p-6 ring-1 ring-foreground/10">
          <p className="font-semibold text-card-foreground">
            Your scorecard warms up after launch
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            We&apos;ll show savings rate, reserve, budgets, growth and your €4k streak once money
            starts moving.
          </p>
        </section>
      ) : (
        <>
          {/* The at-a-glance 5-chip status row (shared with Home). */}
          <ScorecardChips card={card} />

          {/* Per-metric detail — each numeric value in font-mono tabular-nums. */}
          <div className="grid grid-cols-1 gap-4 @xl/main:grid-cols-2 @3xl/main:grid-cols-3">
            {details.map((d) => (
              <section
                key={d.label}
                className="rounded-xl bg-card p-6 ring-1 ring-foreground/10"
              >
                <div className="text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground">
                  {d.label}
                </div>
                <div className="mt-2 font-mono text-3xl font-semibold tabular-nums leading-none">
                  {d.display}
                </div>
                <div className="mt-3">
                  <ScorecardDetailBand read={d.read} label={d.label} />
                </div>
                {d.note && (
                  <p className="mt-2 text-xs text-[var(--neutral-data)]">{d.note}</p>
                )}
              </section>
            ))}
          </div>
        </>
      )}

      {/* Data reconciliation drill-down (DAT-02) — factual, non-shame: either a calm "all reconciled"
          empty state or the open flags with expected/actual/delta in font-mono tabular-nums. */}
      <section className="rounded-xl bg-card p-6 ring-1 ring-foreground/10">
        <div className="text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground">
          Data reconciliation
        </div>
        {reconcileFlags.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            All reconciled — your balances and totals tie out to the bank.
          </p>
        ) : (
          <>
            <p className="mt-2 text-sm text-muted-foreground">
              {reconcileFlags.length}{" "}
              {reconcileFlags.length === 1 ? "discrepancy" : "discrepancies"} to review —
              the numbers below don&apos;t yet tie out.
            </p>
            <ul className="mt-4 space-y-3">
              {reconcileFlags.map((f, i) => (
                <li
                  key={`${f.periodKey}-${f.kind}-${i}`}
                  className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-foreground/5 pb-3 last:border-0 last:pb-0"
                >
                  <div className="text-sm">
                    <span className="font-medium">{periodLabel(f.periodKey)}</span>
                    <span className="ml-2 text-muted-foreground">
                      {f.kind === "balance_delta"
                        ? "Balance vs ledger"
                        : "Mart vs source"}
                    </span>
                  </div>
                  <div className="font-mono text-sm tabular-nums text-[var(--neutral-data)]">
                    expected {formatEUR(f.expectedEur, 2)} · actual{" "}
                    {formatEUR(f.actualEur, 2)} ·{" "}
                    <span className="text-[var(--warning)]">
                      Δ {formatEUR(f.deltaEur, 2)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {/* Cron/ingestion health (OBS-02, D-09) — an independent read wrapped in its own Suspense
          boundary (D-10) so a slow heartbeat read streams rather than blocking the scorecard.
          SURFACE ONLY: the reminder/notification is Phase 14 (REM). */}
      <Suspense fallback={<IngestionHealthFallback />}>
        <IngestionHealthSection />
      </Suspense>
    </div>
  );
}

// A calm loading placeholder for the streamed ingestion-health section (D-10 boundary).
function IngestionHealthFallback() {
  return (
    <section className="rounded-xl bg-card p-6 ring-1 ring-foreground/10">
      <div className="text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground">
        Ingestion health
      </div>
      <p className="mt-2 text-sm text-muted-foreground">Checking the pipeline…</p>
    </section>
  );
}

// The ingestion-health surface (OBS-02, D-09) — its OWN async server component so it streams behind
// the Suspense boundary above, independent of the scorecard + reconcile reads. Reads the latest
// SUCCESSFUL import_batches heartbeat under the owner JWT (RLS allowlist_all — RLS-safe here), derives
// fresh/stale/unknown via the pure deriveIngestHealth, and renders a factual, non-shame line (amber
// for stale, NEVER red — T-07-20). In the public demo the anon client has no import_batches policy
// (Pitfall 5) so the read returns nothing → 'unknown', which is the safe default.
async function IngestionHealthSection() {
  const supabase = await createClient();
  const demoFilter = await isDemoForReads();
  const now = demoAwareNow(demoFilter, new Date());

  const lastIngestAt = await readLastIngestAt(
    supabase as unknown as IngestHealthReadClient,
  );
  const health = deriveIngestHealth(lastIngestAt, now);

  const toneClass =
    health === "stale" ? "text-[var(--warning)]" : "text-muted-foreground";
  const syncedLine =
    lastIngestAt !== null ? `Last sync ${formatSyncDate(lastIngestAt)}.` : null;

  return (
    <section className="rounded-xl bg-card p-6 ring-1 ring-foreground/10">
      <div className="text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground">
        Ingestion health
      </div>
      <p className={`mt-2 text-sm font-medium ${toneClass}`}>
        {ingestHealthCopy(health)}
      </p>
      {syncedLine && (
        <p className="mt-1 text-xs text-muted-foreground">{syncedLine}</p>
      )}
    </section>
  );
}

/** Format a heartbeat timestamp as "d MMM yyyy" (locale-stable, no date-fns import needed). */
function formatSyncDate(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
}

/** Render a YYYYMM period key as "YYYY-MM" (e.g. 202607 → "2026-07"). */
function periodLabel(periodKey: number): string {
  const yyyy = Math.floor(periodKey / 100);
  const mm = String(periodKey % 100).padStart(2, "0");
  return `${yyyy}-${mm}`;
}

// A single band read line for the detail cards (icon + text + tone color — color never sole signal).
function ScorecardDetailBand({ read, label }: { read: MetricRead; label: string }) {
  const text =
    read.band === "healthy"
      ? "Healthy"
      : read.band === "watch"
        ? "Watch"
        : read.band === "off-track"
          ? "Off track"
          : label === "Growth (contributions)"
            ? "No change yet"
            : "Not yet — starts at launch";
  const toneClass =
    read.tone === "gain"
      ? "text-[var(--gain)]"
      : read.tone === "loss"
        ? "text-[var(--loss)]"
        : read.tone === "warning"
          ? "text-[var(--warning)]"
          : "text-[var(--neutral-data)]";
  return <span className={`text-sm font-medium ${toneClass}`}>{text}</span>;
}
