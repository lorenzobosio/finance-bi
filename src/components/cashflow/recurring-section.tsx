// recurring-section — the FLOW-01 server-driven read for the managed recurring list (UI-SPEC §2).
//
// An async RSC that reads the persisted `recurring_series` rows AND the `transactions` history,
// threading `.eq("is_demo", demoFilter)` on EACH demo-bearing read (the anon /cashflow demo caps to
// is_demo=true; a missing filter would blend the real household's subscription labels/amounts with the
// demo partition — T-09-01 / demo-read-filter guard). It runs `detectRecurring({ transactions, asOf })`
// with the demo-aware `asOf` the page resolves once (NEVER the wall clock — Pitfall 2), reconciles the
// live candidates against the persisted series, and renders `<RecurringList>`. Reads go through the
// `@supabase/ssr` server client under RLS — NEVER the server-only marts module (FND-03).

import { RecurringList, type RecurringListItem } from "@/components/cashflow/recurring-list";
import { detectRecurring, type RecurringTx } from "@/lib/cashflow/recurring";
import { createClient } from "@/lib/supabase/server";

/** numeric columns arrive from supabase-js as strings; parse to a finite number (0 fallback). */
function num(v: string | number | null | undefined): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export async function RecurringSection({
  demoFilter,
  asOf,
}: {
  demoFilter: boolean;
  asOf: Date;
}) {
  const supabase = await createClient();

  // 1. The persisted managed series (the actionable rows carrying ids + status).
  const { data: seriesRows, error: seriesError } = await supabase
    .from("recurring_series")
    .select("id, series_key, label, amount_eur, cadence, next_date, status, is_income")
    .eq("is_demo", demoFilter);
  if (seriesError) throw seriesError;

  // 2. The transaction history feeding live detection (surfaces not-yet-persisted candidates).
  const { data: txRows, error: txError } = await supabase
    .from("transactions")
    .select("counterparty, amount_eur, booking_date, is_demo")
    .eq("is_demo", demoFilter);
  if (txError) throw txError;

  const transactions: RecurringTx[] = (txRows ?? [])
    .filter((r) => r.counterparty && r.booking_date)
    .map((r) => ({
      counterparty: r.counterparty as string,
      amount_eur: num(r.amount_eur),
      booking_date: r.booking_date as string,
    }));

  const candidates = detectRecurring({ transactions, asOf });

  // 3. Reconcile: the persisted rows are the actionable managed list; any detected candidate whose
  //    key is not yet persisted is surfaced as an advisory (no-write) row.
  const persistedKeys = new Set((seriesRows ?? []).map((r) => r.series_key));

  const items: RecurringListItem[] = (seriesRows ?? []).map((r) => ({
    id: r.id,
    seriesKey: r.series_key,
    label: r.label,
    amount: num(r.amount_eur),
    cadence: r.cadence,
    nextExpectedDate: r.next_date,
    status: r.status === "dismissed" ? "dismissed" : "active",
    isIncome: r.is_income,
  }));

  for (const c of candidates) {
    if (persistedKeys.has(c.key)) continue;
    items.push({
      id: null,
      seriesKey: c.key,
      label: c.label,
      amount: c.amount,
      cadence: c.cadence,
      nextExpectedDate: c.nextExpectedDate,
      status: "candidate",
      isIncome: c.amount > 0,
    });
  }

  return <RecurringList items={items} />;
}
