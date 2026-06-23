// BarList — Tremor Raw block (copy-paste source the team owns), adapted to the app's
// semantic palette + a11y contract (UI-SPEC §Charting / §4 Spending / §Accessibility).
//
// Horizontal bars, biggest-first, value labels — the breakdown idiom for Spending
// (category / account / person). Bars, NOT a donut (UI-SPEC §Charting P3: bars beat
// donuts for comparison + a11y). A single NEUTRAL hue ramp (`--chart-1..5`) — never
// rainbow categories; chromatic color is reserved for gain/loss elsewhere. The one
// exception is the Uncategorized bucket, which renders in `--neutral-data` grey and may
// carry an action link ("{n} to categorize →", D2-01 graceful degrade).
//
// a11y (UI-SPEC): each row exposes its value as VISIBLE mono text (not just the bar), so
// a screen-reader user never depends on the SVG/fill. Rows are plain DOM (no Recharts) —
// the most accessible shape for a ranked list.
//
// Tremor Raw imports the class-merge util as `cx` (aliased in @/lib/utils — FND-06), so
// the block copies essentially unmodified.

import Link from "next/link";

import { cx } from "@/lib/utils";

export interface BarListItem {
  /** Row label (category / account / person name, or "Uncategorized"). */
  label: string;
  /** The numeric magnitude (already a positive € amount). */
  value: number;
  /** Pre-formatted value string (caller formats via formatEUR — this block never calls Intl). */
  valueLabel: string;
  /** Optional trailing action (e.g. the Uncategorized "{n} to categorize →" link). */
  action?: { href: string; text: string };
  /** Render this row in the neutral-data grey (the Uncategorized bucket). */
  neutral?: boolean;
}

export interface BarListProps {
  items: BarListItem[];
  /** Accessible name for the whole list (e.g. "Spending by category"). */
  ariaLabel?: string;
  className?: string;
}

export function BarList({ items, ariaLabel, className }: BarListProps) {
  // Scale every bar against the largest magnitude so the biggest fills the track.
  const maxValue = items.reduce((m, i) => Math.max(m, i.value), 0);

  return (
    <ul aria-label={ariaLabel} className={cx("flex flex-col gap-2", className)}>
      {items.map((item, idx) => {
        const widthPct = maxValue > 0 ? Math.max(1, (item.value / maxValue) * 100) : 0;
        return (
          <li key={`${item.label}-${idx}`} className="flex items-center gap-3">
            {/* The bar + inline label (the bar is decorative; the value is text below). */}
            <div className="relative flex h-8 min-w-0 flex-1 items-center">
              <div
                aria-hidden="true"
                className={cx(
                  "absolute inset-y-0 left-0 rounded-md transition-[width] duration-300 ease-out motion-reduce:transition-none",
                  item.neutral ? "bg-[var(--neutral-data)]/20" : "bg-[var(--chart-1)]",
                )}
                style={{ width: `${widthPct}%` }}
              />
              <span className="relative z-10 truncate px-2 text-sm">
                {item.label}
                {item.action && (
                  <Link
                    href={item.action.href}
                    className="ml-2 text-xs text-[var(--neutral-data)] underline-offset-2 hover:underline"
                  >
                    {item.action.text}
                  </Link>
                )}
              </span>
            </div>
            {/* The value as VISIBLE mono text — the a11y truth, not the bar (UI-SPEC). */}
            <span
              className={cx(
                "shrink-0 font-mono text-sm tabular-nums",
                item.neutral && "text-[var(--neutral-data)]",
              )}
            >
              {item.valueLabel}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
