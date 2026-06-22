// src/lib/ingestion/dedupe.ts
//
// dedupeHash(Normalized) -> { hash, strategy }: the deterministic, VERSIONED idempotency
// key (ING-03). Paired with the DB UNIQUE(dedupe_hash) + ON CONFLICT DO NOTHING, this is
// what makes a re-pull over an overlapping window add ZERO rows (the real safety net is
// the DB constraint; this hash is the matching key).
//
// Two strategies, recorded so the choice is auditable:
//   - "bank_id":   the bank's stable id is present -> sha256("v1|id|<accountId>|<bankTxId>").
//                  Preferred — the bank's own id is the most stable identity.
//   - "composite": no bank id -> sha256("v1|composite|<accountId>|<bookingDate>|
//                  <amount.toFixed(2)>|<normalizedDescription>"). The fallback is pinned to
//                  booking_date (NOT value_date) so the hash is STABLE across value_date
//                  flips between pulls (Pitfall 5).
//
// FROZEN CONTRACT: HASH_VERSION + the field composition are frozen. Changing either changes
// every hash downstream, so a change here is a data migration, not a refactor. Uses the
// built-in node:crypto sha256 (no npm hashing dep — T-01-SC).
//
// SERVER-PLANE ONLY (FND-03). Pure — no DB, no network, no PII logging.

import { createHash } from "node:crypto";

/** The frozen hash version. Bumping it is a migration (every dedupe_hash changes). */
export const HASH_VERSION = "v1";

/** The minimal Normalized fields the hash consumes. */
interface HashableTx {
  accountId: string;
  bankTxId: string | null;
  bookingDate: string;
  amount: number;
  normalizedDescription: string;
}

function sha256(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/**
 * Compute the deterministic dedupe hash + the strategy that produced it.
 *
 * - Deterministic: identical input -> identical hash.
 * - Stable across value_date flips: value_date is NOT part of either composition.
 * - Sensitive: differs when accountId, bankTxId, bookingDate, or amount change.
 */
export function dedupeHash(tx: HashableTx): {
  hash: string;
  strategy: "bank_id" | "composite";
} {
  if (tx.bankTxId) {
    // Prefer the bank's stable id. Scope by accountId so the same id under two accounts
    // (defensive) never collides.
    return {
      hash: sha256([HASH_VERSION, "id", tx.accountId, tx.bankTxId].join("|")),
      strategy: "bank_id",
    };
  }

  // Composite fallback — pinned to booking_date (the frozen period key), the signed amount
  // to 2dp, and the normalized description.
  return {
    hash: sha256(
      [
        HASH_VERSION,
        "composite",
        tx.accountId,
        tx.bookingDate,
        tx.amount.toFixed(2),
        tx.normalizedDescription,
      ].join("|"),
    ),
    strategy: "composite",
  };
}
