import { describe, expect, it } from "vitest";

// Wave-0 RED stub (CAT-05) — freezes the idempotent re-apply contract for the
// not-yet-existent src/lib/actions/reapply-rule.ts (Plan 06 creates the PURE re-apply
// core; the Server Action wraps it). This suite fails at import-resolution time until
// that core lands — the intended RED anchor.
//
// "Re-apply to past" is a SEPARATE explicit action (never automatic on save, D2-03/CAT-05)
// and is IDEMPOTENT: the first pass updates the matching rows and returns affected > 0;
// a second pass over the now-updated set returns exactly 0 (no destructive rewrite).
//
// Synthetic round numbers + fake merchants only (T-02-01).
import {
  reapplyRuleToTransactions,
  computeReapply,
  type ReapplyTx,
  type ReapplyRule,
} from "@/lib/actions/reapply-rule";

const rule: ReapplyRule = {
  id: "rule-coffee",
  matchCriteria: { contains: "coffee" },
  setsCostCenter: "lorenzo",
};

describe("reapplyRuleToTransactions — idempotent re-apply core (CAT-05)", () => {
  const seed: ReapplyTx[] = [
    { id: "t1", normalizedDescription: "morning coffee", costCenter: "shared" },
    { id: "t2", normalizedDescription: "weekend coffee", costCenter: "shared" },
    { id: "t3", normalizedDescription: "grocery run", costCenter: "shared" },
  ];

  it("first pass updates the matching rows and returns affected > 0", () => {
    const { affected, transactions } = reapplyRuleToTransactions(rule, seed);
    expect(affected).toBe(2); // t1 + t2 match "coffee"
    expect(transactions.find((t) => t.id === "t1")?.costCenter).toBe("lorenzo");
    expect(transactions.find((t) => t.id === "t3")?.costCenter).toBe("shared"); // untouched
  });

  it("second pass over the now-updated set returns exactly 0 (idempotent, no rewrite)", () => {
    const first = reapplyRuleToTransactions(rule, seed);
    const second = reapplyRuleToTransactions(rule, first.transactions);
    expect(second.affected).toBe(0);
  });
});

describe("computeReapply — the pure affected-id core (CAT-05)", () => {
  const seed: ReapplyTx[] = [
    { id: "t1", normalizedDescription: "morning coffee", costCenter: "shared" },
    { id: "t2", normalizedDescription: "weekend coffee", costCenter: "lorenzo" }, // already target
    { id: "t3", normalizedDescription: "grocery run", costCenter: "shared" },
  ];

  it("targets only matching rows NOT already at the rule's target", () => {
    const ids = computeReapply(rule, seed);
    // t1 matches + is not target → included; t2 matches but is already 'lorenzo' → excluded;
    // t3 does not match → excluded.
    expect(ids).toEqual(["t1"]);
  });

  it("a second pass over the already-applied set returns no ids (idempotent)", () => {
    const first = reapplyRuleToTransactions(rule, seed);
    expect(computeReapply(rule, first.transactions)).toEqual([]);
  });
});

// Wave-0 TDD RED (GOAL-09, D5-09) — the booking-date-window auto-tag. A travel window
// ("in Brazil Dec 1–20") is a rule whose match_criteria carries `bookingDateFrom`/`bookingDateTo`;
// the EXPLICIT re-apply tags ONLY transactions booked inside the window AND with `is_recurring =
// false` (known recurring bills are skipped — spec option (b)), and stays idempotent. The pure
// matcher (Plan 06 extends `computeReapply`) must add a window+recurring predicate WITHOUT any SQL
// string-concat (T-05-18). RED for the right reason: today's matcher only tests `contains`, so a
// pure date-window rule matches nothing → the in-window rows are not tagged.
//
// The extended shapes below are the FUTURE contract (extra fields on ReapplyRule/ReapplyTx). They
// are cast to the imported types at the call site so the test compiles against the current types
// while asserting the not-yet-implemented behavior.
interface DateWindowCriteria {
  bookingDateFrom?: string; // inclusive YYYY-MM-DD
  bookingDateTo?: string; // inclusive YYYY-MM-DD
}
interface WindowTx extends ReapplyTx {
  bookingDate: string; // YYYY-MM-DD
  isRecurring: boolean;
}

describe("date-window (GOAL-09/D5-09) — booking-date-scoped rule tags only in-window, non-recurring rows", () => {
  const windowRule = {
    id: "rule-brazil-trip",
    // A pure date-window rule (no `contains`): the window IS the match criteria.
    matchCriteria: { bookingDateFrom: "2025-12-01", bookingDateTo: "2025-12-20" } as DateWindowCriteria,
    setsCostCenter: "brazil",
  } as unknown as ReapplyRule;

  const seed: WindowTx[] = [
    // inside the window, discretionary → SHOULD be tagged
    { id: "in-1", normalizedDescription: "flight sao paulo", costCenter: "shared", bookingDate: "2025-12-05", isRecurring: false },
    { id: "in-2", normalizedDescription: "hotel rio", costCenter: "shared", bookingDate: "2025-12-18", isRecurring: false },
    // inside the window but RECURRING (a known bill) → SKIPPED (spec option (b))
    { id: "rec", normalizedDescription: "netflix", costCenter: "shared", bookingDate: "2025-12-10", isRecurring: true },
    // OUTSIDE the window → SKIPPED
    { id: "out", normalizedDescription: "grocery run", costCenter: "shared", bookingDate: "2025-11-28", isRecurring: false },
  ];

  it("targets ONLY in-window, non-recurring rows (skips recurring + out-of-window)", () => {
    const ids = computeReapply(windowRule, seed as unknown as ReapplyTx[]);
    expect(ids.sort()).toEqual(["in-1", "in-2"]);
  });

  it("is idempotent: a second re-apply over the tagged set returns []", () => {
    const first = reapplyRuleToTransactions(windowRule, seed as unknown as ReapplyTx[]);
    expect(computeReapply(windowRule, first.transactions)).toEqual([]);
  });
});
