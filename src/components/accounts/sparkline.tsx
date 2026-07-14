"use client";

// Sparkline — the compact per-account mini-trend (ACC-01, RESEARCH Pattern 6). A tiny, axis-less
// Recharts-3 Area mirroring net-worth-trend.tsx's LOCKED conventions: the bare `var(--chart-1)`
// token color form (NEVER the wrapped-hsl form — CLAUDE.md Recharts-3 rule), an explicit
// ChartContainer height so ResponsiveContainer measures on first render (Pitfall 7),
// `accessibilityLayer` on the chart, and `isAnimationActive` gated by usePrefersReducedMotion.
//
// This is a CLIENT ISLAND that takes typed `{date,value}[]` points as a prop — it NEVER touches the
// DB and NEVER imports marts (FND-03). The card text carries the actual numbers; the SVG is
// aria-hidden decoration. <2 points → a flat placeholder, never a 0-height blank.

import { Area, AreaChart } from "recharts";

import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import type { SparklinePoint } from "@/lib/accounts/summary";

export interface SparklineProps {
  /** The ascending-by-date balance series for one account (oldest → newest). */
  data: SparklinePoint[];
  className?: string;
}

const chartConfig = {
  value: { label: "Balance", color: "var(--chart-1)" },
} satisfies ChartConfig;

export function Sparkline({ data, className }: SparklineProps) {
  const prefersReduced = usePrefersReducedMotion();

  // <2 points can't draw a trend — render a calm flat baseline placeholder (never a 0-height blank).
  if (data.length < 2) {
    return (
      <div
        aria-hidden="true"
        className={className ?? "h-10 w-full"}
        role="presentation"
      >
        <div className="mt-[19px] h-px w-full bg-[var(--border)]" />
      </div>
    );
  }

  // The end-to-end delta picks a gain/loss accent (color is decorative — the numbers live in text).
  const delta = data[data.length - 1].value - data[0].value;
  const accent = delta >= 0 ? "var(--gain-fill)" : "var(--loss-fill)";

  return (
    <ChartContainer
      config={chartConfig}
      aria-hidden="true"
      className={className ?? "h-10 w-full"}
    >
      <AreaChart
        accessibilityLayer
        data={data}
        margin={{ top: 2, right: 0, bottom: 2, left: 0 }}
      >
        <defs>
          <linearGradient id="sparklineFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={accent} stopOpacity={0.25} />
            <stop offset="100%" stopColor={accent} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <Area
          dataKey="value"
          type="monotone"
          stroke={accent}
          strokeWidth={1.5}
          fill="url(#sparklineFill)"
          isAnimationActive={!prefersReduced}
          dot={false}
        />
      </AreaChart>
    </ChartContainer>
  );
}
