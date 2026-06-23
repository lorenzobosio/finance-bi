"use client";

// BusinessReadCard — the house-as-business wedge made PROMINENT (D3-06). A raised card with the
// big OPERATING MARGIN % (32px mono, count-up) + "% of net revenue" sub, plus a compact P&L read:
//
//   Revenue            €5.038
//   − Investimento     €4.000   (excluded — not a cost; the margin math excludes it)
//   − Costs            €X
//   + Sublet net       €X
//   = Result           €X       (the ONLY colored row — gain/loss)
//
// Margin formula (locked, UI-SPEC §Conventions): (revenue − investimento − costs + sublet_net) ÷
// revenue, labeled "% of net revenue". The margin value itself is computed upstream in the page
// from the corrected marts (DSN-06b) and passed in as a 0–1 ratio (null when revenue is 0).
//
// All amounts arrive pre-formatted via formatEUR (this island never calls Intl); the margin %
// animates via the de-DE CountUp. The whole card drills to /spending (P&L surface).

import Link from "next/link";

import { CountUp } from "@/components/motion/count-up";
import { formatEUR } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface BusinessReadCardProps {
  /** Operating margin as a 0–1 ratio, or null when there is no revenue this month. */
  margin: number | null;
  revenue: number;
  investimento: number;
  costs: number;
  subletNet: number;
  result: number;
  /** Drill-down target (the P&L / spending surface). */
  href?: string;
  className?: string;
}

interface PnlRow {
  label: string;
  value: number;
  /** "excluded" tag (investimento — not a cost). */
  excluded?: boolean;
  /** The Result row — the only colored one. */
  isResult?: boolean;
}

export function BusinessReadCard({
  margin,
  revenue,
  investimento,
  costs,
  subletNet,
  result,
  href = "/spending",
  className,
}: BusinessReadCardProps) {
  const rows: PnlRow[] = [
    { label: "Revenue", value: revenue },
    { label: "− Investimento", value: investimento, excluded: true },
    { label: "− Costs", value: costs },
    { label: "+ Sublet net", value: subletNet },
    { label: "= Result", value: result, isResult: true },
  ];

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
          {margin === null ? (
            <span aria-hidden="true">—</span>
          ) : (
            <CountUp
              value={margin * 100}
              format={{ maximumFractionDigits: 1 }}
              suffix=" %"
            />
          )}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">% of net revenue</p>
      </div>

      {/* Compact P&L read — only the Result row is colored. */}
      <dl className="mt-auto space-y-1.5 text-sm">
        {rows.map((r) => (
          <div
            key={r.label}
            className={cn(
              "flex items-baseline justify-between gap-3",
              r.isResult && "border-t border-border pt-1.5",
            )}
          >
            <dt
              className={cn(
                "flex items-center gap-1.5",
                r.isResult ? "font-semibold text-foreground" : "text-muted-foreground",
              )}
            >
              {r.label}
              {r.excluded && (
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  excluded
                </span>
              )}
            </dt>
            <dd
              className={cn(
                "font-mono tabular-nums",
                r.isResult
                  ? r.value >= 0
                    ? "font-semibold text-[var(--gain)]"
                    : "font-semibold text-[var(--loss)]"
                  : "text-foreground",
              )}
            >
              {formatEUR(r.value)}
            </dd>
          </div>
        ))}
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
