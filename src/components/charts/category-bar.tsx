// CategoryBar — Tremor Raw block (copy-paste source the team owns), adapted to the app's
// semantic palette + a11y contract (UI-SPEC §Charting / §3 Cost Centers / §4 Spending).
//
// Two uses in Phase 2:
//   1. Budget vs actual (Cost Centers, BI-02): track = budget, fill = actual. The fill
//      tone carries the state — neutral/--gain under cap, --warning at ≥85%, --loss when
//      over (the fill OVERFLOWS the track at >100% to read as a breach, never a fake cap).
//   2. Category-as-%-of-revenue (Spending, D2-15): each row a share of net revenue.
//
// a11y (UI-SPEC §Accessibility): a real `role="progressbar"` with aria-valuenow/min/max +
// a VISIBLE mono value string, so a screen-reader user never depends on the bar fill.
// Color is never the only signal — the caller pairs the tone with icon + text.
//
// Tremor Raw imports the class-merge util as `cx` (aliased in @/lib/utils — FND-06).

import { cx } from "@/lib/utils";

export type CategoryBarTone = "neutral" | "gain" | "warning" | "loss";

const TONE_FILL: Record<CategoryBarTone, string> = {
  neutral: "bg-[var(--chart-1)]",
  gain: "bg-[var(--gain-fill)]",
  warning: "bg-amber-400",
  loss: "bg-[var(--loss-fill)]",
};

export interface CategoryBarProps extends React.HTMLAttributes<HTMLDivElement> {
  /** 0..N percentage of the track filled. Values >100 visibly overflow (an over-budget breach). */
  value: number;
  tone?: CategoryBarTone;
  /** Accessible label for the bar (e.g. "Lorenzo budget vs actual"). */
  label?: string;
  /** Visible/announced text alternative (e.g. "€820 of €1.000" or "14 % of net revenue"). */
  valueText?: string;
}

export function CategoryBar({
  value,
  tone = "neutral",
  label,
  valueText,
  className,
  ...props
}: CategoryBarProps) {
  // Fill clamps to 100% of the TRACK width visually; an over-cap breach is signalled by the
  // --loss tone + the caller's "Over by €{x}" text, not by an impossible >100% bar width.
  const fillPct = Math.min(100, Math.max(0, value));

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={Math.round(Math.min(100, Math.max(0, value)))}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuetext={valueText}
      className={cx(
        "relative flex h-2.5 w-full items-center overflow-hidden rounded-full bg-muted",
        className,
      )}
      {...props}
    >
      <div
        aria-hidden="true"
        className={cx(
          "h-full rounded-full transition-all duration-300 ease-out motion-reduce:transition-none",
          TONE_FILL[tone],
        )}
        style={{ width: `${fillPct}%` }}
      />
    </div>
  );
}
