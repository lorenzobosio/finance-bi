// scripts/insight-snapshot.ts
//
// The PII-safe marts+scorecard SNAPSHOT READER (AI-04 firewall) — step 1 of the gen-insight command.
// The contract, in one breath:
//
//   open a postgres-driver connection (DATABASE_URL) -> SELECT ONLY from the household-aggregate
//   marts (v_home_kpis, v_pnl_monthly, v_costcenter_bva, v_category_breakdown, v_bucket_spend) plus
//   the household launch_date row -> compute the five scorecard metrics via the EXISTING pure helpers
//   (savingsRate / monthsOfReserve / computeStreak / assembleScorecard) + the deterministic
//   detectAnomalies flags -> call buildInsightSnapshot -> print the bounded Pattern-2 JSON to stdout
//   -> release the connection in finally.
//
// AI-04: it NEVER reads the raw row-grain transactions table (or any row-grain table). The marts are pre-aggregated
// household totals — no counterparty, no IBAN, no description, no booking_date crosses the wall. The
// single object the model ever sees is `buildInsightSnapshot`'s output.
//
// DB READS use the `postgres` driver via DATABASE_URL — the project's Node-side pattern (mirrors
// scripts/ingest.ts / scripts/seed-demo.ts). The direct connection role bypasses RLS to read all
// marts; it deliberately avoids the supabase-js server client (its `import "server-only"` throws
// outside an RSC build) and NEVER the privileged Supabase key (FND-03 write/read-plane discipline).
//
// SERVER-PLANE ONLY (FND-03): never imported into the Next app/client bundle. Logs NOTHING but the
// bounded JSON — never the connection string, never a raw € context beyond the bounded snapshot.

import { currentPeriodKey, previousPeriodKey } from "@/lib/period";
import { monthsOfReserve } from "@/lib/db/marts";
import { savingsRate } from "@/lib/goal/level";
import { computeStreak } from "@/lib/goal/streak";
import { assembleScorecard, type ScorecardInputs } from "@/lib/health/scorecard";
import { detectAnomalies, type BvaRow, type CategoryRow } from "@/lib/health/anomaly";
import { DEFAULT_BANDS } from "@/lib/health/thresholds";
import {
  buildInsightSnapshot,
  type InsightSnapshot,
  type SnapshotPnlRow,
} from "@/lib/health/snapshot";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === "") {
    throw new Error(
      `Missing required env var ${name}. Load .env.local first: \`set -a; . ./.env.local; set +a\``,
    );
  }
  return v;
}

const num = (v: unknown): number => (v == null ? 0 : Number(v));
const numOrNull = (v: unknown): number | null => (v == null ? null : Number(v));

/** Read the real (is_demo=false) household aggregates and build the bounded PII-safe snapshot. */
export async function readInsightSnapshot(now: Date = new Date()): Promise<InsightSnapshot> {
  const postgres = (await import("postgres")).default;
  const sql = postgres(requireEnv("DATABASE_URL"), { max: 1, onnotice: () => {} });

  try {
    // --- The launch gate + a demo/real partition filter (real household = is_demo=false). ---
    const [householdRow] = await sql`
      select launch_date from public.household where is_demo = false limit 1`;
    const launchDate = (householdRow?.launch_date as string | null) ?? null;

    // --- v_pnl_monthly: the monthly P&L spine (drives MoM, streak, reserve, goal cost basis). ---
    const pnlRows = await sql`
      select period_key, revenue, costs, investimento, sublet_net, result
      from public.v_pnl_monthly order by period_key asc`;

    // Pick the current period = the latest P&L month present (else the calendar current month).
    const periods = pnlRows.map((r) => Number(r.period_key));
    const currentPk = periods.length > 0 ? Math.max(...periods) : currentPeriodKey(now);
    const previousPk = previousPeriodKey(currentPk);

    const pnlByPeriod = new Map<number, SnapshotPnlRow>();
    for (const r of pnlRows) {
      pnlByPeriod.set(Number(r.period_key), {
        revenue: num(r.revenue),
        costs: num(r.costs),
        investimento: num(r.investimento),
        subletNet: num(r.sublet_net),
        result: num(r.result),
      });
    }
    const currentPnl = pnlByPeriod.get(currentPk) ?? {
      revenue: 0,
      costs: 0,
      investimento: 0,
      subletNet: 0,
      result: 0,
    };
    const previousPnl = pnlByPeriod.get(previousPk) ?? null;

    // --- v_home_kpis: the 4 headline KPIs + net worth (for months-of-reserve). ---
    const [kpiRow] = await sql`
      select revenue, costs, investimento, result, margin, net_worth
      from public.v_home_kpis where period_key = ${currentPk} limit 1`;
    const kpis = {
      revenue: num(kpiRow?.revenue),
      costs: num(kpiRow?.costs),
      investimento: num(kpiRow?.investimento),
      result: num(kpiRow?.result),
      margin: numOrNull(kpiRow?.margin),
    };
    const netWorth = num(kpiRow?.net_worth);

    // --- v_costcenter_bva: budget-vs-actual for the current period (the anomaly + budget inputs). ---
    const bvaRowsRaw = await sql`
      select cost_center, budget, actual
      from public.v_costcenter_bva where period_key = ${currentPk}`;
    const bvaRows: BvaRow[] = bvaRowsRaw.map((r) => ({
      costCenter: r.cost_center as string,
      budget: num(r.budget),
      actual: num(r.actual),
    }));

    // --- v_category_breakdown: the GATED MoM/spike branch input (unreachable < 2 months). ---
    const catRowsRaw = await sql`
      select bucket_label, costs
      from public.v_category_breakdown where period_key = ${currentPk} and grain = 'category'`;
    const categoryRows: CategoryRow[] = catRowsRaw.map((r) => ({
      bucketLabel: r.bucket_label as string,
      costs: num(r.costs),
    }));

    // --- Compose the five ALREADY-COMPUTED scorecard metrics via the pure helpers (HEALTH-02). ---
    // Trailing costs = every non-empty P&L month's costs (months-of-reserve denominator).
    const trailingMonthlyCosts = pnlRows.map((r) => num(r.costs)).filter((c) => c > 0);
    const monthsWithData = trailingMonthlyCosts.length;

    // The €4k streak walks a Map<periodKey, totalInvestimento> over the P&L spine.
    const invByPeriod = new Map<number, number>(
      pnlRows.map((r) => [Number(r.period_key), num(r.investimento)]),
    );
    const streak = computeStreak(invByPeriod, now, launchDate);

    // Max over-budget fraction this period (0 when all within budget) — the budget-adherence input.
    const budgetOverspendPct = bvaRows.reduce((worst, r) => {
      if (r.budget <= 0) return worst;
      const over = (r.actual - r.budget) / r.budget;
      return over > worst ? over : worst;
    }, 0);

    // Investment growth = MoM Δ of the investimento cost-basis contributions momentum (D-08).
    const investmentGrowth = currentPnl.investimento - (previousPnl?.investimento ?? 0);

    const scorecardInputs: ScorecardInputs = {
      savingsRate: savingsRate(currentPnl.investimento, currentPnl.revenue),
      monthsOfReserve: monthsOfReserve(netWorth, trailingMonthlyCosts),
      budgetOverspendPct,
      investmentGrowth,
      streak,
    };
    const scorecard = assembleScorecard(scorecardInputs, DEFAULT_BANDS);

    // Deterministic overspend flags — the model only ranks/phrases these (D-10).
    const anomalies = detectAnomalies(bvaRows, categoryRows, now, monthsWithData);

    // The €100k-progress cost basis = Σ investimento legs (the Wealth cost basis, cost-basis grain).
    const wealthCostBasis = pnlRows.reduce((acc, r) => acc + num(r.investimento), 0);

    return buildInsightSnapshot({
      period: { current: currentPk, previous: previousPnl ? previousPk : null, launchDate },
      kpis,
      pnl: { current: currentPnl, previous: previousPnl },
      goal: {
        wealthCostBasis,
        pctTo100k: wealthCostBasis / 100000,
        growthMoM: investmentGrowth,
      },
      scorecard,
      anomalies,
    });
  } finally {
    await sql.end({ timeout: 5 });
  }
}

// Only read when executed directly (`pnpm tsx scripts/insight-snapshot.ts`). When IMPORTED, do not
// auto-run. CJS `require.main === module` is the portable direct-run check (same convention as
// scripts/ingest.ts / scripts/seed-demo.ts).
const invokedDirectly = typeof require !== "undefined" && require.main === module;

if (invokedDirectly) {
  readInsightSnapshot()
    .then((snapshot) => {
      // The bounded PII-safe JSON is the ONLY thing printed — the model's single input (AI-04).
      process.stdout.write(JSON.stringify(snapshot) + "\n");
      process.exit(0);
    })
    .catch((err) => {
      // Never log the connection string / any raw € context — only the error class (V7).
      console.error(`[insight-snapshot] fatal: ${err instanceof Error ? err.name : "UnknownError"}`);
      process.exit(1);
    });
}
