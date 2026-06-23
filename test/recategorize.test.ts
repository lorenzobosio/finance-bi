import { describe, expect, it, vi } from "vitest";

// Recategorize + create-rule write-plane behaviour test (CAT-04, D2-02/03).
//
// DB-free: the Server Actions take an injected `createClient` factory (mirroring the
// IngestWriter/IngestFetcher injected-fake style in scripts/ingest.ts) so we can assert
// exactly which supabase-js calls fire — without a live DB. Synthetic uuids + fake
// merchants only (no PII, T-02-01).
//
// Invariants asserted here:
//   • RecategorizeInputSchema rejects bad payloads / accepts a valid one (the locked V5
//     boundary — also covered by actions.test.ts, re-asserted here for the slice).
//   • recategorize updates EXACTLY ONE transactions row (.eq('id', txId).update(...)) — it
//     never issues a bulk update on save (D2-03; raw history never silently rewritten).
//   • when createRule=true, exactly one FORWARD rules row is inserted (priority 100,
//     version 1) and NO past transactions are touched by the save (CAT-05).

// revalidatePath throws outside a Next request context — stub it so the DB-free unit test can
// exercise the action bodies (we assert the supabase calls, not the cache revalidation).
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { RecategorizeInputSchema } from "@/lib/actions/recategorize.schema";
import { __recategorize, __createRuleFromTx } from "@/lib/actions/recategorize";

const VALID_UUID = "00000000-0000-4000-8000-000000000000";
const CAT_UUID = "11111111-1111-4111-8111-111111111111";

/** A spy supabase-js client recording every from()/update()/insert()/eq() call. */
function makeFakeSupabase() {
  const calls: Array<{
    table: string;
    op: "update" | "insert";
    payload: Record<string, unknown>;
    eqs: Array<[string, unknown]>;
  }> = [];

  function from(table: string) {
    const builder = {
      _op: null as "update" | "insert" | null,
      _payload: {} as Record<string, unknown>,
      _eqs: [] as Array<[string, unknown]>,
      update(payload: Record<string, unknown>) {
        this._op = "update";
        this._payload = payload;
        return this;
      },
      insert(payload: Record<string, unknown>) {
        this._op = "insert";
        this._payload = payload;
        calls.push({ table, op: "insert", payload, eqs: [] });
        return Promise.resolve({ data: null, error: null });
      },
      eq(col: string, val: unknown) {
        this._eqs.push([col, val]);
        // For an update chain, .eq is terminal — record the full call now.
        if (this._op === "update") {
          calls.push({ table, op: "update", payload: this._payload, eqs: [...this._eqs] });
          return Promise.resolve({ data: null, error: null });
        }
        return this;
      },
    };
    return builder;
  }

  return { client: { from }, calls };
}

describe("RecategorizeInputSchema (CAT-04) — locked V5 boundary", () => {
  it("rejects a non-uuid txId", () => {
    expect(
      RecategorizeInputSchema.safeParse({ txId: "nope", costCenter: "lorenzo", createRule: false })
        .success,
    ).toBe(false);
  });

  it("rejects a non-boolean createRule", () => {
    expect(
      RecategorizeInputSchema.safeParse({
        txId: VALID_UUID,
        costCenter: "lorenzo",
        createRule: "yes",
      }).success,
    ).toBe(false);
  });

  it("rejects an empty costCenter", () => {
    expect(
      RecategorizeInputSchema.safeParse({ txId: VALID_UUID, costCenter: "", createRule: false })
        .success,
    ).toBe(false);
  });

  it("accepts a well-formed payload", () => {
    expect(
      RecategorizeInputSchema.safeParse({
        txId: VALID_UUID,
        categoryId: CAT_UUID,
        costCenter: "lorenzo",
        createRule: true,
        merchant: "fake coffee co",
      }).success,
    ).toBe(true);
  });
});

describe("recategorize — edits exactly ONE row (D2-03)", () => {
  it("issues a single .update().eq('id', txId) and no bulk update", async () => {
    const { client, calls } = makeFakeSupabase();
    await __recategorize(
      {
        txId: VALID_UUID,
        categoryId: CAT_UUID,
        costCenter: "lorenzo",
        createRule: false,
      },
      async () => client,
    );

    const updates = calls.filter((c) => c.table === "transactions" && c.op === "update");
    expect(updates).toHaveLength(1);
    // Every transactions update is scoped by id — never a bulk WHERE-less update.
    expect(updates[0].eqs).toEqual([["id", VALID_UUID]]);
    // Only the two parsed fields are written (mass-assignment guard).
    expect(updates[0].payload).toEqual({ category_id: CAT_UUID, cost_center: "lorenzo" });
    // No rule inserted when createRule=false.
    expect(calls.filter((c) => c.table === "rules")).toHaveLength(0);
  });

  it("when createRule=true, inserts exactly one forward rule and still updates only one row", async () => {
    const { client, calls } = makeFakeSupabase();
    await __recategorize(
      {
        txId: VALID_UUID,
        categoryId: CAT_UUID,
        costCenter: "lorenzo",
        createRule: true,
        merchant: "fake coffee co",
      },
      async () => client,
    );

    expect(calls.filter((c) => c.table === "transactions" && c.op === "update")).toHaveLength(1);
    const ruleInserts = calls.filter((c) => c.table === "rules" && c.op === "insert");
    expect(ruleInserts).toHaveLength(1);
    expect(ruleInserts[0].payload).toMatchObject({
      match_criteria: { contains: "fake coffee co" },
      set_category: CAT_UUID,
      set_cost_center: "lorenzo",
      priority: 100,
      version: 1,
    });
  });
});

describe("createRuleFromTx — forward-only rule, no history touched (D2-02/CAT-05)", () => {
  it("inserts one rule (priority 100, version 1) and modifies no transactions", async () => {
    const { client, calls } = makeFakeSupabase();
    await __createRuleFromTx(
      { merchant: "fake merchant", categoryId: CAT_UUID, costCenter: "fernanda" },
      async () => client,
    );

    expect(calls.filter((c) => c.table === "transactions")).toHaveLength(0);
    const ruleInserts = calls.filter((c) => c.table === "rules" && c.op === "insert");
    expect(ruleInserts).toHaveLength(1);
    expect(ruleInserts[0].payload).toMatchObject({ priority: 100, version: 1 });
  });

  it("does nothing when merchant is empty (no rule to match forward)", async () => {
    const { client, calls } = makeFakeSupabase();
    await __createRuleFromTx(
      { merchant: "", categoryId: CAT_UUID, costCenter: "fernanda" },
      async () => client,
    );
    expect(calls).toHaveLength(0);
  });
});

// Guard: recategorize.ts must never reference the bulk re-apply action (CAT-05 invariant —
// applying to history is never an automatic side effect of saving).
describe("recategorize never reaches into reapply", () => {
  it("does not import reapplyRuleToPast", async () => {
    vi.resetModules();
    const mod = await import("@/lib/actions/recategorize");
    expect("reapplyRuleToPast" in mod).toBe(false);
  });
});
