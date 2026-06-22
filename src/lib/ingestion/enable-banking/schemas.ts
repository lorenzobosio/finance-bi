// src/lib/ingestion/enable-banking/schemas.ts
//
// Boundary validation (V5, T-01-06) for the UNTRUSTED Enable Banking JSON. Every
// /aspsps, /auth, /sessions, transactions, and balances payload is zod-parsed in
// client.ts before any field is used — a shape change fails LOUDLY instead of
// silently corrupting the ledger.
//
// SERVER-PLANE ONLY (FND-03): never imported into the Next app/client bundle.
//
// Shapes are derived from the live, PII-scrubbed fixtures captured by the spike
// (test/fixtures/eb-sessions.json, eb-transactions-page.json) and the RESEARCH
// Code Examples. Spike findings baked in:
//   A3 — only `entry_reference` is present (no `transaction_id`) -> both optional.
//   A4 — no PEND rows in window, but `status` BOOK|PEND is still modelled for audit.
//   A6 — counterparty IBANs ARE returned -> creditor/debtor_account.iban present.
// Objects use `.passthrough()` so extra Revolut fields (all_account_ids,
// identification_hash[es], psu_status, …) survive parsing rather than throwing.

import { z } from "zod";

// ---------------------------------------------------------------------------
// GET /aspsps — bank discovery + the legal consent ceiling.
// ---------------------------------------------------------------------------
export const AspspSchema = z
  .object({
    name: z.string(),
    country: z.string(),
    // The PSD2 consent ceiling in seconds (Revolut returns 15552000s = 180d, A5).
    maximum_consent_validity: z.number().nullish(),
    psu_types: z.array(z.string()).nullish(),
  })
  .passthrough();

export const AspspsResponseSchema = z
  .object({ aspsps: z.array(AspspSchema) })
  .passthrough();

export type AspspsResponse = z.infer<typeof AspspsResponseSchema>;

// ---------------------------------------------------------------------------
// POST /auth — returns the bank authorization URL the human opens for SCA.
// ---------------------------------------------------------------------------
export const AuthResponseSchema = z
  .object({
    url: z.string(),
    authorization_id: z.string().nullish(),
    psu_id_hash: z.string().nullish(),
  })
  .passthrough();

export type AuthResponse = z.infer<typeof AuthResponseSchema>;

// ---------------------------------------------------------------------------
// POST /sessions — exchanges the SCA `code` for the session + accounts + the
// REAL consent window (access.valid_until). This is the source of truth for
// connections.expires_at (ING-05) — read here, never hardcoded.
// ---------------------------------------------------------------------------
export const AccountIdentificationSchema = z
  .object({ iban: z.string().nullish(), other: z.unknown().nullish() })
  .passthrough();

export const SessionAccountSchema = z
  .object({
    uid: z.string(),
    account_id: AccountIdentificationSchema.nullish(),
    name: z.string().nullish(),
    currency: z.string().nullish(),
    cash_account_type: z.string().nullish(),
    usage: z.string().nullish(),
    product: z.string().nullish(),
  })
  .passthrough();

export const SessionAccessSchema = z
  .object({
    // The real consent expiry (ISO timestamp). Drives connections.expires_at.
    valid_until: z.string(),
    accounts: z.array(z.string()).nullish(),
    balances: z.boolean().nullish(),
    transactions: z.boolean().nullish(),
  })
  .passthrough();

export const SessionsResponseSchema = z
  .object({
    session_id: z.string(),
    accounts: z.array(SessionAccountSchema),
    access: SessionAccessSchema,
    aspsp: z.unknown().nullish(),
    psu_type: z.string().nullish(),
  })
  .passthrough();

export type SessionAccount = z.infer<typeof SessionAccountSchema>;
export type SessionsResponse = z.infer<typeof SessionsResponseSchema>;

// ---------------------------------------------------------------------------
// GET /accounts/{uid}/transactions — paginated by continuation_key.
// `credit_debit_indicator` (CRDT|DBIT) is the canonical sign source, NOT the
// amount string (which EB returns as a positive magnitude).
// ---------------------------------------------------------------------------
export const TxAmountSchema = z
  .object({ currency: z.string(), amount: z.string() })
  .passthrough();

export const RawTxSchema = z
  .object({
    transaction_id: z.string().nullish(), // A3: usually absent for Revolut
    entry_reference: z.string().nullish(), // A3: the stable id present here
    status: z.string().nullish(), // "BOOK" | "PEND" (A4: only BOOK in window)
    booking_date: z.string().nullish(), // "YYYY-MM-DD" — the period key
    value_date: z.string().nullish(),
    credit_debit_indicator: z.enum(["CRDT", "DBIT"]).nullish(), // Revolut sends DBIT (debit), not DBDT
    transaction_amount: TxAmountSchema.nullish(),
    creditor: z.object({ name: z.string().nullish() }).passthrough().nullish(),
    creditor_account: z
      .object({ iban: z.string().nullish() })
      .passthrough()
      .nullish(),
    debtor: z.object({ name: z.string().nullish() }).passthrough().nullish(),
    debtor_account: z
      .object({ iban: z.string().nullish() })
      .passthrough()
      .nullish(),
    remittance_information: z.array(z.string()).nullish(),
  })
  .passthrough();

export const TxPageSchema = z
  .object({
    transactions: z.array(RawTxSchema),
    continuation_key: z.string().nullish(),
  })
  .passthrough();

export type RawTx = z.infer<typeof RawTxSchema>;
export type TxPage = z.infer<typeof TxPageSchema>;

// ---------------------------------------------------------------------------
// GET /accounts/{uid}/balances — daily snapshot source (Phase 2 BI). Kept
// permissive: EB returns a `balances[]` array of typed balance amounts.
// ---------------------------------------------------------------------------
export const BalanceAmountSchema = z
  .object({ currency: z.string(), amount: z.string() })
  .passthrough();

export const BalanceSchema = z
  .object({
    name: z.string().nullish(),
    balance_amount: BalanceAmountSchema.nullish(),
    balance_type: z.string().nullish(),
    reference_date: z.string().nullish(),
  })
  .passthrough();

export const BalancesResponseSchema = z
  .object({ balances: z.array(BalanceSchema) })
  .passthrough();

export type Balance = z.infer<typeof BalanceSchema>;
export type BalancesResponse = z.infer<typeof BalancesResponseSchema>;
