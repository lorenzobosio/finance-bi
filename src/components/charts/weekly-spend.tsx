"use client";

// WeeklySpend — VIZ-02: a Recharts-3 current-vs-previous-week spending comparison. A grouped bar per
// weekday (Mon→Sun) with two series — "This week" and "Last week". A client island: the page folds
// the last-14-days cost transactions server-side (under RLS, demo-partitioned) and passes the shaped
// points in; this component never touches the DB.
//
// Recharts-3 paste rules (CLAUDE.md, locked): both series use the NEUTRAL `--chart-1`/`--chart-3`
// ramp — spend is NOT loss, so NEVER `--loss`/red (UI-SPEC §Charting / VIZ-02); colors as
// `var(--chart-N)` (never the wrapped-hsl form); `ChartContainer` carries an explicit height;
// `accessibilityLayer` is on; the entrance animation is gated by usePrefersReducedMotion; tooltips
// format through formatEUR. Color is never the only signal: a paired <ChartSummaryTable> is the a11y
// truth (the SVG is aria-hidden).

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { ChartSummaryTable } from "@/components/charts/chart-summary-table";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { formatEUR } from "@/lib/format";

/** One weekday's current-vs-previous spend (positive EUR magnitudes). */
export interface WeeklyPoint {
  /** Short weekday label (e.g. "Mon"). */
  day: string;
  /** Spend in the current 7-day window. */
  current: number;
  /** Spend in the previous 7-day window. */
  previous: number;
}

export interface WeeklySpendProps {
  data: WeeklyPoint[];
  /** Section heading (e.g. "This week vs last week"). */
  title?: string;
  className?: string;
}

// Neutral ramp only — this is spend, not a gain/loss signal (VIZ-02).
const chartConfig = {
  current: { label: "This week", color: "var(--chart-1)" },
  previous: { label: "Last week", color: "var(--chart-3)" },
} satisfies ChartConfig;

export function WeeklySpend({
  data,
  title = "This week vs last week",
  className,
}: WeeklySpendProps) {
  const prefersReduced = usePrefersReducedMotion();

  const hasSpend = data.some((d) => d.current > 0 || d.previous > 0);

  const summaryRows = data.map((d) => ({
    label: d.day,
    valueLabel: `${formatEUR(d.current, 0)} vs ${formatEUR(d.previous, 0)}`,
  }));

  return (
    <section className={className} aria-labelledby="weekly-spend-heading">
      <header className="mb-4">
        <h2 id="weekly-spend-heading" className="text-sm font-semibold text-muted-foreground">
          {title}
        </h2>
      </header>

      {!hasSpend ? (
        <p className="py-8 text-center text-sm text-[var(--neutral-data)]">
          {formatEUR(0)} spent in the last two weeks.
        </p>
      ) : (
        <>
          <ChartContainer config={chartConfig} aria-hidden="true" className="h-[240px] w-full">
            <BarChart
              accessibilityLayer
              data={data}
              margin={{ top: 8, right: 8, bottom: 8, left: 8 }}
            >
              <CartesianGrid horizontal vertical={false} stroke="var(--border)" />
              <XAxis
                dataKey="day"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
              />
              <YAxis
                tickFormatter={(v) => formatEUR(Number(v), 0)}
                tickLine={false}
                axisLine={false}
                width={64}
                tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
              />
              <ChartTooltip
                cursor={{ fill: "var(--muted)" }}
                content={
                  <ChartTooltipContent
                    formatter={(value, name) => (
                      <span className="flex w-full items-center justify-between gap-3">
                        <span className="text-muted-foreground">
                          {name === "current" ? "This week" : "Last week"}
                        </span>
                        <span className="font-mono font-medium tabular-nums text-foreground">
                          {formatEUR(Number(value), 0)}
                        </span>
                      </span>
                    )}
                  />
                }
              />
              <Bar
                dataKey="previous"
                fill="var(--chart-3)"
                radius={[3, 3, 0, 0]}
                isAnimationActive={!prefersReduced}
              />
              <Bar
                dataKey="current"
                fill="var(--chart-1)"
                radius={[3, 3, 0, 0]}
                isAnimationActive={!prefersReduced}
              />
            </BarChart>
          </ChartContainer>

          {/* Data-table alternative — the a11y truth (the chart SVG above is aria-hidden). */}
          <details className="mt-4">
            <summary className="cursor-pointer text-sm text-muted-foreground">
              Show data table
            </summary>
            <div className="mt-2">
              <ChartSummaryTable
                caption="Spending this week vs last week, by weekday"
                labelHeader="Day"
                valueHeader="This week vs last week"
                rows={summaryRows}
              />
            </div>
          </details>
        </>
      )}
    </section>
  );
}
