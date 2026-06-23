// src/lib/ingestion/pick-balance.ts
//
// pickBalance(bals) — choose the single EUR balance amount to snapshot from an
// Enable Banking `balances[]` payload (EUR-only MVP).
//
// SERVER/WRITE-PLANE ONLY (FND-03). This module is consumed exclusively by the cron
// (`scripts/ingest.ts`) and the ingestion engine — it must NEVER be imported into
// `src/app/*`. It is a pure transform: no DB, no network, no PII logging.
//
// Extracted from `scripts/ingest.ts` (Phase 3, Plan 03-01) so it is unit-testable as a
// single implementation. Plan 03-02 (DSN-06a / D3-11) adds the CLBD > ITBD > ITAV
// preference: Enable Banking returns several typed balances per account and their order is
// NOT guaranteed. For the daily go-forward snapshot the closing-booked balance (CLBD) is the
// authoritative figure; an interim-available (ITAV) can include pending holds and is NOT
// comparable month-over-month. We prefer CLBD, then interim-booked (ITBD), then interim-
// available (ITAV); the any-numeric fallback preserves the old behavior so a snapshot is
// never lost when none of the three preferred types is present (Assumption A1).

import type { Balance } from "@/lib/ingestion/enable-banking/schemas";

/** Preferred balance-type order: closing-booked → interim-booked → interim-available. */
const BALANCE_PREFERENCE = ["CLBD", "ITBD", "ITAV"] as const;

/** Parse a balance's amount to a finite number, treating null/empty string as no-value. */
function numericAmount(b: Balance): number | null {
  const amt = b.balance_amount?.amount;
  if (amt == null || amt === "") return null;
  const n = Number(amt);
  return Number.isNaN(n) ? null : n;
}

/**
 * Pick the EUR balance amount to snapshot from an EB balances payload (EUR-only MVP).
 *
 * Prefers CLBD > ITBD > ITAV (regardless of array order); falls back to the FIRST any-numeric
 * balance when none of those three types yields a value, so a run never loses a snapshot.
 */
export function pickBalance(bals: Balance[]): number | null {
  for (const type of BALANCE_PREFERENCE) {
    const hit = bals.find((b) => b.balance_type === type && numericAmount(b) != null);
    if (hit) return numericAmount(hit);
  }
  // Last resort: any numeric balance (preserves the old first-numeric behavior).
  for (const b of bals) {
    const n = numericAmount(b);
    if (n != null) return n;
  }
  return null;
}
