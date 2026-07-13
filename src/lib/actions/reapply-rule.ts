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
//
// GOAL-09 / D5-09 — the booking-date-window auto-tag ("we're in Brazil Dec 1–20"). A travel
// window is a rule whose match_criteria carries `bookingDateFrom`/`bookingDateTo` (inclusive
// YYYY-MM-DD). When a window is present the matcher tags ONLY transactions booked inside the
// window AND with `is_recurring = false` (known recurring bills are skipped — spec option (b)),
// still purely in-memory (the window is a structured predicate, never a SQL string — T-05-18).

import { isWithinInterval, parseISO } from "date-fns";

/**
 * How a rule decides it matches. `contains` is the case-insensitive substring on the normalized
 * description; `bookingDateFrom`/`bookingDateTo` (inclusive YYYY-MM-DD) are the optional
 * booking-date window (D5-09). When a window is present it is ANDed with `contains` (if any) and
 * additionally requires `is_recurring = false`; a pure date-window rule carries no `contains`.
 */
export interface ReapplyMatchCriteria {
  contains?: string;
  /** Inclusive lower bound (YYYY-MM-DD) of the booking-date window (D5-09). */
  bookingDateFrom?: string;
  /** Inclusive upper bound (YYYY-MM-DD) of the booking-date window (D5-09). */
  bookingDateTo?: string;
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
  /** Booking date (YYYY-MM-DD) — only consulted for booking-date-window rules (D5-09). */
  bookingDate?: string;
  /** Recurring-bill hint — window rules SKIP recurring rows (D5-09, spec option (b)). */
  isRecurring?: boolean;
}

/**
 * Pure: does this transaction match the rule's criteria? A `contains` predicate is a
 * case-insensitive substring on the normalized description. A booking-date window (D5-09) is
 * ANDed on top: the transaction's `bookingDate` must fall inside [from, to] inclusive AND its
 * `isRecurring` flag must be false (recurring bills are skipped). A rule with neither predicate
 * matches nothing. The window comparison is a pure `date-fns` interval test — no SQL concat.
 */
function matches(tx: ReapplyTx, rule: ReapplyRule): boolean {
  const { contains, bookingDateFrom, bookingDateTo } = rule.matchCriteria;
  const hasContains = contains != null && contains !== "";
  const hasWindow = bookingDateFrom != null && bookingDateTo != null;
  if (!hasContains && !hasWindow) return false;

  if (hasContains && !tx.normalizedDescription.toLowerCase().includes(contains!.toLowerCase())) {
    return false;
  }

  if (hasWindow) {
    // D5-09: window rules skip known recurring bills and rows lacking a booking date.
    if (tx.isRecurring === true) return false;
    if (tx.bookingDate == null) return false;
    const inWindow = isWithinInterval(parseISO(tx.bookingDate), {
      start: parseISO(bookingDateFrom!),
      end: parseISO(bookingDateTo!),
    });
    if (!inWindow) return false;
  }

  return true;
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
