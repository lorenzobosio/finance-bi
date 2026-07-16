// ProgressBar — Tremor Raw block (copy-paste source the team owns), adapted to the app's
// semantic palette + a11y contract (UI-SPEC §Charting / §Accessibility).
//
// Tremor Raw imports the class-merge util as `cx` (aliased in @/lib/utils — FND-06), so the
// block copies essentially unmodified. Adaptations:
//   • Variants map to the semantic finance tokens (--gain / --loss / --warning / --primary).
//   • A real `role="progressbar"` with aria-valuenow/min/max (UI-SPEC a11y — a screen-reader
//     user never depends on the SVG/bar fill; the value is also exposed as visible mono text
//     by the caller).
//   • Honors prefers-reduced-motion via Tailwind's `motion-reduce:` (no fill transition).

import { cx } from "@/lib/utils";

const VARIANT_FILL = {
  default: "bg-primary",
  gain: "bg-[var(--gain-fill)]",
  loss: "bg-[var(--loss-fill)]",
  warning: "bg-[var(--warning-fill)]",
  neutral: "bg-[var(--neutral-data)]",
} as const;

export type ProgressBarVariant = keyof typeof VARIANT_FILL;

export interface ProgressBarProps extends React.HTMLAttributes<HTMLDivElement> {
  /** 0–100 percentage of the track that is filled. Clamped to [0, 100]. */
  value: number;
  /** The raw value max the percentage represents (for aria), defaults to 100. */
  max?: number;
  variant?: ProgressBarVariant;
  /** Accessible label for the bar (e.g. "Progress toward €100.000"). */
  label?: string;
  /** Text alternative announced to assistive tech (e.g. "€42.180 of €100.000"). */
  valueText?: string;
}

export function ProgressBar({
  value,
  max = 100,
  variant = "default",
  label,
  valueText,
  className,
  ...props
}: ProgressBarProps) {
  const pct = Math.min(100, Math.max(0, value));

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuetext={valueText}
      className={cx(
        "relative flex h-2 w-full items-center overflow-hidden rounded-full bg-muted",
        className,
      )}
      {...props}
    >
      <div
        className={cx(
          "h-full rounded-full transition-all duration-300 ease-out motion-reduce:transition-none",
          VARIANT_FILL[variant],
        )}
        style={{ width: `${pct}%` }}
      />
      {/* aria-hidden — the numeric truth lives in aria-valuenow/valuetext + the caller's
          visible mono value; the bar fill is purely visual (max is acknowledged for callers
          that pass a raw scale). */}
      <span hidden aria-hidden="true" data-max={max} />
    </div>
  );
}
