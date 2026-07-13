"use client";

// BusinessReadCard — the house-as-business wedge, reframed to BI-08 / D5-19. The HEADLINE is now the
// OPERATING MARGIN (revenue − costs + sublet_net) in € with its % of revenue — investing is NOT an
// operating cost, so it is moved BELOW THE LINE as pay-yourself-first, never the old red "−44,5 %"
// loss tag. The compact read:
//
//   Revenue                 €5.038
//   − Costs                 €X
//   + Sublet net            €X
//   = Operating margin      €X       (the headline row — gain-green)
//   ────────────────────────────────  (below the line — pay yourself first)
//   − Investimento          €4.000   (neutral — feeds the €100k goal, not a cost)
//   = Net after investment  €X       (the only genuinely gain/loss-colored row)
//
// Operating margin (locked, marts.operatingMargin / D5-19): revenue − costs + sublet_net, labeled
// "% of revenue". Net after investment is the locked householdResult (revenue − investimento − costs
// + sublet_net) — both are computed upstream in the page (no marts import in src/app) and passed in.
//
// All amounts arrive pre-formatted via formatEUR (this island never calls Intl); the margin %
// animates via the de-DE CountUp. The whole card drills to /spending (P&L surface).

import Link from "next/link";

import { CountUp } from "@/components/motion/count-up";
import { formatEUR, formatPct } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface BusinessReadCardProps {
  /** Operating margin in € (revenue − costs + sublet_net) — the headline (BI-08). */
  operatingMargin: number;
  /** Operating margin as a 0–1 ratio of revenue, or null when there is no revenue this month. */
  operatingMarginPct: number | null;
  revenue: number;
  investimento: number;
  costs: number;
  subletNet: number;
  /** Net after investment = the locked householdResult (revenue − investimento − costs + sublet). */
  netAfterInvestment: number;
  /** Drill-down target (the P&L / spending surface). */
  href?: string;
  className?: string;
}

interface PnlRow {
  label: string;
  value: number;
  /** The operating-margin subtotal row (the headline figure, gain-toned). */
  isMargin?: boolean;
  /** The net-after-investment row — the only genuinely gain/loss-colored line. */
  isNet?: boolean;
}

export function BusinessReadCard({
  operatingMargin,
  operatingMarginPct,
  revenue,
  investimento,
  costs,
  subletNet,
  netAfterInvestment,
  href = "/spending",
  className,
}: BusinessReadCardProps) {
  // Above-the-line: how the operating business performed (investing sits below the line — BI-08).
  const aboveLine: PnlRow[] = [
    { label: "Revenue", value: revenue },
    { label: "− Costs", value: costs },
    { label: "+ Sublet net", value: subletNet },
    { label: "= Operating margin", value: operatingMargin, isMargin: true },
  ];
  // Below-the-line: pay-yourself-first — investimento feeds the €100k goal, then the net result.
  const belowLine: PnlRow[] = [
    { label: "− Investimento", value: investimento },
    { label: "= Net after investment", value: netAfterInvestment, isNet: true },
  ];

  const renderRow = (r: PnlRow, opts: { topBorder?: boolean } = {}) => (
    <div
      key={r.label}
      className={cn(
        "flex items-baseline justify-between gap-3",
        opts.topBorder && "border-t border-border pt-1.5",
      )}
    >
      <dt
        className={cn(
          "flex items-center gap-1.5",
          r.isMargin || r.isNet ? "font-semibold text-foreground" : "text-muted-foreground",
        )}
      >
        {r.label}
      </dt>
      <dd
        className={cn(
          "font-mono tabular-nums",
          r.isMargin
            ? "font-semibold text-[var(--gain)]"
            : r.isNet
              ? r.value >= 0
                ? "font-semibold text-[var(--gain)]"
                : "font-semibold text-[var(--loss)]"
              : "text-foreground",
        )}
      >
        {formatEUR(r.value)}
      </dd>
    </div>
  );

  const body = (
    <div
      className={cn(
        "relative flex h-full flex-col gap-4 overflow-hidden rounded-xl bg-card p-6 text-card-foreground shadow-sm ring-1 ring-foreground/10 transition-shadow",
        "before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-foreground/10",
        href && "group-hover/card:shadow-md",
        className,
      )}
    >
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Operating margin
      </div>

      <div>
        <div className="font-mono text-3xl font-semibold tabular-nums leading-none">
          <CountUp value={operatingMargin} />
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {operatingMarginPct === null ? "— of revenue" : `${formatPct(operatingMarginPct * 100)} of revenue`}
        </p>
      </div>

      {/* Compact P&L — operating result above the line, pay-yourself-first below it. */}
      <dl className="mt-auto space-y-1.5 text-sm">
        {aboveLine.map((r) => renderRow(r, { topBorder: r.isMargin }))}
        {/* Below the line — investing is not an operating cost (BI-08); pay yourself first. */}
        <p className="pt-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Below the line — pay yourself first
        </p>
        {belowLine.map((r) => renderRow(r, { topBorder: r.isNet }))}
      </dl>
    </div>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="group/card block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {body}
      </Link>
    );
  }
  return body;
}
