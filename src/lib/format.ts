// Single source of truth for money/percent formatting (BI-05).
//
// UI-SPEC §Charting "Number formatting — single source of truth": ALL money and
// percent values in the app flow through these two helpers — no page hand-rolls
// `Intl`. This is the de-DE convention (period thousands, comma decimal) with the
// `€` prefixed to match the app's money convention, and the German non-breaking
// space before `%`. Keeping `new Intl.NumberFormat` confined to THIS file is the
// guard the format.test.ts grep enforces.

// The German non-breaking space (U+00A0) placed between the number and the `%`
// (the `12,4 %` convention). Named so the intent survives editors that collapse it.
const NBSP = " ";

/**
 * Format a EUR amount in the de-DE convention with the `€` prefixed:
 * `formatEUR(5038)` → `"€5.038,00"`, `formatEUR(820.5)` → `"€820,50"`.
 *
 * `decimals` controls both the min and max fraction digits — pass `0` for hero KPI
 * values (`formatEUR(42180, 0)` → `"€42.180"`), default `2` for tables/P&L.
 *
 * Negatives lead with a minus on the WHOLE token (`-€42,18`), never parentheses and
 * never `€-42,18`. `Intl` would otherwise place the minus before the digits (inside
 * the `€` prefix), so we format the absolute value and re-prefix `-€` ourselves.
 */
export function formatEUR(n: number, decimals?: number): string {
  const fractionDigits = decimals ?? 2;
  const formatter = new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
  const isNegative = n < 0;
  const body = formatter.format(Math.abs(n));
  return `${isNegative ? "-" : ""}€${body}`;
}

/**
 * Format a percentage in the de-DE convention with ONE decimal MAX and the German
 * non-breaking space before `%`: `formatPct(12.4)` → `"12,4 %"`, `formatPct(0)` → `"0 %"`.
 *
 * "One decimal max" (not fixed): whole values drop the decimal (`0` → `"0 %"`, not
 * `"0,0 %"`) per the UI-SPEC examples, so `minimumFractionDigits` is 0 and the max is 1.
 *
 * The caller passes the percentage value already scaled to whole-percent units
 * (e.g. `12.4` for 12.4 %), not a 0–1 ratio.
 */
export function formatPct(n: number): string {
  const body = new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  }).format(n);
  return `${body}${NBSP}%`;
}
