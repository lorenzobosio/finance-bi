import { describe, expect, it } from "vitest";

// Wave-0 RED test (CAT-02/03/07, D-04/D-18/D-19/D-22/D-25/D-26) — freezes the
// contract for the not-yet-existent src/lib/ingestion/rules/engine.ts. `applyRules`
// does NOT exist yet (created GREEN in plan 01-04); this suite fails at
// import-resolution time — the intended RED state.
//
// Enum reconciliation (A1/D-27): the existing schema enum is
// flow_type = ['revenue','cost','investimento','transferencia']. The Portuguese
// D-18 labels are DISPLAY labels only. Map:
//   faturamento = "revenue", custo = "cost",
//   investimento = "investimento", transferência = "transferencia".
//
// Ordered, first-match-wins contract (RESEARCH § Pattern 6):
//   applyRules(tx, accountsById) -> { flowType, costCenter, ... }
//   1. investimento — an outflow whose destination resolves to ANY is_investment=true
//      account (D-03/D-22). Source-agnostic, amount-agnostic.
//   2. transferencia — a transfer whose counterparty IBAN is one of the 3 cash
//      accounts (D-04).
//   3. revenue — a salary-signature inflow (faturamento, D-18/D-26).
//   4. cost — everything else (custo, D-18).
//   - sublet rent received -> revenue / costCenter "sublocacao"; sublet rent/utilities
//     paid -> cost / costCenter "sublocacao" (D-25).
//   - costCenter ALWAYS defaults to the transaction account's default_cost_center when
//     no rule overrides (CAT-07/D-19).
//   - the credit leg landing ON an is_investment account is NEVER "revenue" (CAT-03).
import { applyRules } from "@/lib/ingestion/rules/engine";

// Structural account shape consumed by the engine (real type lives in engine.ts).
interface AccountLike {
  id: string;
  iban: string | null;
  defaultCostCenter: "lorenzo" | "fernanda" | "shared";
  isInvestment: boolean;
  // Optional signature for matching the investing account on the outgoing leg when
  // it is NOT PSD2-exposed (D-22).
  counterpartySignature?: string;
}

// Structural normalized-transaction shape consumed by the engine.
interface TxLike {
  accountId: string;
  amount: number; // signed EUR (negative = outflow)
  counterpartyName: string | null;
  counterpartyIban: string | null;
  normalizedDescription: string;
}

const LORENZO: AccountLike = {
  id: "acct-lorenzo",
  iban: "DE00LORENZO",
  defaultCostCenter: "lorenzo",
  isInvestment: false,
};
const FERNANDA: AccountLike = {
  id: "acct-fernanda",
  iban: "DE00FERNANDA",
  defaultCostCenter: "fernanda",
  isInvestment: false,
};
const SHARED: AccountLike = {
  id: "acct-shared",
  iban: "DE00SHARED",
  defaultCostCenter: "shared",
  isInvestment: false,
};
// Virtual investing account — NOT PSD2-exposed (likely case, A2). Matched on the
// outgoing leg by its stored IBAN / counterparty signature.
const INVESTING: AccountLike = {
  id: "acct-investing",
  iban: "DE00INVESTING",
  defaultCostCenter: "shared",
  isInvestment: true,
  counterpartySignature: "investment account", // real Revolut internal-transfer description (D-22)
};

const accountsById = new Map<string, AccountLike>([
  [LORENZO.id, LORENZO],
  [FERNANDA.id, FERNANDA],
  [SHARED.id, SHARED],
  [INVESTING.id, INVESTING],
]);

describe("applyRules — classify-on-ingest (CAT-02/03/07, D-04/18/19/22/25)", () => {
  it("classifies an outflow into an is_investment account as 'investimento' (D-03/D-22)", () => {
    const tx: TxLike = {
      accountId: LORENZO.id,
      amount: -1000,
      counterpartyName: "Vanguard",
      counterpartyIban: "DE00INVESTING",
      normalizedDescription: "etf contribution",
    };
    expect(applyRules(tx, accountsById).flowType).toBe("investimento");
  });

  it("is investimento regardless of source account and amount (source/amount agnostic)", () => {
    const fromFernanda: TxLike = {
      accountId: FERNANDA.id,
      amount: -250.75,
      counterpartyName: "Vanguard",
      counterpartyIban: "DE00INVESTING",
      normalizedDescription: "vanguard vwce",
    };
    expect(applyRules(fromFernanda, accountsById).flowType).toBe("investimento");
  });

  it("matches the investing pocket by DESCRIPTION when the transfer has no counterparty/IBAN (real Revolut internal transfer to the brokerage, D-22)", () => {
    // The investing pocket is NOT PSD2-exposed, so a contribution carries no counterparty
    // name/IBAN — only "To investment account" in the description. This is the LIVE case the
    // 2026-06-22 cron surfaced; money becoming equity, never a cost.
    const internalTransfer: TxLike = {
      accountId: FERNANDA.id,
      amount: -5000,
      counterpartyName: null,
      counterpartyIban: null,
      normalizedDescription: "to investment account",
    };
    expect(applyRules(internalTransfer, accountsById).flowType).toBe("investimento");
  });

  it("classifies a cash<->cash transfer as 'transferencia' (D-04)", () => {
    const tx: TxLike = {
      accountId: LORENZO.id,
      amount: -500,
      counterpartyName: "Fernanda",
      counterpartyIban: "DE00FERNANDA",
      normalizedDescription: "to fernanda",
    };
    expect(applyRules(tx, accountsById).flowType).toBe("transferencia");
  });

  it("classifies a salary-signature inflow as 'revenue' (faturamento, D-18/D-26)", () => {
    const tx: TxLike = {
      accountId: LORENZO.id,
      amount: 3200,
      counterpartyName: "ACME GmbH",
      counterpartyIban: "DE00ACME",
      normalizedDescription: "salary june lohn gehalt",
    };
    expect(applyRules(tx, accountsById).flowType).toBe("revenue");
  });

  it("classifies sublet rent RECEIVED as 'revenue' with costCenter 'sublocacao' (D-25)", () => {
    const tx: TxLike = {
      accountId: SHARED.id,
      amount: 800,
      counterpartyName: "Subtenant",
      counterpartyIban: "DE00SUBTENANT",
      normalizedDescription: "sublocacao rent",
    };
    const out = applyRules(tx, accountsById);
    expect(out.flowType).toBe("revenue");
    expect(out.costCenter).toBe("sublocacao");
  });

  it("classifies sublet rent/utilities PAID as 'cost' with costCenter 'sublocacao' (D-25)", () => {
    const tx: TxLike = {
      accountId: SHARED.id,
      amount: -200,
      counterpartyName: "Stadtwerke",
      counterpartyIban: "DE00UTILITY",
      normalizedDescription: "sublocacao utilities strom",
    };
    const out = applyRules(tx, accountsById);
    expect(out.flowType).toBe("cost");
    expect(out.costCenter).toBe("sublocacao");
  });

  it("defaults an unmatched outflow to 'cost' (custo, D-18)", () => {
    const tx: TxLike = {
      accountId: FERNANDA.id,
      amount: -19.99,
      counterpartyName: "Netflix",
      counterpartyIban: "IE00NETFLIX",
      normalizedDescription: "netflix subscription",
    };
    expect(applyRules(tx, accountsById).flowType).toBe("cost");
  });

  it("defaults costCenter to the transaction account's default_cost_center (CAT-07/D-19)", () => {
    const fromLorenzo: TxLike = {
      accountId: LORENZO.id,
      amount: -19.99,
      counterpartyName: "Netflix",
      counterpartyIban: "IE00NETFLIX",
      normalizedDescription: "netflix",
    };
    expect(applyRules(fromLorenzo, accountsById).costCenter).toBe("lorenzo");

    const fromFernanda: TxLike = {
      accountId: FERNANDA.id,
      amount: -19.99,
      counterpartyName: "Spotify",
      counterpartyIban: "SE00SPOTIFY",
      normalizedDescription: "spotify",
    };
    expect(applyRules(fromFernanda, accountsById).costCenter).toBe("fernanda");

    const fromShared: TxLike = {
      accountId: SHARED.id,
      amount: -50,
      counterpartyName: "Grocery",
      counterpartyIban: "DE00GROCERY",
      normalizedDescription: "grocery",
    };
    expect(applyRules(fromShared, accountsById).costCenter).toBe("shared");
  });

  it("NEVER classifies a credit leg landing on an is_investment account as 'revenue' (CAT-03)", () => {
    const creditOnInvesting: TxLike = {
      accountId: INVESTING.id,
      amount: 1000,
      counterpartyName: "Lorenzo",
      counterpartyIban: "DE00LORENZO",
      normalizedDescription: "incoming contribution",
    };
    expect(applyRules(creditOnInvesting, accountsById).flowType).not.toBe(
      "revenue",
    );
  });

  // Wave-0 RED (DSN-06b) — RED until Plan 03-02 inserts the `revenue_unclassified` catch.
  // An UNMATCHED positive inflow that is NOT a salary signature, NOT sublet, NOT a transfer,
  // and NOT a credit landing on an investing account is real money IN — it must classify as
  // `revenue` (ruleId `revenue_unclassified`), never default to `cost`. Defaulting a positive
  // inflow to cost is the negative-cost-margin bug (a guest payment subtracting from costs).
  // Today this falls through to `cost` / `cost_default` → this assertion FAILS (the RED state).
  it("classifies an unmatched positive non-salary inflow as 'revenue' / 'revenue_unclassified' (DSN-06b)", () => {
    const guestPayment: TxLike = {
      accountId: SHARED.id,
      amount: 150, // positive: money IN
      counterpartyName: "Guest",
      counterpartyIban: "DE00GUEST", // NOT one of the couple's cash IBANs (not a transfer)
      normalizedDescription: "payment received", // no salary/sublet/investment token
    };
    const out = applyRules(guestPayment, accountsById);
    expect(out.flowType).toBe("revenue");
    expect(out.ruleId).toBe("revenue_unclassified");
  });
});
