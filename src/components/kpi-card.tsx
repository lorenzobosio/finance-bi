"use client";

import {
  CircleCheck,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";

import Link from "next/link";

import { CountUp } from "@/components/motion/count-up";
import type { Format } from "@number-flow/react";
import { cn } from "@/lib/utils";

// KpiCard — the single reusable headline-KPI card (UI-SPEC §1 anatomy), re-skinned onto the
// elevation system (raised surface + 1px inset top-highlight + soft shadow; hover-lift only on
// `href` drill-down cards) and wired with the de-DE @number-flow count-up.
//
// Anatomy:
//   1. Eyebrow label (11px uppercase tracked muted) + a small lucide glyph (aria-hidden).
//   2. Big value (Display 32px/600 mono). Either a pre-formatted string (`value`) or — to opt
//      into the animated count-up — a raw number (`valueNumber` + `valueFormat`).
//   3. A status/delta row: EITHER a delta chip OR a status pill (semantic tone, icon + text).
//   4. An optional mini-viz slot (ProgressBar / sparkline).
//
// Color is NEVER the only signal — every status carries icon + text + color (UI-SPEC §Color).
// The €100k hero gets emphasis through STRUCTURE (`emphasis` → ring + col-span), never a bigger
// font. The €4k celebration moment (`celebrate`) fires a single brand-glow pulse — fully
// suppressed under reduced-motion (the `motion-reduce:` variant zeroes the animation).

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
  /** Pre-formatted delta text, e.g. "+€320" or "4,1 %" (caller formats via formatEUR/Pct). */
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
  /**
   * Small decorative glyph for the label row. Pass a RENDERED element (e.g. `<PiggyBank />`),
   * NOT a bare component reference — a Server Component cannot serialize a component/class across
   * the client boundary ("Only plain objects can be passed to Client Components").
   */
  icon: React.ReactNode;
  /** The headline value, ALREADY formatted via formatEUR/formatPct (used when no `valueNumber`). */
  value: string;
  /** Opt into the animated de-DE count-up: the raw numeric value (mutually exclusive with text-only `value`). */
  valueNumber?: number;
  /** @number-flow Format options for `valueNumber` (defaults to whole-euro currency). */
  valueFormat?: Format;
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
  /** The €4k celebration moment: a single brand-glow pulse (reduced-motion-suppressed). */
  celebrate?: boolean;
  className?: string;
}

export function KpiCard({
  label,
  icon,
  value,
  valueNumber,
  valueFormat,
  delta,
  status,
  children,
  href,
  emphasis = false,
  celebrate = false,
  className,
}: KpiCardProps) {
  const DeltaIcon = delta?.direction === "down" ? TrendingDown : TrendingUp;
  const StatusIcon = status ? STATUS_ICON[status.tone] : null;

  const body = (
    <div
      className={cn(
        "relative flex h-full flex-col gap-3 overflow-hidden rounded-xl bg-card p-6 text-card-foreground shadow-sm ring-1 ring-foreground/10 transition-shadow",
        // 1px inset top highlight (elevation system).
        "before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-foreground/10",
        emphasis && "ring-primary/25",
        href && "group-hover/card:shadow-md",
        className,
      )}
    >
      {/* The €4k celebration moment: a single brand-glow pulse, reduced-motion-suppressed. */}
      {celebrate && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 animate-pulse rounded-xl opacity-60 motion-reduce:animate-none motion-reduce:opacity-0"
          style={{
            background:
              "radial-gradient(80% 100% at 50% 0%, var(--brand-glow), transparent 70%)",
          }}
        />
      )}

      {/* 1. Eyebrow label + glyph */}
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <span
          aria-hidden="true"
          className="flex shrink-0 [&>svg]:size-4 [&>svg]:shrink-0"
        >
          {icon}
        </span>
        <span>{label}</span>
      </div>

      {/* 2. Big value (mono, 32px/600) — count-up when a raw number is supplied. */}
      <div className="font-mono text-3xl font-semibold tabular-nums leading-none">
        {valueNumber === undefined ? (
          value
        ) : (
          <CountUp value={valueNumber} format={valueFormat} />
        )}
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
            "flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-sm font-medium",
            TONE_TEXT[status.tone],
            // tinted-surface chip (UI-SPEC §Color) per tone.
            status.tone === "gain" && "bg-[var(--gain-fill)]/12",
            status.tone === "loss" && "bg-[var(--loss-fill)]/12",
            status.tone === "warning" && "bg-[var(--warning-fill)]/12",
            status.tone === "neutral" && "bg-muted",
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
