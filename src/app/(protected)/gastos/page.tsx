import Link from "next/link";

import { BarList, type BarListItem } from "@/components/charts/bar-list";
import { formatEUR, formatPct } from "@/lib/format";
import { UNCATEGORIZED_LABEL } from "@/lib/db/marts";
import { currentPeriodKey, isProvisional } from "@/lib/period";
import { createClient } from "@/lib/supabase/server";

// Gastos / Spending (BI-03, D2-01, D2-15).
//
// "Where did the money go?" for the SELECTED month (the shared ?period=YYYYMM selector in
// the shell): a segmented 3-way breakdown (category / account / person) over a BarList, with
// the Uncategorized bucket ALWAYS shown (graceful degrade — never crash, never drop a row,
// Pattern 9 / D2-01); plus the category-as-%-of-revenue view (D2-15).
//
// All reads go through the @supabase/ssr server client under the user JWT + RLS — NEVER the
// Drizzle/postgres client and NEVER service_role (T-02-16 / RESEARCH Pitfall 3). The selected
// breakdown grain is its own URL param (?breakdown=) so it is shareable/bookmarkable and the
// toggle is a set of plain links (no client JS needed — works for Fernanda's mobile too).

type Grain = "category" | "account" | "person";

const GRAINS: { value: Grain; label: string }[] = [
  { value: "category", label: "Category" },
  { value: "account", label: "Account" },
  { value: "person", label: "Person" },
];

/** Parse/clamp the raw ?period search param to a valid YYYYMM int (mirrors Home, T-02-12). */
function parsePeriod(raw: string | undefined, currentKey: number): number {
  if (!raw || !/^\d{6}$/.test(raw)) return currentKey;
  const key = Number(raw);
  const month = key % 100;
  if (month < 1 || month > 12) return currentKey;
  if (key > currentKey) return currentKey;
  return key;
}

function parseGrain(raw: string | undefined): Grain {
  return raw === "account" || raw === "person" ? raw : "category";
}

/** numeric columns arrive from supabase-js as strings; parse to a finite number (0 fallback). */
function num(v: string | number | null | undefined): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export default async function GastosPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; breakdown?: string }>;
}) {
  const supabase = await createClient();
  const now = new Date();
  const currentKey = currentPeriodKey(now);
  const { period: rawPeriod, breakdown: rawBreakdown } = await searchParams;
  const period = parsePeriod(rawPeriod, currentKey);
  const grain = parseGrain(rawBreakdown);
  const provisional = isProvisional(period, now);

  // --- Reads (all under RLS via @supabase/ssr) -----------------------------------------
  // 1. The breakdown for the selected grain (Uncategorized always present — coalesce-backed).
  const { data: breakdownRows, error: breakdownError } = await supabase
    .from("v_category_breakdown")
    .select("period_key, grain, bucket_key, bucket_label, costs")
    .eq("period_key", period)
    .eq("grain", grain);

  // 2. Category-as-%-of-revenue (D2-15) for the selected period.
  const { data: pctRows, error: pctError } = await supabase
    .from("v_pct_of_revenue")
    .select("category_id, category_label, category_cost, revenue, pct_of_revenue")
    .eq("period_key", period);

  if (breakdownError || pctError) {
    return (
      <p role="alert" className="text-sm text-[var(--loss)]">
        Couldn&apos;t load this view. The data sync may be in progress. Refresh in a moment;
        if it persists, check the connection on Config.
      </p>
    );
  }

  // --- Build the BarList (biggest-first; Uncategorized pinned as its own grey bar) --------
  const rows = (breakdownRows ?? []).map((r) => ({
    label: r.bucket_label,
    value: Math.abs(num(r.costs)),
    isUncategorized: r.bucket_label === UNCATEGORIZED_LABEL || r.bucket_key === null,
  }));

  const categorized = rows
    .filter((r) => !r.isUncategorized)
    .sort((a, b) => b.value - a.value);
  // The Uncategorized bucket: always rendered (D2-01), even at €0, as its own grey bar.
  const uncategorized = rows.find((r) => r.isUncategorized) ?? {
    label: UNCATEGORIZED_LABEL,
    value: 0,
    isUncategorized: true,
  };

  const barItems: BarListItem[] = [
    ...categorized.map((r) => ({
      label: r.label,
      value: r.value,
      valueLabel: formatEUR(r.value),
    })),
    {
      label: UNCATEGORIZED_LABEL,
      value: uncategorized.value,
      valueLabel: formatEUR(uncategorized.value),
      neutral: true,
      // Link to Transações to categorize (the grain only carries categories there).
      action:
        grain === "category"
          ? { href: "/transacoes?filter=uncategorized", text: "to categorize →" }
          : undefined,
    },
  ];

  const hasSpending = barItems.some((i) => i.value > 0);

  // --- %-of-revenue (D2-15): each category's cost as a share of NET revenue ----------------
  const pctItems = (pctRows ?? [])
    .map((r) => ({
      label: r.category_label,
      cost: Math.abs(num(r.category_cost)),
      // pct_of_revenue is a 0..1 ratio (or null when revenue=0); scale to whole percent.
      pct: r.pct_of_revenue === null ? null : num(r.pct_of_revenue) * 100,
    }))
    .filter((r) => r.cost > 0)
    .sort((a, b) => b.cost - a.cost);
  const hasRevenue = (pctRows ?? []).some((r) => num(r.revenue) > 0);

  return (
    <div className="space-y-12">
      {/* Page header (h1 left; the shared month selector lives in the shell top bar). */}
      <header className="flex items-center gap-3">
        <h1 className="text-xl font-semibold" lang="pt-BR">
          Gastos
        </h1>
        {provisional && (
          <span
            className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-[var(--warning)]"
            title="Month in progress; figures will change."
          >
            Provisional
          </span>
        )}
      </header>

      {/* --- Breakdown: a segmented 3-way toggle over a BarList (BI-03) --- */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-muted-foreground">Spending breakdown</h2>
          {/* Segmented toggle — plain links (?breakdown=), no client JS. */}
          <div
            role="tablist"
            aria-label="Breakdown grain"
            className="inline-flex rounded-lg border border-border bg-muted p-0.5"
          >
            {GRAINS.map((g) => {
              const active = g.value === grain;
              return (
                <Link
                  key={g.value}
                  role="tab"
                  aria-selected={active}
                  href={`/gastos?breakdown=${g.value}${rawPeriod ? `&period=${period}` : ""}`}
                  className={
                    active
                      ? "rounded-md bg-card px-3 py-1 text-sm font-medium text-foreground shadow-sm"
                      : "rounded-md px-3 py-1 text-sm text-muted-foreground hover:text-foreground"
                  }
                >
                  {g.label}
                </Link>
              );
            })}
          </div>
        </div>

        {hasSpending ? (
          <BarList items={barItems} ariaLabel={`Spending by ${grain}`} />
        ) : (
          // Empty / €0 month — calm grey, never blank (UI-SPEC §7). Uncategorized still shown.
          <div className="space-y-2">
            <p className="font-mono text-sm tabular-nums text-[var(--neutral-data)]">
              {formatEUR(0)} this month
            </p>
            <BarList items={barItems} ariaLabel={`Spending by ${grain}`} />
          </div>
        )}
      </section>

      {/* --- Category-as-%-of-revenue (D2-15) — first-class --- */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-muted-foreground">Share of net revenue</h2>
        {!hasRevenue ? (
          <p className="text-sm text-[var(--neutral-data)]">
            No revenue this month — share of revenue unlocks once salary lands.
          </p>
        ) : pctItems.length === 0 ? (
          <p className="text-sm text-[var(--neutral-data)]">
            {formatEUR(0)} in costs this month.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {pctItems.map((r, idx) => (
              <li
                key={`${r.label}-${idx}`}
                className="flex items-baseline justify-between gap-4 border-b border-border pb-2 text-sm last:border-0"
              >
                <span className="truncate">{r.label}</span>
                <span className="shrink-0 font-mono tabular-nums">
                  {formatEUR(r.cost)}
                  <span className="ml-2 text-muted-foreground">
                    {r.pct === null ? "—" : `${formatPct(r.pct)} of net revenue`}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
