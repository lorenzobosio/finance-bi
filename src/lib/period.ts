// Period / comparability pure helpers (BI-04).
//
// `period_key` is the YYYYMM integer join key from dim_calendar (db/schema.ts):
// MoM compares adjacent period_keys; YoY uses period_key - 100. These helpers gate
// the "Provisional" flag (the current open month) and the "Not enough history yet"
// YoY fallback (~12 months) described in UI-SPEC §7.
//
// Every function is PURE and takes an INJECTED `now: Date` where it needs the clock
// (mirroring src/lib/status/connection-status.ts deriveFreshness) — no Date.now(),
// no DB — so the suite injects `now` and stays deterministic.

/**
 * The current period_key (YYYYMM int) derived from the injected `now`.
 * `currentPeriodKey(new Date('2026-06-15'))` → `202606`.
 *
 * `getMonth()` is 0-based, so add 1; multiplying the year by 100 zero-pads the month.
 */
export function currentPeriodKey(now: Date): number {
  return now.getFullYear() * 100 + (now.getMonth() + 1);
}

/**
 * True only when `periodKey` is the current open month (relative to `now`) — the
 * single period whose figures are still changing (UI-SPEC §7 "Provisional" flag).
 * Past and future periods are never provisional.
 */
export function isProvisional(periodKey: number, now: Date): boolean {
  return periodKey === currentPeriodKey(now);
}

/**
 * The year-earlier period_key for a YoY join (BI-04): exactly `periodKey - 100`.
 * Crosses the year boundary correctly because the month digits are unchanged
 * (`202601` → `202501`).
 */
export function periodKeyForYoY(periodKey: number): number {
  return periodKey - 100;
}

/**
 * The immediately-preceding month's period_key for a MoM comparison (BI-04). Crosses the
 * year boundary correctly: `202601` → `202512` (NOT naive `periodKey - 1`, which would yield
 * the impossible `202600`). The month digits are decoded, stepped back one, and re-encoded.
 */
export function previousPeriodKey(periodKey: number): number {
  const year = Math.floor(periodKey / 100);
  const month = periodKey % 100; // 1-based
  if (month === 1) return (year - 1) * 100 + 12;
  return year * 100 + (month - 1);
}

/**
 * True once at least 12 DISTINCT populated periods exist — the "~12 months" gate
 * (UI-SPEC §7). Under that threshold callers show "Not enough history yet" and fall
 * back to MoM. Duplicates are de-duped so a repeated period never inflates the count.
 */
export function hasYoYHistory(populatedPeriodKeys: number[]): boolean {
  return new Set(populatedPeriodKeys).size >= 12;
}
