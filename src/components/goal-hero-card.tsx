"use client";

// GoalHeroCard — the emotional center of Home (D3-06, DSN-05, D5-12). A raised card showing the live
// €100k WEALTH COST BASIS progress (getGoalTotal — the smaller number, NOT Σ investimento) plus the
// "1-minute glance": next-milestone, a gated honest ETA, and a compact €4k streak pulse.
//
// Anatomy (desktop ≥xl, side-by-side band):
//   • eyebrow "INVESTED TOWARD €100.000"
//   • the live cost-basis number — 32px mono, a violet `--brand-glow` radial behind it, count-up
//   • the delta line: ▲ gain-green contribution this month · neutral remainder "to go"
//   • next-milestone: "{€Z} to your next milestone."
//   • a gated ETA sentence (honest RANGE, or the warm "building your pace" copy — never a false date)
//   • a compact streak chain (last ~6 closed months + the filling provisional head; never red)
//   • a thin 12-mo invested sparkline (pure SVG, accent stroke)
//   • a violet progress arc (`42 %` centered in mono, notches on a neutral ring)
//
// Pre-launch (D5-01/16): a calm state — no streak, no ETA, no "this month" delta, no "missed" copy.
//
// Mobile (<xl) variant: the arc sits ABOVE the number, full-width, stacked.
//
// All numbers come pre-formatted via formatEUR/formatPct (this island never calls Intl); the
// animated display uses the de-DE CountUp wrapper. The card is the Goal drill-down — now that the
// Goal page exists (Phase 5) it is a real link to /goal (the old "Coming soon" placeholder is gone).

import Link from "next/link";
import { TrendingUp } from "lucide-react";

import { CountUp } from "@/components/motion/count-up";
import { formatEUR, formatPct } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface GoalHeroCardProps {
  /**
   * The €100k progress figure = the WEALTH COST BASIS (getGoalTotal — D5-02). NOT Σ investimento.
   * This is deliberately the smaller number; the eyebrow labels it "Invested toward €100.000".
   */
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

  // --- Phase-5 glance (D5-12) — all optional so the card degrades gracefully -----------------
  /** Pre-launch calm state (no launch_date): suppress streak / ETA / delta / "missed" copy. */
  preLaunch?: boolean;
  /** € remaining to the next milestone rung, or null past the top rung. */
  nextMilestoneRemaining?: number | null;
  /** The gated ETA sentence (already resolved via hero-view.etaLine). */
  etaLine?: string;
  /** The compact streak chain: last ~6 CLOSED months, oldest → newest (true = hit €4k). */
  streakHits?: boolean[];
  /** The OPEN month has already reached €4k (a filling head, not a closed count). */
  streakProvisionalHit?: boolean;
  /** Current consecutive-hit run (for the sr-only summary). */
  streakCurrent?: number;
  /** All-time longest run (for the sr-only summary). */
  streakLongest?: number;
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

/**
 * The compact €4k streak pulse: last ~6 closed months as dots (filled `--gain` on a hit, neutral on
 * a lighter month — NEVER red, D5-07) + the provisional month as a brand-ringed filling head.
 */
function StreakChain({
  hits,
  provisionalHit,
  current,
  longest,
}: {
  hits: boolean[];
  provisionalHit: boolean;
  current?: number;
  longest?: number;
}) {
  if (hits.length === 0 && !provisionalHit) return null;
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex items-center gap-1.5" aria-hidden="true">
        {hits.map((hit, i) => (
          <span
            key={i}
            className={cn(
              "size-2 rounded-full",
              // filled = hit (gain green); a lighter month is NEUTRAL, never --loss/red (D5-07).
              hit ? "bg-[var(--gain)]" : "bg-[var(--neutral-data)]",
            )}
          />
        ))}
        {/* The provisional (open) month — a filling head ringed in brand; green once it hits €4k. */}
        <span
          className={cn(
            "size-2.5 rounded-full ring-2 ring-[var(--brand)]",
            provisionalHit ? "bg-[var(--gain)]" : "bg-transparent",
          )}
        />
      </div>
      <span className="sr-only">
        {`€4.000 streak: ${current ?? 0} month${(current ?? 0) === 1 ? "" : "s"} in a row` +
          (longest ? `, longest ${longest}.` : ".")}
      </span>
    </div>
  );
}

/** The violet progress arc (3/4 circle) with the % centered in mono + notches on a neutral ring. */
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
  preLaunch = false,
  nextMilestoneRemaining,
  etaLine,
  streakHits,
  streakProvisionalHit,
  streakCurrent,
  streakLongest,
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

      {preLaunch ? (
        // Pre-launch calm state (D5-16): no delta / streak / ETA / "missed" copy.
        <p className="mt-2 text-sm text-muted-foreground">
          Waiting to launch — your €100k journey begins when you set a date.
        </p>
      ) : (
        <>
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

          {nextMilestoneRemaining != null && nextMilestoneRemaining > 0 && (
            <p className="mt-1.5 text-sm text-muted-foreground">
              <span className="font-mono tabular-nums text-foreground">
                {formatEUR(nextMilestoneRemaining, 0)}
              </span>{" "}
              to your next milestone.
            </p>
          )}

          {etaLine && (
            <p className="mt-1 text-sm text-muted-foreground">{etaLine}</p>
          )}

          {streakHits && (
            <StreakChain
              hits={streakHits}
              provisionalHit={streakProvisionalHit ?? false}
              current={streakCurrent}
              longest={streakLongest}
            />
          )}
        </>
      )}

      <Sparkline values={sparkline} className="mt-4" />
      <p className="sr-only">
        {`${formatEUR(investedToDate, 0)} invested of ${formatEUR(goalEur, 0)}, ${formatPct(pct)} toward the goal.`}
      </p>
    </div>
  );

  return (
    <Link
      href="/goal"
      className={cn(
        "group/card relative flex h-full flex-col gap-4 overflow-hidden rounded-xl bg-card p-6 text-card-foreground shadow-sm ring-1 ring-foreground/10 outline-none transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring",
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
    </Link>
  );
}
