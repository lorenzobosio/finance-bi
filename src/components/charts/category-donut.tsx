"use client";

// CategoryDonut — VIZ-01: a Recharts-3 category-breakdown DONUT with a month↔year period toggle.
// A client island: the page shapes the two period slices server-side (under RLS, demo-partitioned)
// and passes them in — this component never touches the DB. Used on Spending and reused VERBATIM on
// the Brazil/Adventures bucket pages (each scoped to that bucket's tagged spend).
//
// Recharts-3 paste rules (CLAUDE.md, locked): slice colors are `var(--chart-1)`…`var(--chart-5)` —
// NEVER the wrapped-hsl form; `ChartContainer` carries an explicit height so ResponsiveContainer
// measures on first render; `accessibilityLayer` is on; the entrance animation is gated by
// usePrefersReducedMotion; the tooltip formats through formatEUR (no default-locale leakage). Spend
// is NEUTRAL — the greyscale `--chart-1..5` ramp, never `--loss`/red. Color is never the only signal:
// a legend + a paired <ChartSummaryTable> carry the a11y truth (the SVG is aria-hidden).

import { useMemo, useState } from "react";
import { Cell, Pie, PieChart } from "recharts";

import { ChartSummaryTable } from "@/components/charts/chart-summary-table";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { formatEUR, formatPct } from "@/lib/format";

/** One category slice of the donut (already summed + demo-partitioned server-side). */
export interface DonutSlice {
  /** The category label (e.g. "Groceries", "Uncategorized"). */
  label: string;
  /** The positive spend magnitude in EUR. */
  value: number;
}

type Period = "month" | "year";

export interface CategoryDonutProps {
  /** The selected-month category slices. */
  month: DonutSlice[];
  /** The full-year category slices (same grain, aggregated across the year). */
  year: DonutSlice[];
  /** Card / section heading (e.g. "Spending by category"). */
  title?: string;
  /** Short caption for the month toggle (e.g. "Jun 2026"). */
  monthLabel?: string;
  /** Short caption for the year toggle (e.g. "2026"). */
  yearLabel?: string;
  className?: string;
}

// The neutral greyscale data ramp (theme-aware via the tokens; reverses light↔dark automatically).
// Slices cycle through it — spend carries NO gain/loss semantics (UI-SPEC §Charting).
const RAMP = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
] as const;

export function CategoryDonut({
  month,
  year,
  title = "Spending by category",
  monthLabel = "Month",
  yearLabel = "Year",
  className,
}: CategoryDonutProps) {
  const [period, setPeriod] = useState<Period>("month");
  const prefersReduced = usePrefersReducedMotion();

  const active = period === "month" ? month : year;

  // Biggest-first, drop empty slices; a stable color per slice from the neutral ramp.
  const slices = useMemo(
    () =>
      [...active]
        .filter((s) => s.value > 0)
        .sort((a, b) => b.value - a.value)
        .map((s, i) => ({ ...s, fill: RAMP[i % RAMP.length] })),
    [active],
  );

  const total = useMemo(() => slices.reduce((acc, s) => acc + s.value, 0), [slices]);

  // A ChartConfig keyed by slice label → the legend/label lookups resolve their color token.
  const chartConfig = useMemo(
    () =>
      Object.fromEntries(
        slices.map((s) => [s.label, { label: s.label, color: s.fill }]),
      ) satisfies ChartConfig,
    [slices],
  );

  const summaryRows = slices.map((s) => ({
    label: s.label,
    valueLabel: `${formatEUR(s.value, 0)} · ${
      total > 0 ? formatPct((s.value / total) * 100) : formatPct(0)
    }`,
  }));

  const periodCaption = period === "month" ? monthLabel : yearLabel;

  return (
    <section className={className} aria-labelledby="category-donut-heading">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 id="category-donut-heading" className="text-sm font-semibold text-muted-foreground">
          {title}
        </h2>
        <ToggleGroup
          type="single"
          value={period}
          onValueChange={(v) => v && setPeriod(v as Period)}
          variant="outline"
          size="sm"
          aria-label="Category period"
        >
          <ToggleGroupItem value="month" aria-label={`This month (${monthLabel})`}>
            Month
          </ToggleGroupItem>
          <ToggleGroupItem value="year" aria-label={`This year (${yearLabel})`}>
            Year
          </ToggleGroupItem>
        </ToggleGroup>
      </header>

      {slices.length === 0 ? (
        // Calm grey empty state — never blank (UI-SPEC §7).
        <p className="py-8 text-center text-sm text-[var(--neutral-data)]">
          {formatEUR(0)} of tagged spend in {periodCaption}.
        </p>
      ) : (
        <>
          <ChartContainer
            config={chartConfig}
            aria-hidden="true"
            className="mx-auto h-[260px] w-full max-w-[340px]"
          >
            <PieChart accessibilityLayer>
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    hideLabel
                    formatter={(value, name) => (
                      <span className="flex w-full items-center justify-between gap-3">
                        <span className="text-muted-foreground">{String(name)}</span>
                        <span className="font-mono font-medium tabular-nums text-foreground">
                          {formatEUR(Number(value), 0)}
                        </span>
                      </span>
                    )}
                  />
                }
              />
              <Pie
                data={slices}
                dataKey="value"
                nameKey="label"
                innerRadius={64}
                outerRadius={104}
                paddingAngle={1}
                strokeWidth={2}
                isAnimationActive={!prefersReduced}
              >
                {slices.map((s) => (
                  <Cell key={s.label} fill={s.fill} stroke="var(--background)" />
                ))}
              </Pie>
            </PieChart>
          </ChartContainer>

          {/* Legend — the visible name↔color mapping (color is never the only signal). */}
          <ul className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1.5 text-xs">
            {slices.map((s) => (
              <li key={s.label} className="flex items-center gap-1.5 text-muted-foreground">
                <span
                  aria-hidden="true"
                  className="size-2.5 shrink-0 rounded-[2px]"
                  style={{ backgroundColor: s.fill }}
                />
                {s.label}
              </li>
            ))}
          </ul>

          {/* Data-table alternative — the a11y truth (the chart SVG above is aria-hidden). */}
          <details className="mt-4">
            <summary className="cursor-pointer text-sm text-muted-foreground">
              Show data table
            </summary>
            <div className="mt-2">
              <ChartSummaryTable
                caption={`Spending by category, ${periodCaption}`}
                labelHeader="Category"
                valueHeader="Amount · share"
                rows={summaryRows}
              />
            </div>
          </details>
        </>
      )}
    </section>
  );
}
