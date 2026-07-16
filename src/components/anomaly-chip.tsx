import { TriangleAlert } from "lucide-react";

import type { Flag } from "@/lib/health/anomaly";
import { cn } from "@/lib/utils";

// AnomalyChip — the compact NON-SHAME overspend alert (AI-05, D-11/12/13, UI-SPEC §5), rendered on
// BOTH Home (below the scorecard chips) and the Cost Centers page. Presentational only: it takes the
// top 1–2 deterministic `Flag`s from `detectAnomalies` and renders one amber pill each, reusing the
// kpi-card / scorecard-chips status-pill convention verbatim (`rounded-full px-2 py-0.5 text-sm
// font-medium` + tone text + tinted surface + a lucide glyph). Color is NEVER the sole signal — each
// row carries the TriangleAlert icon + factual text + color.
//
// D-12 NON-SHAME: over-budget AND on-pace reads use the `--warning` amber tone ONLY — NEVER the red
// loss tone (a grep asserts the red-loss token never appears in this file). The copy is factual + warm
// ("Shared is over budget this month." / "Lorenzo's cost center is 80% spent — and it's the 12th."),
// never "owed", never red-shaming — consistent with the Phase-5 warm sub-target alert.
//
// D-11 GATE: when `monthsWithData < 2` the statistical-spike branch is off, so the chip shows the
// honest gate line "Spend-spike detection turns on next month" instead of a spike flag.
//
// DISPLAY ONLY (D-13): no notification infrastructure — Phase-14 REM-02 re-consumes the SAME pure
// detector to push-notify. No "use client": pure RSC markup (no hooks), so it imports cleanly into the
// Home and Cost Centers server components.

/** The minimum non-empty months before spike detection turns on (mirrors anomaly.ts SPIKE_MIN_MONTHS). */
const SPIKE_MIN_MONTHS = 2;

export interface AnomalyChipProps {
  /** The top 1–2 deterministic flags (already sliced by the caller). */
  flags: Flag[];
  /** Distinct non-empty months of history — gates the spike-detection copy (D-11). */
  monthsWithData: number;
  /** scope (cost-center code) → display name (demo-remapped Alice/Bob on the public deploy). */
  labels?: Record<string, string>;
  /** The current day-of-month (from the caller's demo-aware clock) for the "and it's the 12th" copy. */
  dayOfMonth?: number;
  className?: string;
}

/** English ordinal for the day-of-month ("12th", "1st", "22nd", "3rd"). */
function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/** Factual + warm, non-shame copy for one flag (UI-SPEC §Copywriting) — never "owed", never red. */
function flagCopy(flag: Flag, name: string, dayOfMonth?: number): string {
  // Over budget already → a calm statement of fact (D-12: no "owed", no red).
  if (flag.remaining < 0) return `${name} is over budget this month.`;
  // On pace to exceed → the % spent, with the date as gentle context when available.
  const pctSpent = flag.budget > 0 ? Math.round((flag.actual / flag.budget) * 100) : 0;
  const dayClause = dayOfMonth ? ` — and it's the ${ordinal(dayOfMonth)}` : "";
  return `${name}'s cost center is ${pctSpent}% spent${dayClause}.`;
}

/** One amber non-shame pill (the exact scorecard-chips warning treatment — amber only, never red). */
function AnomalyPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-[var(--warning-fill)]/12 px-2 py-0.5 text-sm font-medium text-[var(--warning)]">
      <TriangleAlert aria-hidden="true" className="size-4 shrink-0" />
      <span>{children}</span>
    </span>
  );
}

export function AnomalyChip({
  flags,
  monthsWithData,
  labels,
  dayOfMonth,
  className,
}: AnomalyChipProps) {
  const showGate = monthsWithData < SPIKE_MIN_MONTHS;

  // No flags AND rich history → render nothing (no false alarm). Under thin data the honest gate line
  // still surfaces so the couple knows spike detection is coming.
  if (flags.length === 0 && !showGate) return null;

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {flags.map((flag) => (
        <AnomalyPill key={flag.scope}>
          {flagCopy(flag, labels?.[flag.scope] ?? flag.scope, dayOfMonth)}
        </AnomalyPill>
      ))}
      {showGate && (
        <span className="text-xs text-muted-foreground">
          Spend-spike detection turns on next month.
        </span>
      )}
    </div>
  );
}
