// src/lib/ingestion/rules/builtins.ts
//
// The seeded Phase-1 classification rules + their stable ids and version (D-17). The
// engine (engine.ts) evaluates these in PRIORITY order, first-match-wins. Each rule has a
// stable id so a classified transaction can record WHICH rule/version stamped it — editing
// a rule never silently rewrites history (re-apply is an explicit Phase-2 action).
//
// Enum reconciliation (A1/D-27): the schema flow_type enum is
// ['revenue','cost','investimento','transferencia']. The Portuguese D-18 labels
// (faturamento/custo/investimento/transferência) are DISPLAY labels only — the stored
// value is always the enum string here.
//
// SERVER-PLANE ONLY (FND-03). Pure data + matcher signatures — no DB, no network.

/** A stable rule identifier recorded on each classified transaction (D-17). */
export type RuleId =
  | "investimento"
  | "transferencia"
  | "revenue"
  | "sublocacao_revenue"
  | "sublocacao_cost"
  | "cost_default";

/** The seeded rule-set version. Bump when the ordered rule semantics change (D-17). */
export const RULESET_VERSION = 1;

/**
 * Salary / employer-inflow signature (D-18/D-26). Matched case-insensitively against the
 * normalized description (and counterparty name). Seeded from the spike's known employer
 * memos; DE/EN payroll keywords cover Revolut's incoming-salary remittance text.
 */
export const SALARY_SIGNALS = [
  "salary",
  "lohn",
  "gehalt",
  "payroll",
  "bonus",
  "wages",
] as const;

/**
 * Sublet (sublocação) signature (D-25). A transaction tagged sublet overrides the cost
 * center to "sublocacao": a positive (received rent) -> revenue, a negative (rent/utilities
 * paid) -> cost. Matched against the normalized description.
 */
export const SUBLET_SIGNALS = ["sublocacao", "sublocação", "sublet", "untermiete"] as const;

/** The cost-center code applied to sublet-tagged transactions (seeded in cost_centers). */
export const SUBLET_COST_CENTER = "sublocacao";

/** Does the transaction text carry a sublet signature? */
export function matchesSublet(haystack: string): boolean {
  const h = haystack.toLowerCase();
  return SUBLET_SIGNALS.some((s) => h.includes(s));
}

/** Does the transaction text carry a salary signature? */
export function matchesSalary(haystack: string): boolean {
  const h = haystack.toLowerCase();
  return SALARY_SIGNALS.some((s) => h.includes(s));
}
