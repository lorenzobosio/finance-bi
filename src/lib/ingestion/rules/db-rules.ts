// src/lib/ingestion/rules/db-rules.ts
//
// The DB-rule plane of the classifier (CAT-04, D2-02/04). User-authored rules live in the
// `rules` table; the engine consults them FIRST (priority, version ascending; first-match-wins)
// and falls back to the hardcoded builtin cascade in engine.ts when none match. So a manual
// override persists FORWARD without rewriting the frozen builtin contract.
//
// PURITY (RESEARCH Pattern 5 / Pitfall 6, FND-03): this module is PURE — it never queries the
// DB. The cron (scripts/ingest.ts, the WRITE plane) LOADS the rows via the postgres driver and
// passes them in; the ordering + matching here are pure functions so the test runs DB-free,
// mirroring the typed-read / pure-derive split in src/lib/status/connection-status.ts.
//
// SERVER-PLANE ONLY. No DB, no network, no PII logging. Deterministic.

import type { RuleTx } from "./engine";

/** The flow types a DB rule can stamp (mirrors the schema flow_type enum). */
export type DbFlowType = "revenue" | "cost" | "investimento" | "transferencia";

/**
 * How a DB rule decides it matches a transaction. Kept as a small structured object (NOT a
 * raw string) so the matcher never string-concats user input into a query — the comparison is
 * a pure in-memory substring test (T-02-04). `contains` is matched case-insensitively against
 * the normalized description. Extend with more predicates (e.g. `equalsCounterparty`) as the
 * in-app rule editor grows.
 */
export interface DbMatchCriteria {
  /** Case-insensitive substring matched against the normalized description. */
  contains?: string;
}

/**
 * A user-authored rule row loaded from the `rules` table (the cron loads these; the engine
 * receives them as an argument and stays pure). `id` is the real `rules.id` uuid — it is
 * stamped onto a matched transaction's `rule_id`, so a DB-rule classification is auditable
 * exactly like a builtin one.
 */
export interface DbRule {
  id: string;
  priority: number;
  version: number;
  matchCriteria: DbMatchCriteria;
  setsFlowType: DbFlowType | null;
  setsCostCenter: string | null;
}

/**
 * Pure ordering: sort DB rules by (priority, version) ascending — the engine's first-match
 * order. Stable (does not mutate the input). A lower priority number wins first.
 */
export function orderDbRules(rows: DbRule[]): DbRule[] {
  return [...rows].sort((a, b) => a.priority - b.priority || a.version - b.version);
}

/** Does this DB rule's criteria match the transaction? Pure, case-insensitive substring. */
export function matchesDbRule(tx: RuleTx, rule: DbRule): boolean {
  const { contains } = rule.matchCriteria;
  if (contains == null || contains === "") return false;
  return tx.normalizedDescription.toLowerCase().includes(contains.toLowerCase());
}

/**
 * Evaluate DB rules in (priority, version) order, first-match-wins. Returns the matching
 * rule, or null when none match (so the builtin cascade in engine.ts takes over). Pure.
 */
export function evaluateDbRules(tx: RuleTx, rows: DbRule[]): DbRule | null {
  for (const rule of orderDbRules(rows)) {
    if (matchesDbRule(tx, rule)) return rule;
  }
  return null;
}
