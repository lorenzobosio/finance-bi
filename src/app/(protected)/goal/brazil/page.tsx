import { Plane } from "lucide-react";

import { CategoryDonut, type DonutSlice } from "@/components/charts/category-donut";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { setTravelWindowForm } from "@/lib/actions/set-travel-window";
import { isDemoForReads } from "@/lib/demo/mode";
import { formatEUR } from "@/lib/format";
import {
  foldAllocation,
  type AllocationEvent,
} from "@/lib/goal/allocation";
import { readHouseholdConfig, type HouseholdReadClient } from "@/lib/goal/household";
import { currentPeriodKey } from "@/lib/period";
import { createClient } from "@/lib/supabase/server";

// The Brazil bucket page (`/goal/brazil`) — GOAL-13. Brazil is one of the two life-goal sinking
// funds (the trips home): this page makes it tangible with its accumulated cost basis (the waterfall
// bucket balance), a per-category tagged-spend list, a per-bucket category donut (VIZ-01 scoped to
// cost_center='brazil'), and the tag CTAs. A bucket in debt (negative balance) is shown factually in
// `--loss` with the "next transfer settles this first" framing (D5-06/GOAL-09) — never blame.
//
// Reads go through @supabase/ssr under RLS, partitioned by is_demo (T-05-17) — NEVER src/lib/db/marts
// (D3-13). The tagged spend reads the `v_bucket_spend` mart directly (typed via database.types). All
// €/% via formatEUR/formatPct (de-DE). English-only labels.

/** numeric columns arrive from supabase-js as strings; parse to a finite number (0 fallback). */
function num(v: string | number | null | undefined): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** A period_key (YYYYMM) → an English "Mon YYYY" caption (UTC — no locale leakage). */
function periodLabel(key: number): string {
  const year = Math.floor(key / 100);
  const month = key % 100;
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default async function BrazilPage() {
  const supabase = await createClient();
  const now = new Date();
  const currentKey = currentPeriodKey(now);
  const year = Math.floor(currentKey / 100);

  // Demo-mode partition selector (T-05-17): every read filters to ONE partition (no demo↔real blend).
  const demoFilter = await isDemoForReads();

  // The household singleton — launch_date gates the whole journey; NULL = pre-launch.
  const household = await readHouseholdConfig(
    supabase as unknown as HouseholdReadClient,
    demoFilter,
  );
  const launchDate = household.launchDate;

  // Fold the launch-gated monthly investimento through the pure waterfall → the Brazil balance.
  const { data: allPnl } = await supabase
    .from("v_pnl_monthly")
    .select("period_key, investimento")
    .eq("is_demo", demoFilter);

  const investEvents: AllocationEvent[] = (allPnl ?? [])
    .slice()
    .sort((a, b) => Number(a.period_key) - Number(b.period_key))
    .filter((r) => num(r.investimento) > 0)
    .map((r) => {
      const key = Number(r.period_key);
      const mm = String(key % 100).padStart(2, "0");
      return {
        kind: "transfer" as const,
        amount: num(r.investimento),
        bookingDate: `${Math.floor(key / 100)}-${mm}-01`,
        id: key,
      };
    });

  const goalState = foldAllocation(investEvents, { launchDate });
  const brazil = goalState.brazil; // the accumulated cost basis (may be negative = debt).

  // Tagged spend for this bucket (v_bucket_spend, demo-partitioned) — one read serves the donut
  // (month + year) AND the accumulated per-category list.
  const { data: spendRows } = await supabase
    .from("v_bucket_spend")
    .select("period_key, category_label, costs")
    .eq("cost_center", "brazil")
    .eq("is_demo", demoFilter);

  const monthSlices: DonutSlice[] = (spendRows ?? [])
    .filter((r) => Number(r.period_key) === currentKey)
    .map((r) => ({ label: r.category_label, value: Math.abs(num(r.costs)) }));

  const yearByLabel = new Map<string, number>();
  const allByLabel = new Map<string, number>();
  for (const r of spendRows ?? []) {
    const v = Math.abs(num(r.costs));
    allByLabel.set(r.category_label, (allByLabel.get(r.category_label) ?? 0) + v);
    if (Math.floor(Number(r.period_key) / 100) === year) {
      yearByLabel.set(r.category_label, (yearByLabel.get(r.category_label) ?? 0) + v);
    }
  }
  const yearSlices: DonutSlice[] = [...yearByLabel.entries()].map(([label, value]) => ({
    label,
    value,
  }));
  const taggedList = [...allByLabel.entries()]
    .map(([label, value]) => ({ label, value }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value);
  const taggedTotal = taggedList.reduce((acc, r) => acc + r.value, 0);

  return (
    <div className="@container/main space-y-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Plane aria-hidden="true" className="size-5 text-[var(--brand)]" />
          <h1 className="text-xl font-semibold">Brazil</h1>
        </div>
      </header>

      {/* Accumulated cost basis — the bucket balance from the waterfall. Debt framing when negative. */}
      <section className="rounded-xl bg-card p-6 ring-1 ring-foreground/10">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Accumulated
        </div>
        <div
          className={`mt-2 font-mono text-3xl font-semibold tabular-nums leading-none ${brazil < 0 ? "text-[var(--loss)]" : ""}`}
        >
          {formatEUR(brazil, 0)}
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          {brazil < 0
            ? `Brazil is ${formatEUR(-brazil, 0)} behind — the next transfer settles this first.`
            : "The trips home — filled after Wealth each month."}
        </p>
      </section>

      {/* Tag CTAs — reuse the Phase-2 recategorize gesture (link) + the date-range travel window. */}
      <section
        aria-label="Tag spending to Brazil"
        className="flex flex-wrap items-end gap-4 rounded-xl bg-card p-6 ring-1 ring-foreground/10"
      >
        <a
          href="/transactions"
          className="inline-flex min-h-11 items-center justify-center rounded-md bg-[var(--brand)] px-5 text-sm font-medium text-white transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          Tag spending to Brazil
        </a>
        {/* Set a travel window — a native date range + a server-action form (no client JS). */}
        <form action={setTravelWindowForm} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="costCenter" value="brazil" />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="brazil-from" className="text-xs font-medium text-muted-foreground">
              From
            </label>
            <input
              id="brazil-from"
              name="from"
              type="date"
              required
              className="min-h-11 rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="brazil-to" className="text-xs font-medium text-muted-foreground">
              To
            </label>
            <input
              id="brazil-to"
              name="to"
              type="date"
              required
              className="min-h-11 rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            />
          </div>
          <button
            type="submit"
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-input bg-background px-4 text-sm font-medium transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            Set a travel window
          </button>
        </form>
      </section>

      {/* Per-bucket category donut (VIZ-01, scoped to Brazil). */}
      <Card>
        <CardContent className="pt-6">
          <CategoryDonut
            month={monthSlices}
            year={yearSlices}
            title="Brazil spending by category"
            monthLabel={periodLabel(currentKey)}
            yearLabel={String(year)}
          />
        </CardContent>
      </Card>

      {/* Accumulated tagged-spend list. */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-muted-foreground">
            Tagged spending
          </CardTitle>
        </CardHeader>
        <CardContent>
          {taggedList.length === 0 ? (
            <p className="text-sm text-[var(--neutral-data)]">
              No spending tagged to Brazil yet — tag transactions or set a travel window above.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {taggedList.map((r, idx) => (
                <li
                  key={`${r.label}-${idx}`}
                  className="flex items-baseline justify-between gap-4 border-b border-border pb-2 text-sm last:border-0"
                >
                  <span className="truncate">{r.label}</span>
                  <span className="shrink-0 font-mono tabular-nums">{formatEUR(r.value)}</span>
                </li>
              ))}
              <li className="flex items-baseline justify-between gap-4 pt-2 text-sm font-semibold">
                <span>Total</span>
                <span className="font-mono tabular-nums">{formatEUR(taggedTotal)}</span>
              </li>
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
