import { describe, expect, it } from "vitest";

// Phase-9 interaction LOCK (FLOW-01 ↔ GOAL-09, D-03) — a GREEN guard against EXISTING code.
//
// Confirming a recurring series stamps `transactions.is_recurring = true` (the confirm/dismiss
// write-plane, tested in test/recurring-series.action.test.ts). The booking-date-window DB rule
// (GOAL-09 / D5-09) MUST keep SKIPPING those stamped rows — a recurring bill inside a travel window
// is NOT re-tagged to the Brazil/Adventures bucket (db-rules.ts:84 `if (tx.isRecurring === true)
// return false`). This suite freezes that interaction so a future stamp change cannot silently
// desync the two planes. It asserts CURRENT behavior, so it is GREEN immediately (NOT a RED anchor).
//
// Pure; synthetic values only; no PII.
import { matchesDbRule, evaluateDbRules, type DbRule } from "@/lib/ingestion/rules/db-rules";
import type { RuleTx } from "@/lib/ingestion/rules/engine";

// A booking-date-window rule: "we're in Brazil Mar 1–20" → tag matching spend to the brazil bucket.
const WINDOW_RULE: DbRule = {
  id: "rule-brazil-window",
  priority: 1,
  version: 1,
  matchCriteria: { bookingDateFrom: "2026-03-01", bookingDateTo: "2026-03-20" },
  setsFlowType: "cost",
  setsCostCenter: "brazil",
};

// A transaction inside the window. `isRecurring` toggles per test.
function txInWindow(isRecurring: boolean): RuleTx {
  return {
    accountId: "acct-1",
    amount: -12.99,
    counterpartyName: "Spotify",
    counterpartyIban: null,
    normalizedDescription: "spotify",
    bookingDate: "2026-03-10",
    isRecurring,
  };
}

describe("GOAL-09 window rule SKIPS a confirmed-recurring row (D-03 interaction)", () => {
  it("does NOT match a window rule when is_recurring=true (the recurring bill is left alone)", () => {
    expect(matchesDbRule(txInWindow(true), WINDOW_RULE)).toBe(false);
    expect(evaluateDbRules(txInWindow(true), [WINDOW_RULE])).toBeNull();
  });

  it("DOES match the same window rule when is_recurring=false (ordinary in-window spend is tagged)", () => {
    expect(matchesDbRule(txInWindow(false), WINDOW_RULE)).toBe(true);
    expect(evaluateDbRules(txInWindow(false), [WINDOW_RULE])?.setsCostCenter).toBe("brazil");
  });

  it("treats an undefined isRecurring as not-recurring (the window still applies)", () => {
    const tx = { ...txInWindow(false) };
    delete (tx as { isRecurring?: boolean }).isRecurring;
    expect(matchesDbRule(tx, WINDOW_RULE)).toBe(true);
  });
});
