// bills-section — the FLOW-03 server-driven bills calendar (UI-SPEC §3).
//
// An async RSC that reads the `active` `recurring_series` (both outflow bills AND recurring income),
// threading `.eq("is_demo", demoFilter)` on the demo-bearing read (the anon /cashflow demo caps to
// is_demo=true; a missing filter would blend the real household's subscription labels/amounts with the
// demo partition — T-09-07 / demo-read-filter guard). It expands them with the PURE `projectBills`
// engine over the rolling 60-day window anchored at the demo-aware `asOf` the page resolves once
// (NEVER the wall clock — Pitfall 2 / T-09-09), then renders `<BillsCalendar>`. Reads go through the
// `@supabase/ssr` server client under RLS — NEVER the server-only marts module (FND-03).

import { BillsCalendar } from "@/components/cashflow/bills-calendar";
import { projectBills, type BillSeries } from "@/lib/cashflow/bills";
import { createClient } from "@/lib/supabase/server";

/** numeric columns arrive from supabase-js as strings; parse to a finite number (0 fallback). */
function num(v: string | number | null | undefined): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** The 60-day / 2-month rolling window (D-07). */
const WINDOW_DAYS = 60;

function toCadence(raw: string): BillSeries["cadence"] {
  return raw === "weekly" || raw === "yearly" ? raw : "monthly";
}

export async function BillsSection({
  demoFilter,
  asOf,
}: {
  demoFilter: boolean;
  asOf: Date;
}) {
  const supabase = await createClient();

  // The active managed series (outflow bills + recurring income); dismissed rows never expand.
  const { data: seriesRows, error: seriesError } = await supabase
    .from("recurring_series")
    .select("series_key, label, amount_eur, cadence, next_date, status, is_income, is_demo")
    .eq("is_demo", demoFilter)
    .eq("status", "active");
  if (seriesError) throw seriesError;

  const from = asOf.toISOString().slice(0, 10);

  const series: BillSeries[] = (seriesRows ?? [])
    .filter((r) => r.next_date) // a series with no next occurrence can't be projected forward
    .map((r) => ({
      key: r.series_key,
      label: r.label,
      amount: num(r.amount_eur),
      cadence: toCadence(r.cadence),
      nextDate: r.next_date as string,
      status: "active",
      direction: r.is_income ? "income" : "outflow",
    }));

  const { bills, income } = projectBills(series, from, WINDOW_DAYS);

  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold">Upcoming bills</h2>
      <BillsCalendar bills={bills} income={income} from={from} />
    </section>
  );
}
