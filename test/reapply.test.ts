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
import { reapplyRuleToTransactions, type ReapplyTx, type ReapplyRule } from "@/lib/actions/reapply-rule";

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
