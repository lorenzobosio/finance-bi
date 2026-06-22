// src/lib/ingestion/normalize.ts
//
// rawTx -> Normalized: the FROZEN boundary normalization (Pitfall 5/2). Every raw
// Enable Banking transaction is reduced to one canonical, signed-EUR shape here, BEFORE
// it touches the dedupe hash or the rules engine. Two invariants make the ledger correct:
//
//   1. SIGN comes ONLY from credit_debit_indicator — never from the amount string. EB
//      returns the amount as a positive magnitude; the indicator carries the direction.
//      DBIT (debit / outflow) -> negative; CRDT (credit / inflow) -> positive. (Revolut
//      sends "DBIT", NOT the "DBDT" some older docs mention — confirmed live, Wave 3.)
//   2. PERIOD/bookingDate comes from booking_date, NEVER value_date. value_date drifts
//      between pulls; pinning to booking_date keeps the dedupe hash stable (dedupe.ts).
//
// PDNG (pending) rows are EXCLUDED here (normalize returns null) — only BOOK rows are
// durable enough to dedupe and classify. The caller filters out the nulls.
//
// SERVER-PLANE ONLY (FND-03): lives under src/lib/ingestion and must NEVER be imported
// into the Next app/client bundle. Pure — no DB, no network, no logging of PII.
//
// This function + dedupe.ts's HASH_VERSION are FROZEN: changing the normalization changes
// every downstream hash, so a change here is a data migration, not a refactor.

import type { RawTx } from "./enable-banking/schemas";

/** The canonical, signed-EUR transaction shape every downstream module consumes. */
export interface Normalized {
  /** The account this transaction belongs to (the pull's account uid mapping). */
  accountId: string;
  /** The bank's stable id (transaction_id, else entry_reference) or null. */
  bankTxId: string | null;
  /** YYYY-MM-DD — the frozen period key. From booking_date, NEVER value_date. */
  bookingDate: string;
  /** YYYY-MM-DD — informational only; MUST NOT affect the dedupe hash. */
  valueDate: string | null;
  /** Signed EUR magnitude: negative = outflow (DBIT), positive = inflow (CRDT). */
  amount: number;
  /** The counterparty name: creditor on DBIT (outflow), debtor on CRDT (inflow). */
  counterpartyName: string | null;
  /** The counterparty IBAN: creditor on DBIT, debtor on CRDT. Drives rules matching. */
  counterpartyIban: string | null;
  /** The untouched bank memo (remittance lines joined). Kept for audit/display. */
  descriptionRaw: string;
  /** Lowercased, whitespace-collapsed description — the dedupe + rules matching key. */
  normalizedDescription: string;
}

/**
 * Normalize one raw Enable Banking transaction into the canonical signed-EUR shape.
 *
 * Returns `null` for a PDNG (pending) row — the caller drops it. Only BOOK rows produce
 * a Normalized object. The sign is derived from credit_debit_indicator (DBIT -> negative,
 * CRDT -> positive); the period key is booking_date (never value_date).
 */
export function normalize(raw: RawTx, accountId: string): Normalized | null {
  // PDNG (pending) rows are not durable — exclude them. Anything that is not an explicit
  // "BOOK" is excluded defensively (a missing/unknown status is not a booked row).
  if (raw.status !== "BOOK") return null;

  const isOutflow = raw.credit_debit_indicator === "DBIT";

  // SIGN: from the indicator only. The EB amount string is a positive magnitude.
  const magnitude = Number(raw.transaction_amount?.amount ?? "0");
  const amount = isOutflow ? -magnitude : magnitude;

  // COUNTERPARTY: on an outflow (DBIT) the counterparty is the creditor (money's
  // destination); on an inflow (CRDT) it is the debtor (money's source).
  const counterpartyName = (isOutflow ? raw.creditor?.name : raw.debtor?.name) ?? null;
  const counterpartyIban =
    (isOutflow ? raw.creditor_account?.iban : raw.debtor_account?.iban) ?? null;

  const descriptionRaw = (raw.remittance_information ?? []).join(" ").trim();

  return {
    accountId,
    bankTxId: raw.transaction_id ?? raw.entry_reference ?? null,
    bookingDate: raw.booking_date ?? "",
    valueDate: raw.value_date ?? null,
    amount,
    counterpartyName,
    counterpartyIban,
    descriptionRaw,
    normalizedDescription: descriptionRaw.toLowerCase().replace(/\s+/g, " ").trim(),
  };
}
