"use client";

import NumberFlow, { type Format } from "@number-flow/react";

// de-DE count-up wrapper (DSN-03). A thin client island over @number-flow/react that animates
// a number toward its value with de-DE grouping/decimals — used on the hero €100k number, the
// €4k KPI, and the margin %. @number-flow respects prefers-reduced-motion NATIVELY (it reads
// the media query), so under reduced-motion it snaps to the final value instantly — no extra
// gate needed beyond the root <MotionConfig reducedMotion="user">.
//
// IMPORTANT: this is the ANIMATION layer only. The de-DE formatters in src/lib/format.ts stay
// the single source of truth for all STATIC text; here we mirror their Intl options on the
// `format`/`locales` props (verified on 0.6.0: `locales` is a SEPARATE prop from `format`).

interface CountUpProps {
  /** The numeric value to count toward. */
  value: number;
  /** @number-flow Format options (Intl.NumberFormat subset; e.g. currency EUR, 0 digits). */
  format?: Format;
  prefix?: string;
  suffix?: string;
  className?: string;
}

/** Animated de-DE count-up. Defaults to a whole-euro currency format. */
export function CountUp({
  value,
  format = { style: "currency", currency: "EUR", maximumFractionDigits: 0 },
  prefix,
  suffix,
  className,
}: CountUpProps) {
  return (
    <NumberFlow
      value={value}
      locales="de-DE"
      format={format}
      prefix={prefix}
      suffix={suffix}
      willChange
      className={className}
    />
  );
}
