// reapply-rule — the PURE, idempotent "re-apply a rule to PAST rows" core (CAT-05, D2-03).
//
// This is NOT a `'use server'` module: it holds only pure functions + types (a Next 15
// file-level `'use server'` module may export ONLY async functions, so the pure matching core
// + the types the FROZEN `test/reapply.test.ts` imports live here). The Server Action that
// wraps this core for a real DB write is `reapply-rule.action.ts`.
//
// "Re-apply to past" is a SEPARATE explicit action (never automatic on save — D2-03/CAT-05)
// and is IDEMPOTENT by construction: only rows NOT ALREADY at the rule's target cost center
// are affected, so a second pass over the updated set returns 0 (no destructive rewrite). The
// matcher mirrors db-rules.ts `matchesDbRule` — a pure, case-insensitive substring test on the
// normalized description; user input is never concatenated into a query (T-02-04).

/** How a rule decides it matches: a case-insensitive substring on the normalized description. */
export interface ReapplyMatchCriteria {
  contains?: string;
}

/** The rule being re-applied: its id, its match criteria, and the cost center it sets. */
export interface ReapplyRule {
  id: string;
  matchCriteria: ReapplyMatchCriteria;
  setsCostCenter: string;
}

/** A transaction in the re-apply candidate set: id + normalized description + current center. */
export interface ReapplyTx {
  id: string;
  normalizedDescription: string;
  costCenter: string | null;
}

/** Pure: does this transaction match the rule's criteria? Case-insensitive substring. */
function matches(tx: ReapplyTx, rule: ReapplyRule): boolean {
  const { contains } = rule.matchCriteria;
  if (contains == null || contains === "") return false;
  return tx.normalizedDescription.toLowerCase().includes(contains.toLowerCase());
}

/**
 * computeReapply — the idempotency core. Returns the ids of transactions that MATCH the rule
 * AND are NOT already at the rule's target cost center. Because already-applied rows are
 * excluded, a second run over the updated set returns `[]` (idempotent). Pure (no mutation).
 */
export function computeReapply(rule: ReapplyRule, transactions: ReapplyTx[]): string[] {
  return transactions
    .filter((tx) => matches(tx, rule) && tx.costCenter !== rule.setsCostCenter)
    .map((tx) => tx.id);
}

/**
 * reapplyRuleToTransactions — the pure re-apply over an in-memory fixture (the shape the
 * frozen `test/reapply.test.ts` asserts). Returns the affected count + the NEW transaction
 * list with matching rows moved to the rule's target cost center. Idempotent: re-running over
 * the returned list yields `affected: 0`. Does not mutate the input array.
 */
export function reapplyRuleToTransactions(
  rule: ReapplyRule,
  transactions: ReapplyTx[],
): { affected: number; transactions: ReapplyTx[] } {
  const targetIds = new Set(computeReapply(rule, transactions));
  const next = transactions.map((tx) =>
    targetIds.has(tx.id) ? { ...tx, costCenter: rule.setsCostCenter } : tx,
  );
  return { affected: targetIds.size, transactions: next };
}
