import { Lock, Trophy } from "lucide-react";

import { cn } from "@/lib/utils";

// Trophy shelf — the permanent "Our wins." row of named-milestone seals (PERS-03, D5-14). ACHIEVED
// seals are brand-filled with a "reached {Month Year}" caption; LOCKED seals are ghosted but VISIBLE
// ("[Locked — unlock at €Nk]") so the shelf is motivating, not a wall of blanks. Presentational only:
// the Goal RSC does the demo-partitioned goal_events + milestones read and hands the seals down (all
// reads stay in the page under @supabase/ssr — never src/lib/db/marts, D3-13).

export interface TrophySeal {
  /** The named-milestone € threshold (10/25/50/75/100k). */
  threshold: number;
  /** True once the Wealth cost basis has crossed this threshold. */
  achieved: boolean;
  /** "Jun 2026" — the month the milestone was reached (only present for achieved+stamped seals). */
  reachedLabel?: string;
}

/** "€50k" shorthand for a whole-€10k/€100k threshold. */
function kLabel(threshold: number): string {
  return `€${Math.round(threshold / 1000)}k`;
}

export function TrophyShelf({ seals }: { seals: TrophySeal[] }) {
  return (
    <section aria-label="Our wins">
      <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Our wins
      </h2>
      <ul className="mt-3 flex flex-wrap gap-4">
        {seals.map((seal) => (
          <li key={seal.threshold} className="flex w-24 flex-col items-center gap-1.5 text-center">
            <span
              aria-hidden="true"
              className={cn(
                "flex size-14 items-center justify-center rounded-full ring-1",
                seal.achieved
                  ? "bg-[var(--brand-muted)] text-[var(--brand)] ring-[var(--brand)]/30"
                  : "bg-background text-muted-foreground/40 ring-foreground/10",
              )}
            >
              {seal.achieved ? <Trophy className="size-6" /> : <Lock className="size-5" />}
            </span>
            <span
              className={cn(
                "font-mono text-sm font-semibold tabular-nums",
                seal.achieved ? "text-foreground" : "text-muted-foreground/60",
              )}
            >
              {kLabel(seal.threshold)}
            </span>
            <span className="text-[11px] leading-tight text-muted-foreground">
              {seal.achieved
                ? seal.reachedLabel
                  ? `reached ${seal.reachedLabel}`
                  : "reached"
                : `Locked — unlock at ${kLabel(seal.threshold)}`}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
