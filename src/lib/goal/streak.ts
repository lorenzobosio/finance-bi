// src/lib/goal/streak.ts — the €4k pay-yourself-first STREAK (D5-06 / D5-08). PURE, injected clock.
//
// D5-06: a month is a HIT when TOTAL investimento that calendar month ≥ €4,000, independent of the
//        internal bucket split — INCLUDING debt settlement. A €4,000 transfer that settled €200 of
//        Brazil debt (leaving Wealth only €3,800) STILL counts (Pitfall 3 — the streak reads total
//        monthly investimento, never the Wealth allocation).
// D5-08: a genuine CLOSED-month miss resets `current` to 0 but PRESERVES `longest`; the comeback is
//        flagged; the current provisional (open) month is a filling HEAD, EXCLUDED from the closed
//        count. No streak-freeze / forgiveness.
//
// The clock is INJECTED (mirrors src/lib/period.ts) so the suite stays deterministic.

import { MONTHLY_TARGET_EUR } from "./constants";
import { currentPeriodKey, previousPeriodKey } from "../period";

export interface StreakResult {
  /** Consecutive CLOSED-month hits ending at the last closed month (0 if that month missed). */
  current: number;
  /** The all-time longest run of consecutive closed hits (preserved across breaks). */
  longest: number;
  /** True when the current run resumed AFTER a genuine closed miss. */
  comeback: boolean;
  /** True when the OPEN (provisional) month has already reached €4k — a filling head, not counted. */
  provisionalHit: boolean;
  /** True when the last CLOSED month is a miss (the streak is currently broken). */
  isBroken: boolean;
}

/** A month hits when its TOTAL investimento ≥ €4,000 (D5-06 — bucket split irrelevant). */
function isHit(total: number | undefined): boolean {
  return (total ?? -1) >= MONTHLY_TARGET_EUR;
}

/**
 * Compute the €4k streak from a `Map<periodKey, totalInvestimento>` and the injected `now`.
 * `launchDate` (optional ISO `YYYY-MM-DD`) restricts the walk to post-launch months when given.
 * Pure: reads only the map + `now`.
 */
export function computeStreak(
  invByPeriod: Map<number, number>,
  now: Date,
  launchDate?: string | null,
): StreakResult {
  const provisionalKey = currentPeriodKey(now);
  const lastClosed = previousPeriodKey(provisionalKey);

  // The launch gate as a period_key (YYYYMM int), or null when no launch is set.
  const launchKey =
    launchDate == null
      ? null
      : Number(launchDate.slice(0, 7).replace("-", ""));
  const atOrAfterLaunch = (key: number) => launchKey == null || key >= launchKey;

  const provisionalHit = isHit(invByPeriod.get(provisionalKey));

  // `current`: walk backward from the last closed month while each month is a hit.
  let current = 0;
  let k = lastClosed;
  while (
    atOrAfterLaunch(k) &&
    invByPeriod.has(k) &&
    isHit(invByPeriod.get(k))
  ) {
    current++;
    k = previousPeriodKey(k);
  }

  const isBroken = !isHit(invByPeriod.get(lastClosed));

  // `longest`: scan all CLOSED, post-launch months in ascending order, tracking consecutive runs.
  const closedKeys = [...invByPeriod.keys()]
    .filter((key) => key < provisionalKey && atOrAfterLaunch(key))
    .sort((a, b) => a - b);

  let longest = 0;
  let run = 0;
  let prevKey: number | null = null;
  for (const key of closedKeys) {
    const adjacent = prevKey !== null && previousPeriodKey(key) === prevKey;
    if (isHit(invByPeriod.get(key))) {
      run = adjacent ? run + 1 : 1;
    } else {
      run = 0;
    }
    if (run > longest) longest = run;
    prevKey = key;
  }

  // `comeback`: the month immediately BEFORE the current run exists and was a miss.
  let comeback = false;
  if (current > 0) {
    let beforeRun = lastClosed;
    for (let i = 0; i < current; i++) beforeRun = previousPeriodKey(beforeRun);
    comeback =
      atOrAfterLaunch(beforeRun) &&
      invByPeriod.has(beforeRun) &&
      !isHit(invByPeriod.get(beforeRun));
  }

  return { current, longest, comeback, provisionalHit, isBroken };
}
