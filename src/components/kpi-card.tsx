import {
  CircleCheck,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

// KpiCard — the single reusable headline-KPI card (UI-SPEC §1 anatomy).
//
// Anatomy:
//   1. Label (14px/600 muted) + a small lucide glyph (aria-hidden — meaning is in text).
//   2. Big value (Display 32px/600 mono) — already formatted via formatEUR/formatPct by the
//      caller (this component never calls Intl).
//   3. A status/delta row: EITHER a delta chip (TrendingUp/Down + signed text, --gain/--loss)
//      OR a status pill (CircleCheck/TriangleAlert + label, semantic tone).
//   4. An optional mini-viz slot (ProgressBar / sparkline).
//
// Color is NEVER the only signal — every status carries icon + text + color (UI-SPEC §Color).
// The whole card is an optional drill-down link (href) — the chevron affordance is the
// hover ring. The €100k hero gets emphasis through STRUCTURE (the caller passes `emphasis`
// → elevated surface + ring), never a larger font.

import Link from "next/link";

export type KpiTone = "gain" | "loss" | "warning" | "neutral";

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

export interface KpiDelta {
  /** Pre-formatted delta text, e.g. "+€320" or "▲ 4,1 %" (caller formats via formatEUR/Pct). */
  text: string;
  direction: "up" | "down";
  tone: KpiTone;
}

export interface KpiStatus {
  /** Pre-formatted status copy, e.g. "On track" / "Lorenzo over budget" / "Budgets not set". */
  label: string;
  tone: KpiTone;
}

export interface KpiCardProps {
  /** KPI label (e.g. "Invested (cost basis)"). */
  label: string;
  /** Small decorative lucide glyph for the label row. */
  icon: LucideIcon;
  /** The headline value, ALREADY formatted via formatEUR/formatPct (never raw). */
  value: string;
  /** A delta chip (vs last month) — mutually exclusive with `status` in practice. */
  delta?: KpiDelta;
  /** A status pill (On track / over budget / not set / provisional). */
  status?: KpiStatus;
  /** Optional mini-viz (ProgressBar / sparkline). */
  children?: React.ReactNode;
  /** Drill-down target — the whole card becomes a link. */
  href?: string;
  /** Structural hero emphasis (the €100k card): elevated surface + ring + desktop col-span. */
  emphasis?: boolean;
  className?: string;
}

export function KpiCard({
  label,
  icon: Icon,
  value,
  delta,
  status,
  children,
  href,
  emphasis = false,
  className,
}: KpiCardProps) {
  const DeltaIcon = delta?.direction === "down" ? TrendingDown : TrendingUp;
  const StatusIcon = status ? STATUS_ICON[status.tone] : null;

  const body = (
    <div
      className={cn(
        "flex h-full flex-col gap-3 rounded-xl border border-border bg-card p-6 text-card-foreground transition-shadow",
        emphasis && "ring-1 ring-primary/20 shadow-sm",
        href && "group-hover/card:shadow-sm",
        className,
      )}
    >
      {/* 1. Label + glyph */}
      <div className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
        <Icon aria-hidden="true" className="size-4 shrink-0" />
        <span>{label}</span>
      </div>

      {/* 2. Big value (mono, 32px/600) */}
      <div className="font-mono text-3xl font-semibold tabular-nums leading-none">
        {value}
      </div>

      {/* 3. Status / delta row */}
      {delta && (
        <div
          className={cn(
            "flex items-center gap-1 text-sm font-medium",
            TONE_TEXT[delta.tone],
          )}
        >
          <DeltaIcon aria-hidden="true" className="size-4 shrink-0" />
          <span>{delta.text}</span>
          <span className="text-muted-foreground">vs last month</span>
        </div>
      )}
      {status && StatusIcon && (
        <div
          className={cn(
            "flex items-center gap-1 text-sm font-medium",
            TONE_TEXT[status.tone],
          )}
        >
          <StatusIcon aria-hidden="true" className="size-4 shrink-0" />
          <span>{status.label}</span>
        </div>
      )}

      {/* 4. Optional mini-viz */}
      {children && <div className="mt-auto pt-1">{children}</div>}
    </div>
  );

  if (href) {
    return (
      <Link
        href={href}
        className={cn(
          "group/card block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring",
          emphasis && "md:col-span-2",
        )}
      >
        {body}
      </Link>
    );
  }

  return <div className={cn(emphasis && "md:col-span-2")}>{body}</div>;
}
