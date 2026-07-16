import Link from "next/link";
import { TriangleAlert } from "lucide-react";

import { CategoryBar, type CategoryBarTone } from "@/components/charts/category-bar";
import { PnlWaterfall, type WaterfallStep } from "@/components/charts/pnl-waterfall";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AnomalyChip } from "@/components/anomaly-chip";
import { ProvisionalPill } from "@/components/status/provisional-pill";
import { costCenterDisplayName } from "@/lib/cost-center-display";
import { detectAnomalies } from "@/lib/health/anomaly";
import { formatEUR } from "@/lib/format";
import { currentPeriodKey, isProvisional } from "@/lib/period";
import { createClient } from "@/lib/supabase/server";
import { demoAwareNow, isDemoForReads } from "@/lib/demo/mode";

// Cost Centers + Sublocação (BI-02, BI-01, D2-06/07/08/12/14, CAT-06).
//
// "Did anyone blow budget, and what's the household P&L?" for the SELECTED month:
//   • Three household budgeted-vs-actual rows (Lorenzo / Fernanda / Shared) with the
//     not-set / under / ≥85% / over states — NEVER a fake €0 cap (D2-12).
//   • The Sublocação profit-center standalone P&L — the ONLY place the sublet GROSS legs
//     appear (D2-06/07/08); the household sees sublet only as the single net waterfall step.
//   • The P&L waterfall: Revenue → +Sublet net → −Investimento → −Costs → =Result.
//
// All reads go through the @supabase/ssr server client under the user JWT + RLS — NEVER the
// Drizzle/postgres client and NEVER service_role (T-02-16 / RESEARCH Pitfall 3).

// The three HOUSEHOLD cost centers (sublocacao is a separate profit center, shown apart).
const HOUSEHOLD_CENTERS = [
  { code: "lorenzo", name: "Lorenzo" },
  { code: "fernanda", name: "Fernanda" },
  { code: "compartilhado", name: "Shared" },
] as const;

const WARNING_THRESHOLD = 0.85;

/** Parse/clamp the raw ?period search param to a valid YYYYMM int (mirrors Home, T-02-12). */
function parsePeriod(raw: string | undefined, currentKey: number): number {
  if (!raw || !/^\d{6}$/.test(raw)) return currentKey;
  const key = Number(raw);
  const month = key % 100;
  if (month < 1 || month > 12) return currentKey;
  if (key > currentKey) return currentKey;
  return key;
}

/** numeric columns arrive from supabase-js as strings; parse to a finite number (0 fallback). */
function num(v: string | number | null | undefined): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export default async function CostCentersPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const supabase = await createClient();
  // Demo-mode partition selector (D4-12) resolved FIRST so the display clock is demo-anchored
  // (G1/D5-16, mirroring Home): in demo mode `now` moves to the demo's latest data month so the
  // current period + mid-month anomaly projection compute on the demo window; real mode is
  // byte-identical (demoAwareNow(false, …) is the identity).
  const demoFilter = await isDemoForReads();
  const now = demoAwareNow(demoFilter, new Date());
  const currentKey = currentPeriodKey(now);
  const { period: rawPeriod } = await searchParams;
  const period = parsePeriod(rawPeriod, currentKey);
  const provisional = isProvisional(period, now);

  // --- Reads (all under RLS via @supabase/ssr, partitioned by is_demo) -------------------
  // 1. Budget vs actual at cost-center grain (category_id null) for this period.
  const { data: bvaRows, error: bvaError } = await supabase
    .from("v_costcenter_bva")
    .select("cost_center, category_id, period_key, budget, actual")
    .eq("period_key", period)
    .eq("is_demo", demoFilter)
    .is("category_id", null);

  // 2. The standalone Sublocação profit-center P&L (gross legs live ONLY here).
  const { data: subletRow, error: subletError } = await supabase
    .from("v_sublet_pnl")
    .select("period_key, sublet_revenue, sublet_costs, sublet_net")
    .eq("period_key", period)
    .eq("is_demo", demoFilter)
    .maybeSingle();

  // 3. The household P&L for the waterfall.
  const { data: pnlRow, error: pnlError } = await supabase
    .from("v_pnl_monthly")
    .select("period_key, revenue, costs, investimento, sublet_net, result")
    .eq("period_key", period)
    .eq("is_demo", demoFilter)
    .maybeSingle();

  // 4. All populated periods (demo-partitioned) — the distinct-month count gates the anomaly
  //    detector's statistical-spike branch (D-11: <2 months ⇒ no spike, only budget-relative flags).
  const { data: allPeriods } = await supabase
    .from("v_pnl_monthly")
    .select("period_key")
    .eq("is_demo", demoFilter);

  if (bvaError || subletError || pnlError) {
    return (
      <p role="alert" className="text-sm text-[var(--loss)]">
        Couldn&apos;t load this view. The data sync may be in progress. Refresh in a moment;
        if it persists, check the connection on Config.
      </p>
    );
  }

  // --- Build the budget-vs-actual rows (not-set / under / ≥85% / over) --------------------
  const budgetRows = HOUSEHOLD_CENTERS.map((center) => {
    // Demo-mode display remap: the person LABEL becomes the anonymized persona (Alice/Bob);
    // the FK code/partition is unchanged (display-only — D4-08/26). Shared stays "Shared".
    const cc = { ...center, name: costCenterDisplayName(center.code, center.name, demoFilter) };
    const row = (bvaRows ?? []).find((r) => r.cost_center === cc.code);
    // D2-12: a missing budget ROW means "not set" — NEVER a synthesized €0 cap.
    const hasBudget = !!row && num(row.budget) > 0;
    const budget = num(row?.budget);
    const actual = num(row?.actual);
    const ratio = hasBudget ? actual / budget : 0;
    let tone: CategoryBarTone = "neutral";
    if (hasBudget) {
      if (actual > budget) tone = "loss";
      else if (ratio >= WARNING_THRESHOLD) tone = "warning";
      else tone = "gain";
    }
    return { ...cc, hasBudget, budget, actual, ratio, over: hasBudget && actual > budget, tone };
  });

  // --- Non-shame anomaly flags (AI-05, D-10/11/12) — the SAME pure detector Home + REM-02 use -----
  // Deterministic over-budget / on-pace flags from the demo-partitioned v_costcenter_bva rows; the
  // statistical-spike branch is history-gated by the distinct-month count. Display-only (D-13).
  const monthsWithData = new Set(
    (allPeriods ?? []).map((r) => Number(r.period_key)),
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
  const anomalyLabels = Object.fromEntries(
    HOUSEHOLD_CENTERS.map((c) => [
      c.code,
      costCenterDisplayName(c.code, c.name, demoFilter),
    ]),
  );

  // --- Sublocação standalone P&L (the ONLY place gross legs appear) -----------------------
  const subRevenue = num(subletRow?.sublet_revenue);
  const subCosts = num(subletRow?.sublet_costs);
  const subNet = num(subletRow?.sublet_net);

  // --- The household waterfall steps (UI-SPEC §2 step order) ------------------------------
  const revenue = num(pnlRow?.revenue);
  const costs = num(pnlRow?.costs);
  const investimento = num(pnlRow?.investimento);
  const subletNet = num(pnlRow?.sublet_net);
  const result = num(pnlRow?.result);
  const hasPnl = !!pnlRow;

  const steps: WaterfallStep[] = [
    { name: "Revenue", delta: revenue, valueLabel: formatEUR(revenue) },
    { name: "+ Sublet net", delta: subletNet, valueLabel: formatEUR(subletNet) },
    { name: "− Investimento", delta: -investimento, valueLabel: formatEUR(-investimento) },
    { name: "− Costs", delta: -costs, valueLabel: formatEUR(-costs) },
    { name: "Result", delta: result, valueLabel: formatEUR(result), isResult: true },
  ];

  return (
    <div className="@container/main space-y-6">
      {/* Page header (h1 left; the shared month selector lives in the shell top bar). */}
      <header className="flex items-center gap-3">
        <h1 className="text-xl font-semibold">Cost Centers</h1>
        {provisional && <ProvisionalPill />}
      </header>

      {/* --- Budgeted vs actual: the 3 household cost centers as SectionCards (BI-02, D2-12) --- */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-muted-foreground">Budget vs actual</h2>
          {/* Non-shame overspend chip — the top 1–2 deterministic flags (D-11/12, DISPLAY ONLY). */}
          <AnomalyChip
            flags={anomalyFlags}
            monthsWithData={monthsWithData}
            labels={anomalyLabels}
            dayOfMonth={now.getDate()}
          />
        </div>
        <div className="grid grid-cols-1 gap-4 @xl/main:grid-cols-3">
          {budgetRows.map((r) => (
            <Card key={r.code} size="sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-1.5">
                  {r.over && (
                    <TriangleAlert
                      aria-hidden="true"
                      className="size-4 shrink-0 text-[var(--loss)]"
                    />
                  )}
                  {r.name}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {r.hasBudget ? (
                  <>
                    <p className="font-mono text-sm tabular-nums">
                      <span className={r.over ? "text-[var(--loss)]" : undefined}>
                        {formatEUR(r.actual)} of {formatEUR(r.budget)}
                      </span>
                    </p>
                    <CategoryBar
                      value={r.ratio * 100}
                      tone={r.tone}
                      label={`${r.name} budget vs actual`}
                      valueText={`${formatEUR(r.actual)} of ${formatEUR(r.budget)}`}
                    />
                    {r.over && (
                      <p className="text-xs text-[var(--loss)]">
                        Over by {formatEUR(r.actual - r.budget)}
                      </p>
                    )}
                  </>
                ) : (
                  // D2-12: distinct "Budget not set" state — grey, never a fake cap.
                  <p className="flex flex-wrap items-center gap-2 text-sm text-[var(--neutral-data)]">
                    Budget not set
                    <Link href="/config" className="underline underline-offset-2">
                      Set budget
                    </Link>
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* --- Sublet profit center — the ONLY place gross legs appear (D2-06/07/08) --- */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-muted-foreground">
            Sublet — profit center
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-baseline justify-between gap-4 text-sm">
            <span>Rent received</span>
            <span className="font-mono tabular-nums text-[var(--gain)]">
              {formatEUR(subRevenue)}
            </span>
          </div>
          <div className="flex items-baseline justify-between gap-4 text-sm">
            <span>Rent / utilities paid</span>
            <span className="font-mono tabular-nums text-[var(--loss)]">
              {formatEUR(-subCosts)}
            </span>
          </div>
          <div className="flex items-baseline justify-between gap-4 border-t border-border pt-2 text-sm font-semibold">
            <span>Net</span>
            <span
              className={
                subNet >= 0
                  ? "font-mono tabular-nums text-[var(--gain)]"
                  : "font-mono tabular-nums text-[var(--loss)]"
              }
            >
              {formatEUR(subNet)}
            </span>
          </div>
          <p className="pt-1 text-xs text-muted-foreground">
            The household P&amp;L sees this as a single net line — its gross rent legs never enter
            the household Costs bucket.
          </p>
        </CardContent>
      </Card>

      {/* --- The household P&L waterfall, Card-wrapped (BI-01, UI-SPEC §2) --- */}
      <Card>
        <CardHeader className="flex flex-wrap items-center gap-3 [&]:grid-cols-none [&]:flex">
          <CardTitle className="text-sm font-semibold text-muted-foreground">
            Household P&amp;L
          </CardTitle>
          {/* CAT-06: investimento / transferência are excluded from the Costs bucket. */}
          <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs text-[var(--neutral-data)]">
            Investimento &amp; transferência excluded from costs
          </span>
        </CardHeader>
        <CardContent>
          {hasPnl ? (
            <PnlWaterfall
              steps={steps}
              ariaLabel="Household P&L waterfall for the selected month"
            />
          ) : (
            <p className="font-mono text-sm tabular-nums text-[var(--neutral-data)]">
              {formatEUR(0)} this month — the P&amp;L appears once data lands.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
