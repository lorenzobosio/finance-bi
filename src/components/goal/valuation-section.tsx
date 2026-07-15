"use client";

// src/components/goal/valuation-section.tsx — the Investments surface (ETF-02/05, UI-SPEC §1–3/§5).
//
// PRESENTATIONAL ONLY: it takes a plain `model` prop (no DB, no fetch, no clock — the /goal RSC does
// the reads/convert/compute and hands the shaped numbers down). It renders three things from existing
// primitives (NO new visual language): the market-value / cost-basis headline (KpiCard + CountUp), the
// calm unrealized-P/L row (the P/L Tone Rule), and the per-bucket allocation (CategoryDonut VERBATIM).
//
// The P/L Tone Rule (UI-SPEC §Color, load-bearing): P/L ≥ 0 → --gain / TrendingUp / "+" / KpiTone
// "gain"; P/L < 0 → --warning (calm amber) / TrendingDown / "−" / KpiTone "warning" — NEVER --loss /
// --destructive / red. The row is HIDDEN (not €0) when `unrealizedPnl === null` (unpriced) — absence
// shown as absence. When unpriced the headline is labelled "(cost basis)" with a calm --neutral-data
// caption, never a fake €0 market figure (Pitfall 5). Allocation share carries NO gain/loss meaning —
// CategoryDonut's neutral greyscale ramp only.

import { PiggyBank, TrendingDown, TrendingUp } from "lucide-react";

import type { Format } from "@number-flow/react";

import { CategoryDonut } from "@/components/charts/category-donut";
import { KpiCard } from "@/components/kpi-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { formatEUR, formatPct } from "@/lib/format";

/** One bucket's contribution to the allocation view: its (market or cost-basis) value + % share. */
export interface ValuationBucket {
  label: string;
  /** Market value when priced, cost basis when not. */
  value: number;
  /** Percent of the allocation total (0–100). */
  share: number;
}

/** The fully-shaped, DB-free model the /goal RSC computes and hands to this presentational section. */
export interface ValuationModel {
  /** True when a live price exists; false → honest cost-basis fallback. */
  priced: boolean;
  /** Total market value (units × latest EUR close), or null when unpriced. */
  marketValue: number | null;
  /** Unrealized P/L (marketValue − costBasis), or null when unpriced (row hidden, never €0). */
  unrealizedPnl: number | null;
  /** Total cost basis (Σ contributions) — the honest fallback figure when unpriced. */
  costBasis: number;
  /** The as-of date of the latest price ("YYYY-MM-DD"), or null when unpriced. */
  pricedAsOf: string | null;
  /** Per-bucket allocation (Wealth / Brazil / Adventures). */
  perBucket: ValuationBucket[];
}

const EUR0: Format = { style: "currency", currency: "EUR", maximumFractionDigits: 0 };
const EUR0_SIGNED: Format = {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
  signDisplay: "always",
};

export function ValuationSection({ model }: { model: ValuationModel }) {
  const { priced, marketValue, unrealizedPnl, costBasis, pricedAsOf, perBucket } = model;

  const headlineValue = priced && marketValue !== null ? marketValue : costBasis;
  // The P/L row is shown ONLY when there is a live price to compare against (null ⇒ hidden, never €0).
  const showPnl = unrealizedPnl !== null;
  const gain = showPnl && unrealizedPnl >= 0;
  const pnlAbs = showPnl ? Math.abs(unrealizedPnl) : 0;

  const donutSlices = perBucket.map((b) => ({ label: b.label, value: b.value }));

  return (
    <section aria-label="Investments — market value and allocation" className="space-y-6">
      <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Investments
      </h2>

      <div className="grid grid-cols-1 gap-4 @xl/main:grid-cols-2">
        {/* Headline: market value when priced; the honest "(cost basis)" fallback when not. */}
        <KpiCard
          label={priced ? "Market value" : "Invested (cost basis)"}
          icon={<PiggyBank />}
          value={formatEUR(headlineValue, 0)}
          valueNumber={headlineValue}
          valueFormat={EUR0}
        >
          <p className="text-xs text-[var(--neutral-data)]">
            {priced
              ? `Priced ${pricedAsOf ?? ""}`.trim()
              : "No live price yet — showing what you put in"}
          </p>
        </KpiCard>

        {/* Unrealized P/L — calm tone rule; the whole card is hidden when unpriced (absence as absence). */}
        {showPnl && (
          <KpiCard
            label="Unrealized P/L"
            icon={gain ? <TrendingUp /> : <TrendingDown />}
            value={`${gain ? "+" : "−"}${formatEUR(pnlAbs, 0)}`}
            valueNumber={unrealizedPnl}
            valueFormat={EUR0_SIGNED}
            status={{
              label: gain
                ? `Up ${formatEUR(pnlAbs, 0)} since cost`
                : `Down ${formatEUR(pnlAbs, 0)} since cost`,
              tone: gain ? "gain" : "warning",
            }}
          />
        )}
      </div>

      {/* The calm honest-fallback banner (default/neutral, role=status — NEVER destructive/red). */}
      {!priced && (
        <Alert role="status">
          <AlertTitle>No live price yet</AlertTitle>
          <AlertDescription>
            Live ETF pricing isn&apos;t connected yet. Figures show cost basis until a price arrives.
          </AlertDescription>
        </Alert>
      )}

      {/* Allocation by bucket — CategoryDonut VERBATIM (neutral ramp + legend + Show data table). The
          per-bucket share is NEUTRAL: it carries no gain/loss, so no --gain/--warning here. */}
      <div className="rounded-xl bg-card p-6 ring-1 ring-foreground/10">
        <CategoryDonut
          month={donutSlices}
          year={donutSlices}
          title="Allocation by bucket"
          monthLabel="By bucket"
          yearLabel="By bucket"
        />

        {/* Per-bucket (market or cost-basis) value mini-rows alongside their share. */}
        <ul className="mt-4 space-y-1.5 text-sm">
          {perBucket.map((b) => (
            <li key={b.label} className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">
                {b.label}
                {!priced && <span className="text-[var(--neutral-data)]"> (cost basis)</span>}
              </span>
              <span className="font-mono tabular-nums">
                {formatEUR(b.value, 0)} · {formatPct(b.share)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
