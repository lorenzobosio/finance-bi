// ChartSummaryTable — the reusable data-table alternative paired with every chart's aria-hidden
// SVG (UI-SPEC §Accessibility). Extracted/generalized from the PnlWaterfall pattern: a chart is
// NEVER the a11y truth — a screen-reader user reads this real <table> of the same series instead.
//
// Values arrive PRE-FORMATTED via formatEUR/formatPct by the caller (this block never calls Intl)
// and render mono + tabular-nums. The paired chart SVG must carry `aria-hidden="true"`; this
// table carries the accessible caption/summary.

import { cx } from "@/lib/utils";

export interface ChartSummaryRow {
  /** Row label (the X-axis / category name). */
  label: string;
  /** Pre-formatted value (caller formats via formatEUR/formatPct). */
  valueLabel: string;
  /** Emphasize this row (e.g. a total / result). */
  emphasis?: boolean;
}

export interface ChartSummaryTableProps {
  /** Accessible summary of the whole chart (e.g. "Net worth over the last 12 months"). */
  caption: string;
  /** Header for the label column (default "Period"). */
  labelHeader?: string;
  /** Header for the value column (default "Amount"). */
  valueHeader?: string;
  rows: ChartSummaryRow[];
  className?: string;
}

export function ChartSummaryTable({
  caption,
  labelHeader = "Period",
  valueHeader = "Amount",
  rows,
  className,
}: ChartSummaryTableProps) {
  return (
    <table className={cx("w-full text-sm", className)} aria-label={caption}>
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr className="text-left text-muted-foreground">
          <th scope="col" className="py-1 font-medium">
            {labelHeader}
          </th>
          <th scope="col" className="py-1 text-right font-medium">
            {valueHeader}
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={`${r.label}-${i}`} className="border-t border-border">
            <th
              scope="row"
              className={cx("py-1.5 font-normal", r.emphasis && "font-semibold")}
            >
              {r.label}
            </th>
            <td
              className={cx(
                "py-1.5 text-right font-mono tabular-nums",
                r.emphasis && "font-semibold",
              )}
            >
              {r.valueLabel}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
