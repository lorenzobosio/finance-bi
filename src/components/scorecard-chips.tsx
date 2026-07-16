import { CircleCheck, TriangleAlert, type LucideIcon } from "lucide-react";

import type { KpiTone } from "@/components/kpi-card";
import type { HealthBand, MetricRead, Scorecard } from "@/lib/health/scorecard";
import { cn } from "@/lib/utils";

// ScorecardChips — the reusable 5-chip Financial-Health status summary (UI-SPEC §2a), rendered on
// BOTH Home (compact, below the KPI/CFO decomposition) and the /health page. Presentational only:
// it takes the `assembleScorecard` output and renders one status pill per metric, reusing the
// kpi-card `KpiStatus` pill convention verbatim (`rounded-full px-2 py-0.5 text-sm font-medium` +
// tone text color + tinted surface + a lucide glyph). Color is NEVER the sole signal — every chip
// carries icon + text + color (the inherited invariant). Non-shame copy throughout (D-09/D-12):
// income-dependent metrics with no income read "Not yet — starts at launch" (neutral), never red.
//
// No "use client" — pure RSC markup (no hooks / no count-up), so it imports cleanly into the Home
// and /health server components.

/** tone → the pill glyph + text color, mirroring kpi-card's STATUS_ICON / TONE_TEXT. */
const TONE_TEXT: Record<KpiTone, string> = {
  gain: "text-[var(--gain)]",
  loss: "text-[var(--loss)]",
  warning: "text-[var(--warning)]",
  neutral: "text-[var(--neutral-data)]",
};

const STATUS_ICON: Record<KpiTone, LucideIcon> = {
  gain: CircleCheck,
  loss: TriangleAlert,
  warning: TriangleAlert,
  neutral: CircleCheck,
};

/** The band read text (D-06 copy). Neutral falls back to the metric's own "waiting" copy (D-09). */
function bandText(band: HealthBand, neutralLabel: string): string {
  switch (band) {
    case "healthy":
      return "Healthy";
    case "watch":
      return "Watch";
    case "off-track":
      return "Off track";
    case "neutral":
      return neutralLabel;
  }
}

/** The status pill — the exact kpi-card `KpiStatus` treatment, reused for a health read. */
function StatusPill({ read, neutralLabel }: { read: MetricRead; neutralLabel: string }) {
  const Icon = STATUS_ICON[read.tone];
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-sm font-medium",
        TONE_TEXT[read.tone],
        read.tone === "gain" && "bg-[var(--gain-fill)]/12",
        read.tone === "loss" && "bg-[var(--loss-fill)]/12",
        read.tone === "warning" && "bg-[var(--warning-fill)]/12",
        read.tone === "neutral" && "bg-muted",
      )}
    >
      <Icon aria-hidden="true" className="size-4 shrink-0" />
      <span>{bandText(read.band, neutralLabel)}</span>
    </span>
  );
}

/** One metric chip: its label + the status pill. */
interface ChipSpec {
  key: keyof Scorecard;
  label: string;
  /** The neutral (no-income / flat) read copy for this metric (D-09 non-shame). */
  neutralLabel: string;
}

// The five scorecard metrics, in the UI-SPEC §2a order. Income-dependent metrics carry the D-09
// "Not yet — starts at launch" neutral copy; growth carries the D-08 "contributions" framing.
const CHIPS: ChipSpec[] = [
  { key: "savingsRate", label: "Savings rate", neutralLabel: "Not yet — starts at launch" },
  { key: "monthsOfReserve", label: "Months of reserve", neutralLabel: "Not yet — starts at launch" },
  { key: "budgetAdherence", label: "Budget adherence", neutralLabel: "Not yet" },
  { key: "investmentGrowth", label: "Growth (contributions)", neutralLabel: "No change yet" },
  { key: "streak", label: "€4k streak", neutralLabel: "Not yet — starts at launch" },
];

export interface ScorecardChipsProps {
  card: Scorecard;
  className?: string;
}

export function ScorecardChips({ card, className }: ScorecardChipsProps) {
  return (
    <ul
      className={cn(
        "grid grid-cols-1 gap-3 @md/main:grid-cols-2 @2xl/main:grid-cols-3",
        className,
      )}
    >
      {CHIPS.map((chip) => (
        <li
          key={chip.key}
          className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card/50 px-3 py-2"
        >
          <span className="text-sm font-medium text-muted-foreground">{chip.label}</span>
          <StatusPill read={card[chip.key]} neutralLabel={chip.neutralLabel} />
        </li>
      ))}
    </ul>
  );
}
