import { describe, expect, it } from "vitest";

// Wave-0 RED stub (CAT-04/BI-06) — freezes the Server-Action input-validation contract
// for the not-yet-existent zod schemas in src/lib/actions/recategorize.ts (Plan 05) and
// src/lib/actions/budgets.ts (Plan 06). This suite fails at import-resolution time until
// those schemas land — the intended RED anchor.
//
// The write plane is a Next 15 Server Action under the 2-email allowlist RLS; every action
// validates its payload with zod BEFORE touching the DB (untrusted client input, V5).
//
// Synthetic ids only (no PII, T-02-01).
import { RecategorizeInputSchema } from "@/lib/actions/recategorize";
import { BudgetInputSchema } from "@/lib/actions/budgets";

const VALID_UUID = "00000000-0000-4000-8000-000000000000";

describe("RecategorizeInputSchema (CAT-04) — rejects bad payloads, accepts a valid one", () => {
  it("rejects a non-uuid txId", () => {
    const r = RecategorizeInputSchema.safeParse({
      txId: "not-a-uuid",
      costCenter: "lorenzo",
      createRule: false,
    });
    expect(r.success).toBe(false);
  });

  it("rejects a missing costCenter", () => {
    const r = RecategorizeInputSchema.safeParse({ txId: VALID_UUID, createRule: false });
    expect(r.success).toBe(false);
  });

  it("rejects a non-boolean createRule", () => {
    const r = RecategorizeInputSchema.safeParse({
      txId: VALID_UUID,
      costCenter: "lorenzo",
      createRule: "yes",
    });
    expect(r.success).toBe(false);
  });

  it("accepts a well-formed payload", () => {
    const r = RecategorizeInputSchema.safeParse({
      txId: VALID_UUID,
      costCenter: "lorenzo",
      createRule: true,
    });
    expect(r.success).toBe(true);
  });
});

describe("BudgetInputSchema (BI-06) — validates a budget edit payload", () => {
  it("rejects a negative budget amount", () => {
    const r = BudgetInputSchema.safeParse({ costCenter: "shared", categoryId: null, amount: -100 });
    expect(r.success).toBe(false);
  });

  it("accepts a well-formed budget payload", () => {
    const r = BudgetInputSchema.safeParse({ costCenter: "shared", categoryId: null, amount: 1000 });
    expect(r.success).toBe(true);
  });
});
