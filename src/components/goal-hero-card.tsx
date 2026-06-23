"use client";

// GoalHeroCard — the emotional center of Home (D3-06, DSN-05). A raised card showing the live
// €100k cost-basis progress, reading EXISTING Phase-2 investimento data only. The rich journey
// / streak / bucket content is Phase 5; this is the LAYOUT.
//
// Anatomy (desktop ≥xl, side-by-side band):
//   • eyebrow "INVESTED TOWARD €100.000"
//   • the live cost-basis number — 32px mono, a violet `--brand-glow` radial behind it, count-up
//   • the delta line: ▲ gain-green contribution this month · neutral remainder "to go"
//   • a thin 12-mo invested sparkline (pure SVG, accent stroke)
//   • a violet progress arc (`42 %` centered in mono, 25/50/75/100k notches on a neutral ring)
//
// Mobile (<xl) variant: the arc sits ABOVE the number, full-width, stacked.
//
// All numbers come pre-formatted via formatEUR/formatPct (this island never calls Intl); the
// animated display uses the de-DE CountUp wrapper. The whole card is the Goal drill-down — but
// the Goal page is Phase 5 (disabled), so it renders as a non-navigating card with an
// aria-disabled affordance + sr-only "Coming soon — Phase 5" hint (mirrors the nav placeholder).

import { TrendingUp } from "lucide-react";

import { CountUp } from "@/components/motion/count-up";
import { formatEUR, formatPct } from "@/lib/format";
import { cn } from "@/lib/utils";

const NBSP = " ";

export interface GoalHeroCardProps {
  /** Cumulative investimento cost-basis toward €100k (the live hero number). */
  investedToDate: number;
  /** The €100k target. */
  goalEur: number;
  /** This month's investimento contribution (the gain-green delta). */
  contributionThisMonth: number;
  /** 12-month cumulative-invested series (oldest → newest) for the sparkline. */
  sparkline: number[];
  /** Mobile variant: arc above the number, full-width stack. */
  mobile?: boolean;
  className?: string;
}

/** A thin pure-SVG sparkline of the cumulative-invested series; accent stroke, aria-hidden. */
function Sparkline({ values, className }: { values: number[]; className?: string }) {
  if (values.length < 2) return null;
  const w = 100;
  const h = 28;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = h - ((v - min) / span) * h;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      className={cn("h-7 w-full", className)}
    >
      <polyline
        points={points}
        fill="none"
        stroke="var(--brand)"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/** The violet progress arc (3/4 circle) with the % centered in mono + 25/50/75/100k notches. */
function GoalArc({ pct, className }: { pct: number; className?: string }) {
  // A 270° arc (gap at the bottom). r=52, stroke 10, viewBox 120.
  const size = 120;
  const r = 52;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const arcFraction = 0.75; // 270°
  const arcLen = circumference * arcFraction;
  const filled = arcLen * Math.min(1, Math.max(0, pct / 100));
  // Rotate so the gap sits at the bottom (start at 135°, sweep clockwise 270°).
  const rotation = 135;
  return (
    <div className={cn("relative", className)}>
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="size-32"
        aria-hidden="true"
        role="presentation"
      >
        <g transform={`rotate(${rotation} ${cx} ${cy})`}>
          {/* neutral track */}
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke="var(--muted)"
            strokeWidth={10}
            strokeLinecap="round"
            strokeDasharray={`${arcLen} ${circumference}`}
          />
          {/* violet fill */}
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke="var(--brand)"
            strokeWidth={10}
            strokeLinecap="round"
            strokeDasharray={`${filled} ${circumference}`}
            className="transition-[stroke-dasharray] duration-500 ease-out motion-reduce:transition-none"
          />
        </g>
      </svg>
      {/* % centered in mono */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono text-xl font-semibold tabular-nums leading-none">
          {formatPct(pct)}
        </span>
        <span className="mt-0.5 text-[11px] uppercase tracking-wide text-muted-foreground">
          to goal
        </span>
      </div>
    </div>
  );
}

export function GoalHeroCard({
  investedToDate,
  goalEur,
  contributionThisMonth,
  sparkline,
  mobile = false,
  className,
}: GoalHeroCardProps) {
  const remaining = Math.max(0, goalEur - investedToDate);
  const pct = Math.min(100, (investedToDate / goalEur) * 100);

  const numberBlock = (
    <div className="relative">
      {/* violet --brand-glow radial behind the hero number */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-x-4 -inset-y-2 -z-10 rounded-full opacity-70 blur-2xl"
        style={{
          background:
            "radial-gradient(60% 80% at 30% 50%, var(--brand-glow), transparent 70%)",
        }}
      />
      <div className="font-mono text-3xl font-semibold tabular-nums leading-none">
        <CountUp value={investedToDate} />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm font-medium">
        <span className="inline-flex items-center gap-1 text-[var(--gain)]">
          <TrendingUp aria-hidden="true" className="size-4 shrink-0" />
          {formatEUR(contributionThisMonth, 0)} this month
        </span>
        <span aria-hidden="true" className="text-muted-foreground">
          ·
        </span>
        <span className="text-muted-foreground">
          {formatEUR(remaining, 0)} to go
        </span>
      </div>
      <Sparkline values={sparkline} className="mt-4" />
      <p className="sr-only">
        {`${formatEUR(investedToDate, 0)} invested of ${formatEUR(goalEur, 0)}, ${formatPct(pct)} toward the goal.`}
      </p>
    </div>
  );

  return (
    <div
      // The Goal page is Phase 5 — the card is the future drill-down but is inert this phase.
      aria-disabled="true"
      className={cn(
        "group/card relative flex h-full flex-col gap-4 overflow-hidden rounded-xl bg-card p-6 text-card-foreground shadow-sm ring-1 ring-foreground/10",
        // 1px inset top highlight (elevation system).
        "before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-foreground/10",
        className,
      )}
    >
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Invested toward €100.000
      </div>

      {mobile ? (
        <div className="flex flex-col items-center gap-4">
          <GoalArc pct={pct} />
          <div className="w-full text-center">{numberBlock}</div>
        </div>
      ) : (
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">{numberBlock}</div>
          <GoalArc pct={pct} className="shrink-0" />
        </div>
      )}

      <span className="sr-only">Goal detail — coming soon — Phase 5{NBSP}</span>
    </div>
  );
}
