// bills-calendar — the FLOW-03 upcoming-bills surface (UI-SPEC §3). A genuinely NEW component (no
// prior calendar in the repo), built from existing design tokens only. It renders the rolling 60-day
// window as one month grid per month the window touches (desktop) with a REQUIRED mobile-first agenda
// fallback (Fernanda): below `sm` a stacked, date-grouped list; at `sm+` the 7-column grid.
//
// Honesty rules (D-08):
//   - a bill (outflow) is SPEND, NOT loss — chips are neutral (`--neutral-data`), NEVER `--loss`/red.
//   - recurring INCOME is a DISTINCT `--gain` up-tick marker, explicitly NOT a "bill" chip.
//   - today = a subtle `ring-border` + `font-semibold` cell (brand is reserved — never used here).
//   - every day exposes its bills as VISIBLE TEXT (merchant initials + amount) — a screen reader
//     never depends on chip color. Server-driven (RSC); no client state, no client DB.

import {
  addDays,
  eachDayOfInterval,
  eachMonthOfInterval,
  endOfMonth,
  format,
  getDay,
  isSameDay,
  parseISO,
  startOfMonth,
} from "date-fns";
import { ArrowUpRight } from "lucide-react";

import { MerchantAvatar } from "@/components/transactions/merchant-avatar";
import type { BillOccurrence } from "@/lib/cashflow/bills";
import { formatEUR } from "@/lib/format";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
/** Max bill chips rendered in a grid cell before collapsing the rest into "+N more". */
const MAX_CHIPS_PER_DAY = 2;

interface DayGroup {
  bills: BillOccurrence[];
  income: BillOccurrence[];
}

/** Bucket occurrences by their YYYY-MM-DD date into per-day bill + income lanes. */
function groupByDate(bills: BillOccurrence[], income: BillOccurrence[]): Map<string, DayGroup> {
  const map = new Map<string, DayGroup>();
  const ensure = (d: string): DayGroup => {
    let g = map.get(d);
    if (!g) {
      g = { bills: [], income: [] };
      map.set(d, g);
    }
    return g;
  };
  for (const b of bills) ensure(b.date).bills.push(b);
  for (const i of income) ensure(i.date).income.push(i);
  return map;
}

/** A single outflow chip — neutral (spend is NOT loss); initials + amount are the visible text. */
function BillChip({ occ }: { occ: BillOccurrence }) {
  return (
    <span
      title={occ.label}
      className="flex items-center gap-1 rounded bg-muted/50 px-1 py-0.5 text-[10px] text-[var(--neutral-data)]"
    >
      <MerchantAvatar name={occ.label} className="size-4 text-[0.5rem]" />
      <span className="tabular-nums">{formatEUR(Math.abs(occ.amount), 0)}</span>
      <span className="sr-only">{occ.label}</span>
    </span>
  );
}

/** A recurring-income marker — a DISTINCT `--gain` up-tick, explicitly NOT a bill chip (D-08). */
function IncomeMarker({ occ }: { occ: BillOccurrence }) {
  return (
    <span
      title={`${occ.label} (income)`}
      className="flex items-center gap-1 text-[10px] font-medium text-[var(--gain)]"
    >
      <ArrowUpRight className="size-3 shrink-0" aria-hidden />
      <span className="tabular-nums">{formatEUR(Math.abs(occ.amount), 0)}</span>
      <span className="sr-only">{occ.label} income</span>
    </span>
  );
}

/** One month's 7-column grid (Monday-first), rendered at `sm+`. */
function MonthGrid({
  month,
  groups,
  today,
}: {
  month: Date;
  groups: Map<string, DayGroup>;
  today: Date;
}) {
  const monthStart = startOfMonth(month);
  const days = eachDayOfInterval({ start: monthStart, end: endOfMonth(month) });
  // Monday-first leading offset: date-fns getDay is 0=Sun..6=Sat → shift so Mon=0.
  const leading = (getDay(monthStart) + 6) % 7;

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-muted-foreground">
        {format(monthStart, "MMMM yyyy")}
      </h3>
      <div className="grid grid-cols-7 gap-1">
        {WEEKDAYS.map((w) => (
          <div key={w} className="text-[11px] font-medium uppercase text-muted-foreground">
            {w}
          </div>
        ))}
        {Array.from({ length: leading }).map((_, i) => (
          <div key={`blank-${i}`} aria-hidden />
        ))}
        {days.map((day) => {
          const key = format(day, "yyyy-MM-dd");
          const group = groups.get(key);
          const isToday = isSameDay(day, today);
          const overflow = group ? group.bills.length - MAX_CHIPS_PER_DAY : 0;
          return (
            <div
              key={key}
              className={cn(
                "flex min-h-11 flex-col gap-0.5 rounded-md border border-transparent p-1",
                isToday && "font-semibold ring-1 ring-border",
              )}
            >
              <span className="text-[11px] text-muted-foreground">{format(day, "d")}</span>
              {group?.income.map((occ, i) => <IncomeMarker key={`i-${i}`} occ={occ} />)}
              {group?.bills.slice(0, MAX_CHIPS_PER_DAY).map((occ, i) => (
                <BillChip key={`b-${i}`} occ={occ} />
              ))}
              {overflow > 0 && (
                <span className="text-[10px] text-muted-foreground">+{overflow} more</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** The mobile-first agenda (below `sm`): a stacked, date-grouped list (Fernanda). */
function Agenda({ groups }: { groups: Map<string, DayGroup> }) {
  const dates = Array.from(groups.keys()).sort();
  return (
    <ul className="space-y-3">
      {dates.map((date) => {
        const group = groups.get(date);
        if (!group) return null;
        return (
          <li key={date} className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">
              {format(parseISO(date), "EEE d MMM")}
            </p>
            <ul className="space-y-1">
              {group.income.map((occ, i) => (
                <li
                  key={`i-${i}`}
                  className="flex items-center justify-between gap-2 text-sm text-[var(--gain)]"
                >
                  <span className="flex items-center gap-2 font-medium">
                    <ArrowUpRight className="size-4 shrink-0" aria-hidden />
                    {occ.label}
                  </span>
                  <span className="tabular-nums">{formatEUR(Math.abs(occ.amount), 0)}</span>
                </li>
              ))}
              {group.bills.map((occ, i) => (
                <li
                  key={`b-${i}`}
                  className="flex items-center justify-between gap-2 text-sm text-[var(--neutral-data)]"
                >
                  <span className="flex items-center gap-2">
                    <MerchantAvatar name={occ.label} className="size-6" />
                    {occ.label}
                  </span>
                  <span className="tabular-nums">{formatEUR(Math.abs(occ.amount), 0)}</span>
                </li>
              ))}
            </ul>
          </li>
        );
      })}
    </ul>
  );
}

export function BillsCalendar({
  bills,
  income,
  from,
}: {
  bills: BillOccurrence[];
  income: BillOccurrence[];
  /** The demo-aware window anchor (YYYY-MM-DD) — also the "today" indicator. */
  from: string;
}) {
  if (bills.length === 0 && income.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No known bills in the next 60 days.</p>
    );
  }

  const groups = groupByDate(bills, income);
  const today = parseISO(from);
  // Enumerate every month the rolling 60-day window touches (typically current + next).
  const months = eachMonthOfInterval({
    start: startOfMonth(today),
    end: addDays(today, 60),
  });

  return (
    <>
      {/* Mobile-first agenda (Fernanda): comfortable tap targets, no cramped grid. */}
      <div className="sm:hidden">
        <Agenda groups={groups} />
      </div>
      {/* Desktop month grid(s). */}
      <div className="hidden space-y-6 sm:block">
        {months.map((month) => (
          <MonthGrid
            key={format(month, "yyyy-MM")}
            month={month}
            groups={groups}
            today={today}
          />
        ))}
      </div>
    </>
  );
}
