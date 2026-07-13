// src/lib/goal/level.ts — the thin savings-rate BAND (gamification-16 mechanic 4). PURE.
//
// A light, optional gamification band derived from a month's savings rate (invested ÷ revenue). It is
// NOT the €100k engine (that is allocation.ts / getGoalTotal.ts) — just a warm label the UI can show.
// No I/O, no clock; the ratio uses the marts null-not-NaN convention (null when revenue is 0).

export type SavingsBand = "starting" | "steady" | "strong" | "elite";

/**
 * The savings rate for a month = total invested ÷ revenue, or null when revenue is 0 (never
 * divide-by-zero — mirrors the marts.ts convention).
 */
export function savingsRate(invested: number, revenue: number): number | null {
  if (revenue === 0) return null;
  return invested / revenue;
}

/**
 * Map a savings rate to a warm band (gamification-16 mechanic 4). A null rate (no revenue) is the
 * "starting" band. Thresholds are intentionally gentle — this is encouragement, not a scoreboard.
 */
export function savingsBand(rate: number | null): SavingsBand {
  if (rate === null || rate <= 0) return "starting";
  if (rate < 0.2) return "steady";
  if (rate < 0.4) return "strong";
  return "elite";
}
