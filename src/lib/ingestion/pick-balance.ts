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
// single implementation. The CURRENT behavior — return the FIRST numeric amount,
// ignoring `balance_type` — is preserved here unchanged. Plan 03-02 (DSN-06a) adds the
// CLBD > ITBD > ITAV preference order; the Wave-0 RED test in `test/ingest.balance.test.ts`
// fails until that preference lands.

import type { Balance } from "@/lib/ingestion/enable-banking/schemas";

/** Pick the first numeric balance amount from an EB balances payload (EUR-only MVP). */
export function pickBalance(bals: Balance[]): number | null {
  for (const b of bals) {
    const amt = b.balance_amount?.amount;
    if (amt != null && amt !== "") {
      const n = Number(amt);
      if (!Number.isNaN(n)) return n;
    }
  }
  return null;
}
