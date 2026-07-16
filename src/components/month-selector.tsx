"use client";

import { format } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { currentPeriodKey } from "@/lib/period";
import { cn } from "@/lib/utils";

// MonthSelector (UI-SPEC §0, MANDATORY shared app state).
//
// The selected period lives in the URL search param `?period=YYYYMM`, so EVERY mart-backed
// page reads one shared value — Provisional flagging, MoM deltas, and "did we hit €4k *this
// month*?" all key off the same period. This is a client component that only mutates the URL;
// pages read `searchParams.period` server-side (the single source of truth).
//
//   • default = the current month (currentPeriodKey(now)) when no param is present
//   • `‹ prev` steps back one month; `next ›` steps forward — DISABLED at the current month
//     (no future months exist in a forward-only product)
//   • label is `MMM yyyy` (mono), e.g. "Jun 2026"

/** Parse/clamp a raw ?period value to a valid YYYYMM int, falling back to the current month. */
function parsePeriodParam(raw: string | null, currentKey: number): number {
  if (raw === null) return currentKey;
  if (!/^\d{6}$/.test(raw)) return currentKey;
  const key = Number(raw);
  const month = key % 100;
  if (month < 1 || month > 12) return currentKey;
  // Never allow a future month (forward-only product) — clamp to the current month.
  if (key > currentKey) return currentKey;
  return key;
}

/** YYYYMM int → a Date at the first of that month (for date-fns labelling). */
function periodKeyToDate(periodKey: number): Date {
  const year = Math.floor(periodKey / 100);
  const month = periodKey % 100; // 1-based
  return new Date(year, month - 1, 1);
}

/** Step a YYYYMM int by ±1 month, crossing the year boundary correctly. */
function stepPeriodKey(periodKey: number, delta: number): number {
  const d = periodKeyToDate(periodKey);
  d.setMonth(d.getMonth() + delta);
  return d.getFullYear() * 100 + (d.getMonth() + 1);
}

export function MonthSelector() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // `now` is read at render — the current month is the upper bound for `next`.
  const currentKey = currentPeriodKey(new Date());
  const selected = parsePeriodParam(searchParams.get("period"), currentKey);

  const isCurrentMonth = selected >= currentKey;
  const label = format(periodKeyToDate(selected), "MMM yyyy");

  function goTo(periodKey: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("period", String(periodKey));
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex items-center gap-1" role="group" aria-label="Select month">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="min-h-11 min-w-11"
        aria-label="Previous month"
        onClick={() => goTo(stepPeriodKey(selected, -1))}
      >
        <ChevronLeft aria-hidden="true" />
      </Button>
      <span
        className={cn(
          "min-w-[5.5rem] text-center font-mono text-sm font-medium tabular-nums",
        )}
        aria-live="polite"
      >
        {label}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="min-h-11 min-w-11"
        aria-label="Next month"
        disabled={isCurrentMonth}
        onClick={() => goTo(stepPeriodKey(selected, 1))}
      >
        <ChevronRight aria-hidden="true" />
      </Button>
    </div>
  );
}
