import { describe, expect, it } from "vitest";

// Wave-0 RED stub (CAT-04, D2-04) — freezes the DB-backed rules contract for the
// not-yet-existent src/lib/ingestion/rules/db-rules.ts (Plan 02 creates the DB-rule
// loader/orderer) and the BUILTIN_RULE_IDS uuid map added to builtins.ts. This suite
// fails at import-resolution time until those land — the intended RED anchor.
//
// The FROZEN engine contract (test/rules.test.ts) is untouched: this file only adds the
// NEW DB-rule-ordering + rule_id-resolution behavior on top of the existing builtin engine.
//
// Synthetic data only (no PII / no € amounts that are real, T-02-01).
import { evaluateDbRules, type DbRule } from "@/lib/ingestion/rules/db-rules";
import { BUILTIN_RULE_IDS, type RuleId } from "@/lib/ingestion/rules/builtins";

// A minimal transaction shape the DB-rule matcher reads (mirrors the engine's TxLike).
const tx = (normalizedDescription: string) => ({
  accountId: "acct-shared",
  amount: -50,
  counterpartyName: null,
  counterpartyIban: null,
  normalizedDescription,
});

describe("evaluateDbRules — DB rules consulted in (priority, version) order, first-match-wins (CAT-04)", () => {
  const rules: DbRule[] = [
    { id: "db-rule-2", priority: 20, version: 1, matchCriteria: { contains: "coffee" }, setsFlowType: "cost", setsCostCenter: "lorenzo" },
    { id: "db-rule-1", priority: 10, version: 1, matchCriteria: { contains: "coffee" }, setsFlowType: "cost", setsCostCenter: "shared" },
  ];

  it("returns the lowest-priority matching rule first (10 before 20)", () => {
    const match = evaluateDbRules(tx("morning coffee"), rules);
    expect(match?.id).toBe("db-rule-1");
    expect(match?.setsCostCenter).toBe("shared");
  });

  it("falls through (returns null) when no DB rule matches, so the builtin engine takes over", () => {
    const match = evaluateDbRules(tx("unmatched grocery run"), rules);
    expect(match).toBeNull();
  });
});

describe("rule_id resolution (CAT-04/D2-04) — a builtin RuleId resolves to a real uuid", () => {
  it("BUILTIN_RULE_IDS maps every builtin RuleId to a uuid string", () => {
    const ids: RuleId[] = [
      "investimento",
      "transferencia",
      "revenue",
      "sublocacao_revenue",
      "sublocacao_cost",
      "cost_default",
    ];
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    for (const id of ids) {
      expect(uuidRe.test(BUILTIN_RULE_IDS[id])).toBe(true);
    }
  });
});
