import { describe, expect, it } from "vitest";

// Wave-0 RED test (Pitfall 5 / Pitfall 2) — freezes the contract for the
// not-yet-existent src/lib/ingestion/normalize.ts. `normalize` does NOT exist yet
// (created GREEN in plan 01-04); this suite fails at import-resolution time — RED.
//
// Contract frozen here (RESEARCH § Code Examples — normalize):
//   normalize(rawTx, accountId) -> Normalized | null
//   - SIGN from credit_debit_indicator: DBIT -> negative, CRDT -> positive.
//     The EB amount string is always positive magnitude; never trust its sign.
//   - PERIOD/bookingDate comes from booking_date, NOT value_date.
//   - COUNTERPARTY: on DBIT (outflow) the counterparty is the creditor; on CRDT
//     (inflow) it is the debtor.
//   - PDNG rows are EXCLUDED (returns null); BOOK rows are kept.
import { normalize } from "@/lib/ingestion/normalize";

// A raw EB transaction shape (subset) per RESEARCH § client.ts zod schema.
interface RawTxLike {
  transaction_id?: string;
  entry_reference?: string;
  status: string; // "BOOK" | "PDNG"
  booking_date: string; // YYYY-MM-DD
  value_date?: string;
  credit_debit_indicator: "CRDT" | "DBIT";
  transaction_amount: { currency: string; amount: string };
  creditor?: { name?: string };
  creditor_account?: { iban?: string };
  debtor?: { name?: string };
  debtor_account?: { iban?: string };
  remittance_information?: string[];
}

const ACCOUNT_ID = "acct-lorenzo";

const debitRaw: RawTxLike = {
  transaction_id: "tx-1",
  status: "BOOK",
  booking_date: "2026-06-10",
  value_date: "2026-06-12",
  credit_debit_indicator: "DBIT",
  transaction_amount: { currency: "EUR", amount: "42.50" },
  creditor: { name: "REWE" },
  creditor_account: { iban: "DE00CREDITOR" },
  debtor: { name: "Lorenzo" },
  debtor_account: { iban: "DE00LORENZO" },
  remittance_information: ["Card payment", "REWE Berlin"],
};

const creditRaw: RawTxLike = {
  transaction_id: "tx-2",
  status: "BOOK",
  booking_date: "2026-06-25",
  value_date: "2026-06-26",
  credit_debit_indicator: "CRDT",
  transaction_amount: { currency: "EUR", amount: "3200.00" },
  creditor: { name: "Lorenzo" },
  creditor_account: { iban: "DE00LORENZO" },
  debtor: { name: "ACME GmbH" },
  debtor_account: { iban: "DE00ACME" },
  remittance_information: ["Salary June"],
};

describe("normalize — sign, period key, counterparty, PDNG exclusion (Pitfall 5/2)", () => {
  it("makes the amount NEGATIVE on a DBIT (outflow)", () => {
    const n = normalize(debitRaw, ACCOUNT_ID);
    expect(n).not.toBeNull();
    expect(n!.amount).toBeLessThan(0);
    expect(n!.amount).toBe(-42.5);
  });

  it("makes the amount POSITIVE on a CRDT (inflow)", () => {
    const n = normalize(creditRaw, ACCOUNT_ID);
    expect(n).not.toBeNull();
    expect(n!.amount).toBeGreaterThan(0);
    expect(n!.amount).toBe(3200);
  });

  it("takes the period/bookingDate from booking_date, NOT value_date", () => {
    const n = normalize(debitRaw, ACCOUNT_ID);
    expect(n!.bookingDate).toBe("2026-06-10");
    expect(n!.bookingDate).not.toBe(debitRaw.value_date);
  });

  it("resolves counterparty to the creditor on DBIT", () => {
    const n = normalize(debitRaw, ACCOUNT_ID);
    expect(n!.counterpartyName).toBe("REWE");
    expect(n!.counterpartyIban).toBe("DE00CREDITOR");
  });

  it("resolves counterparty to the debtor on CRDT", () => {
    const n = normalize(creditRaw, ACCOUNT_ID);
    expect(n!.counterpartyName).toBe("ACME GmbH");
    expect(n!.counterpartyIban).toBe("DE00ACME");
  });

  it("stamps the normalizing accountId", () => {
    expect(normalize(debitRaw, ACCOUNT_ID)!.accountId).toBe(ACCOUNT_ID);
  });

  it("EXCLUDES a PDNG row (returns null)", () => {
    const pending: RawTxLike = { ...debitRaw, status: "PDNG" };
    expect(normalize(pending, ACCOUNT_ID)).toBeNull();
  });

  it("KEEPS a BOOK row (returns a normalized object)", () => {
    expect(normalize(debitRaw, ACCOUNT_ID)).not.toBeNull();
  });
});
