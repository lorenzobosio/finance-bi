// scripts/gen-calendar.ts
//
// Generates the `dim_calendar` INSERT statements for the 0002_seed.sql migration,
// covering 2024-01-01 .. 2035-12-31 (D-10). ~4383 day rows; 144 distinct period_keys;
// period_key = YYYYMM (int), the join key for MoM/YoY — min 202401, max 203512.
//
// Run: `pnpm exec tsx scripts/gen-calendar.ts` (or any TS runner). It prints the SQL
// to stdout; redirect it into the dim_calendar section of drizzle/0002_seed.sql. The
// committed 0002_seed.sql was produced from exactly this logic.

import { eachDayOfInterval, format } from 'date-fns';

export interface CalendarRow {
  date: string; // yyyy-MM-dd
  year: number;
  month: number; // 1-12
  quarter: number; // 1-4
  periodKey: number; // YYYYMM
}

export function generateCalendarRows(
  start = new Date('2024-01-01'),
  end = new Date('2035-12-31'),
): CalendarRow[] {
  return eachDayOfInterval({ start, end }).map((d) => ({
    date: format(d, 'yyyy-MM-dd'),
    year: d.getFullYear(),
    month: d.getMonth() + 1,
    quarter: Math.floor(d.getMonth() / 3) + 1,
    periodKey: Number(format(d, 'yyyyMM')),
  }));
}

export function rowsToInsertSql(rows: CalendarRow[]): string {
  const values = rows
    .map(
      (r) =>
        `  ('${r.date}', ${r.year}, ${r.month}, ${r.quarter}, ${r.periodKey})`,
    )
    .join(',\n');
  return (
    'insert into public.dim_calendar (date, year, month, quarter, period_key) values\n' +
    values +
    '\non conflict (date) do nothing;\n'
  );
}

// Run as a script: emit the SQL to stdout.
if (typeof require !== 'undefined' && require.main === module) {
  process.stdout.write(rowsToInsertSql(generateCalendarRows()));
}
