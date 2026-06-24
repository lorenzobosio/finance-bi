import Link from "next/link";

import { BarList, type BarListItem } from "@/components/charts/bar-list";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { costCenterDisplayName } from "@/lib/cost-center-display";
import { formatEUR, formatPct } from "@/lib/format";
import { currentPeriodKey, isProvisional } from "@/lib/period";
import { createClient } from "@/lib/supabase/server";
import { isDemoForReads } from "@/lib/demo/mode";

// Spending (BI-03, D2-01, D2-15).
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

// The Uncategorized bucket label — inlined as a plain string (FND-03 / T-03-16: this page must
// NOT import the Drizzle-backed `@/lib/db/marts` module, which would pull drizzle-orm into the
// RSC page bundle). Kept identical to `marts.UNCATEGORIZED_LABEL` (the mart coalesces to it).
const UNCATEGORIZED_LABEL = "Uncategorized";

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

export default async function SpendingPage({
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

  // Demo-mode partition selector (D4-12) — filter every mart read to one partition.
  const demoFilter = await isDemoForReads();

  // --- Reads (all under RLS via @supabase/ssr, partitioned by is_demo) -------------------
  // 1. The breakdown for the selected grain (Uncategorized always present — coalesce-backed).
  const { data: breakdownRows, error: breakdownError } = await supabase
    .from("v_category_breakdown")
    .select("period_key, grain, bucket_key, bucket_label, costs")
    .eq("period_key", period)
    .eq("grain", grain)
    .eq("is_demo", demoFilter);

  // 2. Category-as-%-of-revenue (D2-15) for the selected period.
  const { data: pctRows, error: pctError } = await supabase
    .from("v_pct_of_revenue")
    .select("category_id, category_label, category_cost, revenue, pct_of_revenue")
    .eq("period_key", period)
    .eq("is_demo", demoFilter);

  if (breakdownError || pctError) {
    return (
      <p role="alert" className="text-sm text-[var(--loss)]">
        Couldn&apos;t load this view. The data sync may be in progress. Refresh in a moment;
        if it persists, check the connection on Config.
      </p>
    );
  }

  // --- Build the BarList (biggest-first; Uncategorized pinned as its own grey bar) --------
  // NOTE (demo): the ACCOUNT grain shows blank/Unknown labels for anon. `accounts` carries real
  // account names and no is_demo, so it is intentionally NOT granted anon read (migration 0013) —
  // granting it would leak real account names. Blank account-grain labels in the demo are the
  // accepted casualty; category/person grains are fully labelled via the granted reference tables.
  // For the PERSON grain in demo mode, bucket_key is the cost-center code and bucket_label is the
  // DB label ("Lorenzo"/"Fernanda") — remap the LABEL to the anonymized persona (Alice/Bob). The
  // FK code/partition is unchanged (display-only — D4-08/26). Other grains pass through verbatim.
  const rows = (breakdownRows ?? []).map((r) => ({
    label:
      grain === "person" && r.bucket_key !== null
        ? costCenterDisplayName(r.bucket_key, r.bucket_label, demoFilter)
        : r.bucket_label,
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
      // Link to Transactions to categorize (the grain only carries categories there).
      action:
        grain === "category"
          ? { href: "/transactions?filter=uncategorized", text: "to categorize →" }
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
    <div className="@container/main space-y-6">
      {/* Page header (h1 left; the shared month selector lives in the shell top bar). */}
      <header className="flex items-center gap-3">
        <h1 className="text-xl font-semibold">Spending</h1>
        {provisional && (
          <span
            className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-[var(--warning)]"
            title="Month in progress; figures will change."
          >
            Provisional
          </span>
        )}
      </header>

      {/* --- Breakdown: a segmented 3-way ToggleGroup over a Card-wrapped BarList (BI-03) --- */}
      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-3 [&]:grid-cols-none [&]:flex">
          <CardTitle className="text-sm font-semibold text-muted-foreground">
            Spending breakdown
          </CardTitle>
          {/* Segmented toggle — each item is a real `?breakdown=` link (Fernanda no-JS path). */}
          <ToggleGroup
            type="single"
            value={grain}
            aria-label="Breakdown grain"
            variant="outline"
            size="sm"
            spacing={0}
          >
            {GRAINS.map((g) => {
              const active = g.value === grain;
              return (
                <ToggleGroupItem key={g.value} value={g.value} asChild>
                  <Link
                    data-state={active ? "on" : "off"}
                    aria-pressed={active}
                    href={`/spending?breakdown=${g.value}${rawPeriod ? `&period=${period}` : ""}`}
                  >
                    {g.label}
                  </Link>
                </ToggleGroupItem>
              );
            })}
          </ToggleGroup>
        </CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>

      {/* --- Category-as-%-of-revenue (D2-15) — first-class, in its own Card --- */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-muted-foreground">
            Share of net revenue
          </CardTitle>
        </CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>
    </div>
  );
}
