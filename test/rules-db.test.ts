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
import { applyRules, type RuleAccount } from "@/lib/ingestion/rules/engine";
import { evaluateDbRules, type DbRule } from "@/lib/ingestion/rules/db-rules";
import { BUILTIN_RULE_IDS, type RuleId } from "@/lib/ingestion/rules/builtins";

// The cost-center codes that exist in cost_centers.code after 0003 + 0005 (the `shared`
// alias added in 0005 keeps the engine's emitted codes a strict SUBSET — no FK drift).
const KNOWN_COST_CENTERS = new Set([
  "lorenzo",
  "fernanda",
  "compartilhado",
  "sublocacao",
  "shared",
]);

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

  it("BUILTIN_RULE_IDS maps each RuleId to its exact seeded literal uuid (0005 + the 0009 revenue_unclassified)", () => {
    expect(BUILTIN_RULE_IDS).toEqual({
      investimento: "66666666-6666-6666-6666-666666660001",
      transferencia: "66666666-6666-6666-6666-666666660002",
      revenue: "66666666-6666-6666-6666-666666660003",
      sublocacao_revenue: "66666666-6666-6666-6666-666666660004",
      sublocacao_cost: "66666666-6666-6666-6666-666666660005",
      cost_default: "66666666-6666-6666-6666-666666660006",
      // DSN-06b / D3-12 — the revenue_unclassified builtin, seeded in 0009 (ordinal 0007).
      revenue_unclassified: "66666666-6666-6666-6666-666666660007",
    });
  });
});

describe("cost-center drift resolved (RESEARCH Pitfall 1) — emitted codes ⊆ cost_centers.code", () => {
  // Fixtures cover every cost-center branch the engine can take: per-account defaults
  // (lorenzo/fernanda/shared), the sublocacao override (received + paid), and the
  // investimento/transferencia paths. After 0005 the `shared` alias FK-resolves, so the
  // full emitted set is a strict subset of cost_centers.code (no orphan code).
  const LORENZO: RuleAccount = {
    id: "acct-lorenzo",
    iban: "DE00LORENZO",
    defaultCostCenter: "lorenzo",
    isInvestment: false,
  };
  const FERNANDA: RuleAccount = {
    id: "acct-fernanda",
    iban: "DE00FERNANDA",
    defaultCostCenter: "fernanda",
    isInvestment: false,
  };
  const SHARED: RuleAccount = {
    id: "acct-shared",
    iban: "DE00SHARED",
    defaultCostCenter: "shared",
    isInvestment: false,
  };
  const INVESTING: RuleAccount = {
    id: "acct-investing",
    iban: "DE00INVESTING",
    defaultCostCenter: "shared",
    isInvestment: true,
    counterpartySignature: "investment account",
  };
  const accountsById = new Map<string, RuleAccount>([
    [LORENZO.id, LORENZO],
    [FERNANDA.id, FERNANDA],
    [SHARED.id, SHARED],
    [INVESTING.id, INVESTING],
  ]);

  const fixtures = [
    { accountId: LORENZO.id, amount: -19.99, counterpartyName: "Netflix", counterpartyIban: "IE00NETFLIX", normalizedDescription: "netflix" },
    { accountId: FERNANDA.id, amount: -50, counterpartyName: "Grocery", counterpartyIban: "DE00GROCERY", normalizedDescription: "grocery" },
    { accountId: SHARED.id, amount: -50, counterpartyName: "Grocery", counterpartyIban: "DE00GROCERY", normalizedDescription: "grocery" },
    { accountId: SHARED.id, amount: 800, counterpartyName: "Tenant", counterpartyIban: "DE00TENANT", normalizedDescription: "sublocacao rent" },
    { accountId: SHARED.id, amount: -200, counterpartyName: "Utility", counterpartyIban: "DE00UTILITY", normalizedDescription: "sublocacao utilities" },
    { accountId: FERNANDA.id, amount: -5000, counterpartyName: null, counterpartyIban: null, normalizedDescription: "to investment account" },
    { accountId: LORENZO.id, amount: -500, counterpartyName: "Fernanda", counterpartyIban: "DE00FERNANDA", normalizedDescription: "to fernanda" },
  ];

  it("every fixture emits a cost_center that exists in cost_centers.code (no orphan 'shared')", () => {
    for (const tx of fixtures) {
      const out = applyRules(tx, accountsById);
      expect(KNOWN_COST_CENTERS.has(out.costCenter)).toBe(true);
    }
  });
});

describe("DB-backed engine (CAT-04) — applyRules consults dbRules first, then builtins", () => {
  const SHARED: RuleAccount = {
    id: "acct-shared",
    iban: "DE00SHARED",
    defaultCostCenter: "shared",
    isInvestment: false,
  };
  const accountsById = new Map<string, RuleAccount>([[SHARED.id, SHARED]]);

  const dbRules: DbRule[] = [
    { id: "db-rule-2", priority: 20, version: 1, matchCriteria: { contains: "coffee" }, setsFlowType: "cost", setsCostCenter: "lorenzo" },
    { id: "db-rule-1", priority: 10, version: 1, matchCriteria: { contains: "coffee" }, setsFlowType: "cost", setsCostCenter: "fernanda" },
  ];

  const tx = (normalizedDescription: string) => ({
    accountId: SHARED.id,
    amount: -50,
    counterpartyName: null,
    counterpartyIban: null,
    normalizedDescription,
  });

  it("a matching DB rule wins (first-match in priority order) and stamps its DB uuid as ruleId", () => {
    const out = applyRules(tx("morning coffee"), accountsById, dbRules);
    expect(out.ruleId).toBe("db-rule-1");
    expect(out.costCenter).toBe("fernanda");
    expect(out.flowType).toBe("cost");
  });

  it("falls through to the builtin cascade when NO DB rule matches (ruleId is a builtin RuleId)", () => {
    const out = applyRules(tx("unmatched grocery run"), accountsById, dbRules);
    expect(out.ruleId).toBe("cost_default");
  });

  it("with the default (no dbRules arg) behaves identically to the frozen builtin engine", () => {
    const out = applyRules(tx("morning coffee"), accountsById);
    expect(out.ruleId).toBe("cost_default");
  });
});
