import { Lock, Mountain, TrendingUp } from "lucide-react";

import { CategoryDonut, type DonutSlice } from "@/components/charts/category-donut";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toggleEpicTripForm } from "@/lib/actions/toggle-epic-trip";
import { demoAwareNow, isDemoForReads } from "@/lib/demo/mode";
import { formatEUR } from "@/lib/format";
import { accruingParts } from "@/lib/goal/adventures-view";
import {
  foldAllocation,
  spendableAdventuresSmall,
  type AllocationEvent,
} from "@/lib/goal/allocation";
import { readHouseholdConfig, type HouseholdReadClient } from "@/lib/goal/household";
import { currentPeriodKey } from "@/lib/period";
import { createClient } from "@/lib/supabase/server";

// The Adventures bucket page (`/goal/adventures`) — GOAL-10 / GOAL-13, D5-10/11. Adventures is the
// bigger-journeys sinking fund, and it carries the €10k HARD-LOCK (RESEARCH Pitfall 2): money accrued
// after a €10k Wealth gate stays LOCKED until the next gate releases it. The page therefore shows TWO
// explicit numbers — "Spendable now" (prominent, the unlocked-at-last-gate pool ONLY, via
// spendableAdventuresSmall) and "Accruing (unlocks at €Nk)" (secondary) — plus a next-gate marker, so
// overspend-by-confusion is impossible. The epic-trip toggle is the REAL household's reachable WRITE
// path (D5-10 Q2): submitting the progressive-enhancement form flips household.epic_trip_active, which
// re-routes Adventures spend to the big tranche.
//
// Reads go through @supabase/ssr under RLS, partitioned by is_demo (T-05-17) — NEVER src/lib/db/marts
// (D3-13). All €/% via formatEUR (de-DE). English-only labels.

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

/** A euro threshold → a compact "€Nk" label (e.g. 30000 → "€30k"). */
function kLabel(eur: number): string {
  return `€${Math.round(eur / 1000)}k`;
}

export default async function AdventuresPage() {
  const supabase = await createClient();
  // Demo-mode partition selector (T-05-17) resolved FIRST so the display clock can be demo-anchored
  // (G1/D5-16): every read filters to ONE partition (no demo↔real blend). Real mode is identical.
  const demoFilter = await isDemoForReads();
  const now = demoAwareNow(demoFilter, new Date());
  const currentKey = currentPeriodKey(now);
  const year = Math.floor(currentKey / 100);

  // The household singleton — launch_date gates the journey; epic_trip_active gates the big tranche.
  const household = await readHouseholdConfig(
    supabase as unknown as HouseholdReadClient,
    demoFilter,
  );
  const launchDate = household.launchDate;
  const epicTripActive = household.epicTripActive;

  // Fold the launch-gated monthly investimento through the pure waterfall → the Adventures pools.
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

  // THE hard-lock display (D5-11): "Spendable now" is the UNLOCKED-at-last-gate pool ONLY (never
  // including the locked accrual). The locked money is decomposed honestly per pool (G5): the small
  // tranche unlocks at the next €10k Wealth gate, the big (epic-trip) pool at €100k — one row each,
  // each with its TRUE threshold (never a single false "next €10k" claim covering the big pool).
  const spendable = spendableAdventuresSmall(goalState); // advSmallUnlocked ONLY.
  const parts = accruingParts(goalState);

  // Tagged spend for this bucket (v_bucket_spend, demo-partitioned) — one read serves the donut
  // (month + year) AND the accumulated per-category list.
  const { data: spendRows } = await supabase
    .from("v_bucket_spend")
    .select("period_key, category_label, costs")
    .eq("cost_center", "adventures")
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
          <Mountain aria-hidden="true" className="size-5 text-[var(--brand)]" />
          <h1 className="text-xl font-semibold">Adventures</h1>
        </div>
      </header>

      {/* THE hard-lock two-number display (D5-11): Spendable prominent, Accruing secondary + gate marker. */}
      <section className="rounded-xl bg-card p-6 ring-1 ring-foreground/10">
        {/* Spendable now — the unlocked-at-last-gate pool ONLY. Prominent, --gain when >0. */}
        <div className="text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground">
          Spendable now
        </div>
        <div
          className={`mt-2 flex items-center gap-1.5 font-mono text-3xl font-semibold tabular-nums leading-none ${spendable > 0 ? "text-[var(--gain)]" : ""}`}
        >
          {spendable > 0 && <TrendingUp aria-hidden="true" className="size-5 shrink-0" />}
          {formatEUR(spendable, 0)}
        </div>

        {/* Accruing — the LOCKED pools, one honest row per pool with its TRUE unlock threshold (G5). */}
        {parts.length > 0 && (
          <div className="mt-5 space-y-2">
            {parts.map((part) => (
              <div
                key={part.kind}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1"
              >
                <div className="flex items-center gap-1.5 text-sm text-[var(--neutral-data)]">
                  <Lock aria-hidden="true" className="size-4 shrink-0" />
                  <span>
                    {part.kind === "small"
                      ? `Accruing (unlocks at ${kLabel(part.unlocksAtEur)})`
                      : `Accruing for the epic trip (unlocks at ${kLabel(part.unlocksAtEur)})`}
                  </span>
                </div>
                <span className="font-mono text-xl font-semibold tabular-nums text-[var(--neutral-data)]">
                  {formatEUR(part.amount, 0)}
                </span>
              </div>
            ))}
          </div>
        )}
        <p className="mt-2 text-sm text-muted-foreground">
          The spendable pool releases at each €10k of Wealth; the epic-trip pool unlocks at €100k —
          money accrued after a gate stays locked until it&apos;s reached.
        </p>
      </section>

      {/* Epic-trip toggle — the REAL household's reachable WRITE (GOAL-10 / D5-10 Q2). A
          progressive-enhancement <form> posts the FLIP of the current epic_trip_active state. */}
      <section
        aria-label="Epic trip routing"
        className="flex flex-wrap items-center justify-between gap-4 rounded-xl bg-card p-6 ring-1 ring-foreground/10"
      >
        <div>
          <div className="text-sm font-medium">Epic trip</div>
          <p className="mt-1 text-sm text-muted-foreground">
            {epicTripActive
              ? "Active — Adventures spending now draws the big-trip tranche."
              : "Off — Adventures spending draws the spendable-now pool."}
          </p>
        </div>
        <form action={toggleEpicTripForm}>
          <input type="hidden" name="active" value={String(!epicTripActive)} />
          <button
            type="submit"
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-[var(--brand)] px-5 text-sm font-medium text-white transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {epicTripActive ? "End epic trip" : "Activate epic trip"}
          </button>
        </form>
      </section>

      {/* Per-bucket category donut (VIZ-01, scoped to Adventures). */}
      <Card>
        <CardContent className="pt-6">
          <CategoryDonut
            month={monthSlices}
            year={yearSlices}
            title="Adventures spending by category"
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
              No spending tagged to Adventures yet — tag transactions to see them here.
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
