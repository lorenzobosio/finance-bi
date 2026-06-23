"use client";

// NetWorthTrend — the Home Band C net-worth / balance trend (D3-06, DSN-05). A shadcn
// ChartAreaInteractive-style area chart reading EXISTING `v_balance_trend` data (passed in as
// typed points from the page's RLS read — this island never touches the DB). Full-width, with a
// "Net worth" header + a 3M/6M/12M range ToggleGroup, the neutral `--chart-1` series with one
// gain/loss accent on the net line, the tooltip routed through formatEUR, accessibilityLayer, a
// fixed ChartContainer height, a reduced-motion-gated grow-in, and a paired <ChartSummaryTable>.
//
// Recharts-3 rules (CLAUDE.md, locked): colors as `var(--chart-1)` — never the wrapped-hsl form;
// ChartContainer carries a height so ResponsiveContainer measures on first render;
// `accessibilityLayer` on the chart. All money via formatEUR (no new Intl).

import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { ChartSummaryTable } from "@/components/charts/chart-summary-table";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { formatEUR } from "@/lib/format";

export interface NetWorthPoint {
  /** ISO date (YYYY-MM-DD) for the X axis. */
  date: string;
  /** Net-worth value in EUR. */
  netWorth: number;
}

export interface NetWorthTrendProps {
  /** The full balance-trend series (oldest → newest), from v_balance_trend under RLS. */
  data: NetWorthPoint[];
  className?: string;
}

type Range = "3M" | "6M" | "12M";
const RANGE_MONTHS: Record<Range, number> = { "3M": 3, "6M": 6, "12M": 12 };

const chartConfig = {
  netWorth: { label: "Net worth", color: "var(--chart-1)" },
} satisfies ChartConfig;

/** Format an ISO date to a short de-DE-numbers / English-month label (e.g. "Jun 2026"). */
function shortLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}

export function NetWorthTrend({ data, className }: NetWorthTrendProps) {
  const [range, setRange] = useState<Range>("12M");
  const prefersReduced = usePrefersReducedMotion();

  // The last N months of points (an approximate month → ~30-point window over the daily series).
  const windowed = useMemo(() => {
    const months = RANGE_MONTHS[range];
    if (data.length === 0) return [];
    const last = data[data.length - 1];
    const lastDate = new Date(last.date);
    const cutoff = new Date(lastDate);
    cutoff.setMonth(cutoff.getMonth() - months);
    return data.filter((p) => new Date(p.date) >= cutoff);
  }, [data, range]);

  // The net line accent: gain when the window's net worth rose end-to-end, else loss.
  const accent = useMemo(() => {
    if (windowed.length < 2) return "var(--chart-1)";
    const delta = windowed[windowed.length - 1].netWorth - windowed[0].netWorth;
    return delta >= 0 ? "var(--gain-fill)" : "var(--loss-fill)";
  }, [windowed]);

  const summaryRows = windowed.map((p) => ({
    label: shortLabel(p.date),
    valueLabel: formatEUR(p.netWorth, 0),
  }));

  return (
    <section
      className={className}
      aria-labelledby="net-worth-heading"
    >
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 id="net-worth-heading" className="text-xl font-semibold">
          Net worth
        </h2>
        <ToggleGroup
          type="single"
          value={range}
          onValueChange={(v) => v && setRange(v as Range)}
          variant="outline"
          size="sm"
          aria-label="Trend range"
        >
          <ToggleGroupItem value="3M" aria-label="Last 3 months">
            3M
          </ToggleGroupItem>
          <ToggleGroupItem value="6M" aria-label="Last 6 months">
            6M
          </ToggleGroupItem>
          <ToggleGroupItem value="12M" aria-label="Last 12 months">
            12M
          </ToggleGroupItem>
        </ToggleGroup>
      </header>

      {windowed.length < 2 ? (
        <p className="py-8 text-center text-sm text-[var(--neutral-data)]">
          Not enough history yet — the trend appears as more months are synced.
        </p>
      ) : (
        <>
          <ChartContainer
            config={chartConfig}
            aria-hidden="true"
            className="h-[280px] w-full"
          >
            <AreaChart
              accessibilityLayer
              data={windowed}
              margin={{ top: 8, right: 8, bottom: 8, left: 8 }}
            >
              <defs>
                <linearGradient id="netWorthFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={accent} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={accent} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid horizontal vertical={false} stroke="var(--border)" />
              <XAxis
                dataKey="date"
                tickFormatter={shortLabel}
                tickLine={false}
                axisLine={false}
                minTickGap={32}
                tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
              />
              <YAxis
                tickFormatter={(v) => formatEUR(Number(v), 0)}
                tickLine={false}
                axisLine={false}
                width={72}
                tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
              />
              <ChartTooltip
                cursor={{ stroke: "var(--border)" }}
                content={
                  <ChartTooltipContent
                    labelFormatter={(label) => shortLabel(String(label))}
                    formatter={(value) => (
                      <span className="font-mono font-medium tabular-nums text-foreground">
                        {formatEUR(Number(value), 0)}
                      </span>
                    )}
                  />
                }
              />
              <Area
                dataKey="netWorth"
                type="monotone"
                stroke={accent}
                strokeWidth={2}
                fill="url(#netWorthFill)"
                isAnimationActive={!prefersReduced}
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
                caption={`Net worth over the last ${RANGE_MONTHS[range]} months`}
                rows={summaryRows}
              />
            </div>
          </details>
        </>
      )}
    </section>
  );
}
