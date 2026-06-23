// src/lib/ingestion/rules/engine.ts
//
// applyRules(tx, accountsById) -> Classification: the PURE, ordered, first-match-wins
// classifier (CAT-02/03/07, D-04/18/19/22/25/26). The cron stamps the result onto each row
// at write time and records rule_id + the ruleset version for auditability.
//
// Ordered priority (first match wins):
//   1. investimento (HIGHEST) — an OUTFLOW whose destination resolves to ANY
//      is_investment=true account. The investing pocket is NOT PSD2-exposed (A2/D-22), so
//      the destination is matched on the OUTGOING leg against the virtual investing
//      account's stored IBAN or its counterparty signature (e.g. "investment account"). Source- and
//      amount-agnostic: the €4k may arrive from any cash account in one or more transfers.
//   2. transferencia — counterparty IBAN is one of the couple's own cash accounts (D-04).
//   3. revenue — a salary/employer inflow (D-18/D-26); sublet rent RECEIVED is revenue with
//      costCenter "sublocacao" (D-25).
//   4. cost — everything else (D-18); sublet rent/utilities PAID is cost with costCenter
//      "sublocacao" (D-25).
//
// The credit leg landing ON an is_investment account is NEVER "revenue" (CAT-03): an inflow
// onto an investing account short-circuits to cost (it is an internal move, not income),
// so SUM(WHERE flow_type='revenue') never double-counts the contribution.
//
// costCenter ALWAYS defaults to the transaction account's default_cost_center (CAT-07/D-19)
// unless a rule overrides it (sublocacao). Investimento detection keys on is_investment=true,
// NEVER a hardcoded account id.
//
// SERVER-PLANE ONLY (FND-03). Pure — no DB, no network, no PII logging. Deterministic.

import {
  RULESET_VERSION,
  matchesSalary,
  matchesSublet,
  SUBLET_COST_CENTER,
  type RuleId,
} from "./builtins";
import { evaluateDbRules, type DbRule } from "./db-rules";

/** The account shape the engine matches against (the analytical subset). */
export interface RuleAccount {
  id: string;
  iban: string | null;
  defaultCostCenter: string;
  isInvestment: boolean;
  /** Counterparty/description signature for matching a NON-exposed investing account (D-22). */
  counterpartySignature?: string;
}

/** The normalized-transaction subset the engine consumes. */
export interface RuleTx {
  accountId: string;
  amount: number; // signed EUR (negative = outflow)
  counterpartyName: string | null;
  counterpartyIban: string | null;
  normalizedDescription: string;
}

/** The classification stamped onto a transaction at ingest time. */
export interface Classification {
  flowType: "revenue" | "cost" | "investimento" | "transferencia";
  costCenter: string;
  categoryId: string | null;
  isRecurring: boolean;
  // A builtin RuleId string (resolved to its seeded uuid by the writer via BUILTIN_RULE_IDS)
  // OR, when a DB rule matched, the DB rule's real uuid (already a `rules.id`). The writer
  // stamps this onto transactions.rule_id — never NULL (D2-04).
  ruleId: RuleId | string;
  ruleVersion: number;
}

/**
 * Does this outflow's destination resolve to the given investing account?
 *
 * The investing pocket is NOT PSD2-exposed (A2/D-22), so we match the OUTGOING leg against
 * the virtual account's stored IBAN (when the contribution carries the investing IBAN as
 * counterparty) OR its seeded counterparty/description signature (e.g. "investment account").
 */
function resolvesToInvestingAccount(tx: RuleTx, inv: RuleAccount): boolean {
  // IBAN match — the contribution's counterparty IBAN is the investing account's IBAN.
  if (inv.iban && tx.counterpartyIban && tx.counterpartyIban === inv.iban) {
    return true;
  }
  // Signature match — counterparty name or description carries the seeded signature.
  if (inv.counterpartySignature) {
    const sig = inv.counterpartySignature.toLowerCase();
    const name = (tx.counterpartyName ?? "").toLowerCase();
    if (name.includes(sig) || tx.normalizedDescription.includes(sig)) {
      return true;
    }
  }
  return false;
}

/**
 * Classify one normalized transaction. Pure, ordered, first-match-wins.
 */
export function applyRules(
  tx: RuleTx,
  accountsById: Map<string, RuleAccount>,
  dbRules: DbRule[] = [],
): Classification {
  const accounts = [...accountsById.values()];
  const baseCostCenter = accountsById.get(tx.accountId)?.defaultCostCenter ?? "shared";

  // 0. DB rules consulted FIRST (CAT-04) — user-authored overrides win over the builtins, in
  // (priority, version) order, first-match-wins. A match short-circuits the builtin cascade and
  // stamps the DB rule's real uuid as ruleId (auditable). When none match (or dbRules is the
  // default []), fall through UNCHANGED to the frozen builtin cascade below (Pitfall 6 — the
  // default keeps test/rules.test.ts green). The engine stays pure: the cron loads + passes the
  // rows; the engine never queries the DB.
  const dbMatch = evaluateDbRules(tx, dbRules);
  if (dbMatch) {
    return {
      flowType: dbMatch.setsFlowType ?? "cost",
      costCenter: dbMatch.setsCostCenter ?? baseCostCenter,
      categoryId: null,
      isRecurring: false,
      ruleId: dbMatch.id,
      ruleVersion: dbMatch.version,
    };
  }
  const investingAccounts = accounts.filter((a) => a.isInvestment);
  const cashIbans = new Set(
    accounts.filter((a) => !a.isInvestment && a.iban).map((a) => a.iban as string),
  );

  // The credit leg landing ON an is_investment account is NEVER revenue (CAT-03). An inflow
  // onto an investing account is an internal contribution leg, not income -> classify it as
  // a (non-P&L-revenue) move. Treat it as cost so it never enters the revenue SUM, but it
  // is excluded from the €100k investimento total too (only the OUTGOING leg counts once).
  const txAccount = accountsById.get(tx.accountId);
  const isCreditOntoInvesting = txAccount?.isInvestment === true && tx.amount > 0;

  // 1. investimento (highest) — an OUTFLOW whose destination is ANY is_investment account.
  if (tx.amount < 0 && investingAccounts.some((inv) => resolvesToInvestingAccount(tx, inv))) {
    return {
      flowType: "investimento",
      costCenter: baseCostCenter,
      categoryId: null,
      isRecurring: true,
      ruleId: "investimento",
      ruleVersion: RULESET_VERSION,
    };
  }

  // 2. transferencia — counterparty IBAN is one of the couple's own cash accounts.
  if (tx.counterpartyIban && cashIbans.has(tx.counterpartyIban)) {
    return {
      flowType: "transferencia",
      costCenter: baseCostCenter,
      categoryId: null,
      isRecurring: false,
      ruleId: "transferencia",
      ruleVersion: RULESET_VERSION,
    };
  }

  const isSublet = matchesSublet(
    `${tx.normalizedDescription} ${tx.counterpartyName ?? ""}`,
  );

  // 3. revenue — a salary/employer inflow, OR sublet rent received. Never for a credit leg
  //    landing on an investing account (CAT-03 — falls through to cost below).
  if (tx.amount > 0 && !isCreditOntoInvesting) {
    if (isSublet) {
      return {
        flowType: "revenue",
        costCenter: SUBLET_COST_CENTER,
        categoryId: null,
        isRecurring: false,
        ruleId: "sublocacao_revenue",
        ruleVersion: RULESET_VERSION,
      };
    }
    if (
      matchesSalary(`${tx.normalizedDescription} ${tx.counterpartyName ?? ""}`)
    ) {
      return {
        flowType: "revenue",
        costCenter: baseCostCenter,
        categoryId: null,
        isRecurring: true,
        ruleId: "revenue",
        ruleVersion: RULESET_VERSION,
      };
    }
  }

  // 4. cost (default) — sublet paid overrides costCenter to "sublocacao".
  if (isSublet) {
    return {
      flowType: "cost",
      costCenter: SUBLET_COST_CENTER,
      categoryId: null,
      isRecurring: false,
      ruleId: "sublocacao_cost",
      ruleVersion: RULESET_VERSION,
    };
  }

  return {
    flowType: "cost",
    costCenter: baseCostCenter,
    categoryId: null,
    isRecurring: false,
    ruleId: "cost_default",
    ruleVersion: RULESET_VERSION,
  };
}
