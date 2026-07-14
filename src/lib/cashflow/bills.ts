// src/lib/cashflow/bills.ts — the PURE bills-projection engine (FLOW-03, D-07/D-08). Mirrors the
// pure-engine convention of `src/lib/goal/momentum.ts`: an explicit typed input, no I/O, no clock,
// deterministic and empty-safe. It expands each `active` recurring series forward over a rolling
// window (60-day / 2-month default, D-07) by cadence, emitting one occurrence per due date.
//
//   - OUTFLOW series produce BILL occurrences; INCOME series (salary) are flagged SEPARATELY in the
//     `income` lane (D-08) — income is NEVER a "bill", the calendar renders it as a distinct marker.
//   - only `active` series expand; a `dismissed` series contributes nothing.
//   - `from` is INJECTED (the demo-aware asOf the page resolves) — NEVER an internal clock
//     (RESEARCH Pitfall 2: a wall-clock window renders the anon demo dead).
//   - date math via date-fns (parseISO/addDays/addMonths/addYears/isWithinInterval/format) — never
//     hand-rolled; format uses local components so the YYYY-MM-DD round-trips timezone-stably.

import {
  addDays,
  addMonths,
  addYears,
  format,
  isWithinInterval,
  parseISO,
} from "date-fns";

/** A recurring series as read from `recurring_series` (the expansion source). */
export interface BillSeries {
  key: string;
  label: string;
  /** Signed EUR: negative = outflow, positive = income. */
  amount: number;
  cadence: "weekly" | "monthly" | "yearly";
  /** YYYY-MM-DD — the next expected occurrence. */
  nextDate: string;
  status: "active" | "dismissed";
  direction: "outflow" | "income";
}

/** A single dated occurrence of a series inside the window. */
export interface BillOccurrence {
  key: string;
  label: string;
  amount: number;
  /** YYYY-MM-DD. */
  date: string;
}

/** The two lanes: outflow bills and (separately, D-08) recurring income. */
export interface BillsResult {
  bills: BillOccurrence[];
  income: BillOccurrence[];
}

const ISO = "yyyy-MM-dd";

/** Safety cap on per-series iterations (a malformed far-past nextDate never spins). */
const MAX_OCCURRENCES = 500;

/** Step a date forward by one cadence unit (date-fns only — no hand-rolled math). */
function advance(date: Date, cadence: BillSeries["cadence"]): Date {
  switch (cadence) {
    case "weekly":
      return addDays(date, 7);
    case "yearly":
      return addYears(date, 1);
    case "monthly":
    default:
      return addMonths(date, 1);
  }
}

/**
 * projectBills — expand each `active` series forward over a `days`-wide window anchored at `from`,
 * one occurrence per due date. Outflows land in `bills`, income lands (separately) in `income`.
 * Pure, deterministic, empty-safe (empty input → empty lanes; never throws, never NaN).
 */
export function projectBills(
  series: BillSeries[],
  from: string,
  days: number,
): BillsResult {
  const bills: BillOccurrence[] = [];
  const income: BillOccurrence[] = [];

  const start = parseISO(from);
  const end = addDays(start, days);
  const interval = { start, end };

  for (const s of series) {
    if (s.status !== "active") continue;
    if (!Number.isFinite(s.amount)) continue;

    const lane = s.direction === "income" ? income : bills;

    let occ = parseISO(s.nextDate);
    for (let i = 0; i < MAX_OCCURRENCES; i++) {
      // Past the window end → nothing further from this series.
      if (occ.getTime() > end.getTime()) break;
      if (isWithinInterval(occ, interval)) {
        lane.push({
          key: s.key,
          label: s.label,
          amount: s.amount,
          date: format(occ, ISO),
        });
      }
      occ = advance(occ, s.cadence);
    }
  }

  return { bills, income };
}
