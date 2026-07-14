"use client";

// CashflowProjection — the FLOW-04 cash-flow projection chart (UI-SPEC §4, D-10). A sibling of
// `net-worth-trend.tsx`: the same Recharts-3 ChartContainer primitive, a fixed `h-[280px]`,
// `accessibilityLayer`, the tooltip routed through formatEUR, a reduced-motion-gated entrance, and a
// paired <ChartSummaryTable> as the a11y truth (the SVG is aria-hidden).
//
// Phase-9 additions (D-10): the ACTUAL segment is solid `--chart-1`; the PROJECTED segment is
// visually distinct — dashed (`strokeDasharray`) with a reduced-opacity fill + a legend label
// "Expected". A `ReferenceLine` sits at 0 and, when the expected line dips below zero, the dip renders
// inside a calm `--warning` `ReferenceArea` — NEVER red/`--loss`, never hidden (the whole honest
// truth; the safe-to-spend KPI floors for calm, the chart tells the truth). An always-visible caveat
// states the projection is a deterministic estimate, not a prediction of variable spend.
//
// Recharts-3 rules (CLAUDE.md, locked): colors as bare `var(--chart-1)` — never the wrapped-hsl form;
// ChartContainer carries a height so ResponsiveContainer measures on first render; `accessibilityLayer`
// on the chart. All money via formatEUR (no new Intl).

import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceArea,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";

import { ChartSummaryTable } from "@/components/charts/chart-summary-table";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { formatEUR } from "@/lib/format";

/** A realized (actual) monthly balance point — rendered as the solid segment. */
export interface CashflowActualPoint {
  /** YYYYMM period key. */
  periodKey: number;
  /** The realized end-of-month balance in EUR. */
  balance: number;
}

/** A projected (expected) monthly balance point — rendered as the dashed "Expected" segment. */
export interface CashflowProjectedPoint {
  /** YYYYMM period key. */
  periodKey: number;
  /** The expected end-of-month balance in EUR (engine `close`). */
  balance: number;
}

export interface CashflowProjectionProps {
  /** The realized monthly balances (oldest → newest); the solid actual segment. */
  actuals: CashflowActualPoint[];
  /** The forward-looking expected balances (from projectCashflow); the dashed segment. */
  projected: CashflowProjectedPoint[];
  className?: string;
}

const CAVEAT =
  "Expected position — a deterministic estimate from your recurring bills & budgets. Not a prediction of variable spending.";

const chartConfig = {
  actual: { label: "Actual", color: "var(--chart-1)" },
  expected: { label: "Expected", color: "var(--chart-1)" },
} satisfies ChartConfig;

interface Row {
  periodKey: number;
  actual: number | null;
  expected: number | null;
}

/** Format a YYYYMM period key to a short "Jul 2026" label. */
function periodLabel(periodKey: number): string {
  const year = Math.floor(periodKey / 100);
  const month = periodKey % 100; // 1-based
  if (!Number.isFinite(year) || month < 1 || month > 12) return String(periodKey);
  const d = new Date(Date.UTC(year, month - 1, 1));
  return d.toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
}

export function CashflowProjection({ actuals, projected, className }: CashflowProjectionProps) {
  const prefersReduced = usePrefersReducedMotion();

  // Merge actuals + projected into a single monthly series. The LAST actual row also carries the
  // `expected` value so the dashed line joins the solid segment seamlessly (the standard Recharts
  // two-series solid/dashed split — a shared boundary point).
  const rows = useMemo<Row[]>(() => {
    const actualRows: Row[] = actuals.map((p, i) => ({
      periodKey: p.periodKey,
      actual: p.balance,
      // The join point: the newest actual seeds the expected series so the dashed line connects.
      expected: i === actuals.length - 1 ? p.balance : null,
    }));
    const projectedRows: Row[] = projected.map((p) => ({
      periodKey: p.periodKey,
      actual: null,
      expected: p.balance,
    }));
    return [...actualRows, ...projectedRows];
  }, [actuals, projected]);

  // The honest below-zero zone: the minimum across every plotted value (actual + expected).
  const minValue = useMemo(() => {
    const vals = rows.flatMap((r) => [r.actual, r.expected].filter((v): v is number => v !== null));
    return vals.length ? Math.min(...vals) : 0;
  }, [rows]);

  const summaryRows = rows.map((r) => {
    const value = r.expected ?? r.actual ?? 0;
    const projectedRow = r.actual === null;
    return {
      label: `${periodLabel(r.periodKey)}${projectedRow ? " (expected)" : ""}`,
      valueLabel: formatEUR(value, 0),
    };
  });

  const enoughData = rows.length >= 2 && projected.length >= 1;

  return (
    <section className={className} aria-labelledby="cashflow-projection-heading">
      <header className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <h2 id="cashflow-projection-heading" className="text-xl font-semibold">
          Cash-flow projection
        </h2>
      </header>
      {/* The always-visible honesty caveat (UI-SPEC §4). */}
      <p className="mb-4 max-w-prose text-sm text-muted-foreground">{CAVEAT}</p>

      {!enoughData ? (
        <p className="py-8 text-center text-sm text-[var(--neutral-data)]">
          Not enough history yet — the projection appears as more months sync.
        </p>
      ) : (
        <>
          <ChartContainer config={chartConfig} aria-hidden="true" className="h-[280px] w-full">
            <AreaChart
              accessibilityLayer
              data={rows}
              margin={{ top: 8, right: 8, bottom: 8, left: 8 }}
            >
              <defs>
                <linearGradient id="cashflowActualFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="cashflowExpectedFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.1} />
                  <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.01} />
                </linearGradient>
              </defs>
              <CartesianGrid horizontal vertical={false} stroke="var(--border)" />
              <XAxis
                dataKey="periodKey"
                tickFormatter={(v) => periodLabel(Number(v))}
                tickLine={false}
                axisLine={false}
                minTickGap={24}
                tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
              />
              <YAxis
                tickFormatter={(v) => formatEUR(Number(v), 0)}
                tickLine={false}
                axisLine={false}
                width={72}
                tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
              />
              {/* The honest below-zero warning zone (calm --warning, never red/loss). */}
              {minValue < 0 ? (
                <ReferenceArea
                  y1={0}
                  y2={minValue}
                  fill="var(--warning)"
                  fillOpacity={0.12}
                  stroke="none"
                />
              ) : null}
              {/* The 0 reference line — always present so a dip reads honestly against it. */}
              <ReferenceLine y={0} stroke="var(--warning)" strokeDasharray="2 2" />
              <ChartTooltip
                cursor={{ stroke: "var(--border)" }}
                content={
                  <ChartTooltipContent
                    labelFormatter={(label) => periodLabel(Number(label))}
                    formatter={(value) => (
                      <span className="font-mono font-medium tabular-nums text-foreground">
                        {formatEUR(Number(value), 0)}
                      </span>
                    )}
                  />
                }
              />
              <ChartLegend content={<ChartLegendContent />} />
              {/* Actual: solid. */}
              <Area
                dataKey="actual"
                name="Actual"
                type="monotone"
                stroke="var(--chart-1)"
                strokeWidth={2}
                fill="url(#cashflowActualFill)"
                isAnimationActive={!prefersReduced}
                connectNulls={false}
                dot={false}
              />
              {/* Expected: visually distinct — dashed + reduced-opacity fill. */}
              <Area
                dataKey="expected"
                name="Expected"
                type="monotone"
                stroke="var(--chart-1)"
                strokeWidth={2}
                strokeDasharray="6 4"
                strokeOpacity={0.9}
                fill="url(#cashflowExpectedFill)"
                isAnimationActive={!prefersReduced}
                connectNulls
                dot={false}
              />
            </AreaChart>
          </ChartContainer>

          {/* Data-table alternative — the a11y truth (the chart SVG above is aria-hidden). */}
          <details className="mt-4">
            <summary className="cursor-pointer text-sm text-muted-foreground">
              Show data table
            </summary>
            <div className="mt-2">
              <ChartSummaryTable
                caption="Actual and expected cash-flow position by month"
                rows={summaryRows}
              />
            </div>
          </details>
        </>
      )}
    </section>
  );
}
