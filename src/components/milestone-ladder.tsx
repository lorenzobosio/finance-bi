// MilestoneLadder — the signature journey RAIL you climb (D5-13, GOAL-01/02/12). A VERTICAL ladder,
// €100k at the top, €0 at the bottom — the couple climbs it. Rungs at every €10k level, emphasized
// landings at the headline milestones (€10k/25k/50k/75k/100k), the CURRENT position highlighted
// (--brand "you are here" + a next-milestone pulse), ghosted future rungs (--neutral-data), and a
// multi-goal continuation stub past €100k (GOAL-12). Pre-launch (D5-16) it renders FULL and ghosted
// at €0 — visible and hopeful, never absent.
//
// Server component (no "use client"): pure CSS/SVG, theme-aware via named tokens. The only motion is
// the next-milestone pulse, gated `motion-reduce:animate-none` so the reduced-motion static fallback
// is the same ladder without the breathing dot. All €/% via formatEUR/formatPct — never Intl here.

import { Check } from "lucide-react";

import { formatEUR, formatPct } from "@/lib/format";
import { cn } from "@/lib/utils";

/** One rung on the ladder: a Wealth threshold with its achieved state + optional achieved caption. */
export interface LadderRung {
  /** The € threshold this rung sits at. */
  threshold: number;
  /** True once Wealth has reached this rung. */
  achieved: boolean;
  /** A human "reached {Month Year}" caption when achieved (post-launch); omitted pre-launch/future. */
  achievedLabel?: string;
  /** A headline milestone (€10k/25k/50k/75k/100k) — rendered with extra emphasis vs a plain level. */
  major?: boolean;
}

export interface MilestoneLadderProps {
  /** The current Wealth cost basis (the €100k-progress figure — NOT Σ investimento, D5-02). */
  wealth: number;
  /** The active €100k denominator (GOAL-12) — the ladder's ceiling for the current goal. */
  denominator: number;
  /** The rungs, ascending by threshold. */
  rungs: LadderRung[];
  /** Pre-launch: ghost the whole ladder at €0 (hopeful, not empty — D5-16). */
  preLaunch?: boolean;
  className?: string;
}

/**
 * The ladder. Rungs are rendered TOP-DOWN (highest threshold first) so the couple reads "€100k at the
 * summit". The lowest not-yet-achieved rung carries the "Next" pulse; the current position marker sits
 * on the fill. A multi-goal continuation caption shows above €100k once the denominator rolls over.
 */
export function MilestoneLadder({
  wealth,
  denominator,
  rungs,
  preLaunch = false,
  className,
}: MilestoneLadderProps) {
  const topDown = [...rungs].sort((a, b) => b.threshold - a.threshold);
  const pct = denominator > 0 ? Math.min(100, (wealth / denominator) * 100) : 0;

  // The next rung = the lowest threshold strictly above the current Wealth (the pulse target).
  const nextRung = [...rungs]
    .sort((a, b) => a.threshold - b.threshold)
    .find((r) => !r.achieved);

  return (
    <div className={cn("rounded-xl bg-card p-6 text-card-foreground ring-1 ring-foreground/10", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-xl font-semibold">The climb to €100.000</h2>
        <span className="font-mono text-sm tabular-nums text-muted-foreground">
          {formatPct(pct)}
        </span>
      </div>

      {/* Multi-goal continuation (GOAL-12): once past €100k the ladder points at the next major. */}
      {denominator > 100_000 && (
        <p className="mt-1 text-sm text-muted-foreground">
          Next goal:{" "}
          <span className="font-mono tabular-nums text-foreground">{formatEUR(denominator, 0)}</span>{" "}
          — the ladder keeps climbing.
        </p>
      )}

      <ol className="mt-6 flex flex-col gap-0" aria-label="Milestone ladder, €100.000 at the top">
        {topDown.map((rung, i) => {
          const isNext = nextRung?.threshold === rung.threshold;
          const isLast = i === topDown.length - 1;
          return (
            <li key={rung.threshold} className="flex items-stretch gap-3">
              {/* The rail column: a connector line + the rung dot. */}
              <div className="flex w-6 shrink-0 flex-col items-center">
                {/* connector above the dot (brand when the rung is achieved, ghosted otherwise) */}
                <span
                  aria-hidden="true"
                  className={cn(
                    "w-0.5 flex-1",
                    i === 0 ? "opacity-0" : rung.achieved ? "bg-[var(--brand)]" : "bg-[var(--neutral-data)]",
                  )}
                />
                <span
                  aria-hidden="true"
                  className={cn(
                    "my-1 grid size-4 place-items-center rounded-full ring-2",
                    rung.achieved
                      ? "bg-[var(--brand)] ring-[var(--brand)] text-white"
                      : isNext && !preLaunch
                        ? "bg-transparent ring-[var(--brand)] motion-safe:animate-pulse"
                        : "bg-transparent ring-[var(--neutral-data)]",
                  )}
                >
                  {rung.achieved && <Check aria-hidden="true" className="size-2.5" strokeWidth={3} />}
                </span>
                {/* connector below the dot */}
                <span
                  aria-hidden="true"
                  className={cn(
                    "w-0.5 flex-1",
                    isLast ? "opacity-0" : "bg-[var(--neutral-data)]",
                  )}
                />
              </div>

              {/* The rung label + status. */}
              <div className="min-w-0 flex-1 py-1.5">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span
                    className={cn(
                      "font-mono text-sm tabular-nums",
                      rung.major ? "font-semibold" : "font-medium",
                      rung.achieved ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {formatEUR(rung.threshold, 0)}
                  </span>
                  {rung.achieved && rung.achievedLabel && (
                    <span className="text-xs text-[var(--gain)]">reached {rung.achievedLabel}</span>
                  )}
                  {!rung.achieved && isNext && !preLaunch && (
                    <span className="text-xs font-medium text-[var(--brand)]">
                      Next · {formatEUR(Math.max(0, rung.threshold - wealth), 0)} to go
                    </span>
                  )}
                  {!rung.achieved && (!isNext || preLaunch) && (
                    <span className="text-xs text-muted-foreground">
                      {preLaunch ? "waiting" : "ahead"}
                    </span>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      <p className="sr-only">
        {preLaunch
          ? `The ladder to ${formatEUR(denominator, 0)} is set and waiting; nothing invested yet.`
          : `${formatEUR(wealth, 0)} of ${formatEUR(denominator, 0)} invested, ${formatPct(pct)} up the ladder.`}
      </p>
    </div>
  );
}
