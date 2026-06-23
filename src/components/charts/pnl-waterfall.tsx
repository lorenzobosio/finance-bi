"use client";

// PnlWaterfall — the bespoke P&L waterfall (UI-SPEC §2, BI-01, RESEARCH Pattern 8 / A2).
//
// Recharts has NO native waterfall, so this is a stacked `BarChart` with two series:
//   • a transparent "base" series (the running offset under each floating step), and
//   • a visible "delta" series (the step magnitude).
// Steps in order: Revenue → +Sublet net → −Investimento → −Costs → =Result. Only the final
// RESULT bar is colored (--gain if ≥0 else --loss, via <Cell>); every intermediate step
// stays neutral --chart-1 (UI-SPEC §Charting "only the Result bar is colored").
//
// Recharts-3 paste rules (UI-SPEC, locked): colors as `var(--chart-1)` NOT `hsl(var(--chart-1))`;
// ChartContainer carries a min-h so ResponsiveContainer measures on first render.
//
// a11y (UI-SPEC §Accessibility): the SVG is `aria-hidden`; a real DATA TABLE carries the same
// numbers + a summary aria-label, so a screen-reader user never depends on the chart. Money
// is pre-formatted by the caller via formatEUR (this component never calls Intl).

import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from "recharts";

import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import { cx } from "@/lib/utils";

export interface WaterfallStep {
  /** Step name (e.g. "Revenue", "+ Sublet net", "− Investimento", "− Costs", "Result"). */
  name: string;
  /** The signed magnitude of the step (the running total moves by this much). */
  delta: number;
  /** Pre-formatted value label (caller formats via formatEUR — this block never calls Intl). */
  valueLabel: string;
  /** True only for the final Result bar — the ONLY colored bar. */
  isResult?: boolean;
}

export interface PnlWaterfallProps {
  steps: WaterfallStep[];
  /** Accessible summary for the whole chart (e.g. "P&L waterfall for Jun 2026"). */
  ariaLabel?: string;
  className?: string;
}

const chartConfig: ChartConfig = {
  delta: { label: "Step" },
};

export function PnlWaterfall({ steps, ariaLabel, className }: PnlWaterfallProps) {
  // Build the floating bars: for each non-total step the bar floats from the prior running
  // total to the new one; the Result bar sits on the axis (base 0) and shows the final total.
  let running = 0;
  const data = steps.map((s) => {
    if (s.isResult) {
      // Result floats from 0 → the final total magnitude (the running sum at this point).
      const total = running;
      return {
        name: s.name,
        base: Math.min(0, total),
        delta: Math.abs(total),
        signedTotal: total,
        isResult: true,
      };
    }
    const start = running;
    running += s.delta;
    const lo = Math.min(start, running);
    const hi = Math.max(start, running);
    return {
      name: s.name,
      base: lo,
      delta: hi - lo,
      signedTotal: running,
      isResult: false,
    };
  });

  return (
    <div className={cx("space-y-4", className)}>
      <ChartContainer
        config={chartConfig}
        aria-hidden="true"
        className="min-h-[320px] w-full"
      >
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
          <CartesianGrid horizontal vertical={false} stroke="var(--border)" />
          <XAxis
            dataKey="name"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={48}
            tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
          />
          {/* Transparent running-offset base — the float under each step. */}
          <Bar dataKey="base" stackId="w" fill="transparent" isAnimationActive={false} />
          {/* The visible step magnitude — only the Result bar is colored gain/loss. */}
          <Bar dataKey="delta" stackId="w" radius={2} isAnimationActive={false}>
            {data.map((d, i) => (
              <Cell
                key={i}
                fill={
                  d.isResult
                    ? d.signedTotal >= 0
                      ? "var(--gain-fill)"
                      : "var(--loss-fill)"
                    : "var(--chart-1)"
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ChartContainer>

      {/* Data-table alternative — the a11y truth (a screen reader never reads the SVG). */}
      <table className="w-full text-sm" aria-label={ariaLabel ?? "P&L waterfall"}>
        <caption className="sr-only">{ariaLabel ?? "P&L waterfall steps"}</caption>
        <thead>
          <tr className="text-left text-muted-foreground">
            <th scope="col" className="py-1 font-medium">
              Step
            </th>
            <th scope="col" className="py-1 text-right font-medium">
              Amount
            </th>
          </tr>
        </thead>
        <tbody>
          {steps.map((s, i) => (
            <tr key={`${s.name}-${i}`} className="border-t border-border">
              <th
                scope="row"
                className={cx(
                  "py-1.5 font-normal",
                  s.isResult && "font-semibold",
                )}
              >
                {s.name}
              </th>
              <td
                className={cx(
                  "py-1.5 text-right font-mono tabular-nums",
                  s.isResult &&
                    (s.delta >= 0 ? "font-semibold text-[var(--gain)]" : "font-semibold text-[var(--loss)]"),
                )}
              >
                {s.valueLabel}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
