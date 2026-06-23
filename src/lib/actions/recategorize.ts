"use server";

// Recategorize Server Action — the Transações inline-edit write plane (CAT-04, D2-02/03).
//
// Saving an edit updates EXACTLY ONE transactions row (by id) and, optionally, writes a
// FORWARD-only rule for the merchant. It NEVER touches past transactions — applying a rule to
// history is the SEPARATE explicit `reapplyRuleToPast` action (CAT-05/D2-03; raw history is
// never silently rewritten on save). recategorize.ts deliberately does NOT import the reapply
// action, so saving can never become an automatic bulk rewrite.
//
// FILE-level `'use server'` (exports only async functions); the zod schema lives in the
// sibling `recategorize.schema.ts`, shared types in `recategorize.shared.ts`. LOCKED
// write-plane shape (RESEARCH Pattern 6): zod `.parse` BEFORE any DB write + the
// `@supabase/ssr` server client (anon + user JWT → allowlist RLS authorizes). The update
// carries ONLY the zod-parsed fields (mass-assignment guard) — never a raw client spread.
// NEVER the postgres/Drizzle client, `service_role`, or `DATABASE_URL` (Pitfall 3).

import { revalidatePath } from "next/cache";

import { __createRuleFromTx } from "@/lib/actions/create-rule";
import { RecategorizeInputSchema } from "@/lib/actions/recategorize.schema";
import type { WriteClient, WriteClientFactory } from "@/lib/actions/recategorize.shared";
import { createClient } from "@/lib/supabase/server";

/**
 * __recategorize — the testable core. Validates the untrusted payload, updates ONE
 * transactions row (`.eq('id', txId)` — D2-03, never a bulk update), and when `createRule` is
 * set delegates to `__createRuleFromTx` to write a forward-only rule (D2-02). The `factory`
 * seam injects a fake client so the unit test runs DB-free; production omits it.
 */
export async function __recategorize(
  raw: unknown,
  factory: WriteClientFactory = createClient,
): Promise<{ ok: true }> {
  // V5: validate before any write — `.parse` throws on a bad payload (the action surfaces it).
  const input = RecategorizeInputSchema.parse(raw);
  const sb: WriteClient = await factory();

  // D2-03: update EXACTLY this one row. Write only the two parsed fields (mass-assignment
  // guard) — never a raw spread of client input.
  await sb
    .from("transactions")
    .update({ category_id: input.categoryId ?? null, cost_center: input.costCenter })
    .eq("id", input.txId);

  // D2-02 (forward-only): optionally write a rule so future ingests inherit this mapping.
  // This does NOT modify any existing transaction — applying to history stays explicit.
  if (input.createRule) {
    await __createRuleFromTx(
      {
        merchant: input.merchant ?? "",
        categoryId: input.categoryId ?? null,
        costCenter: input.costCenter,
      },
      factory,
    );
  }

  revalidatePath("/transacoes");
  return { ok: true };
}

/**
 * recategorize — the public Server Action the edit popover calls (optimistic update on the
 * client, reconciled by `revalidatePath`). Wraps `__recategorize` with the real RLS-authorized
 * `@supabase/ssr` client.
 */
export async function recategorize(raw: unknown): Promise<{ ok: true }> {
  return __recategorize(raw);
}

// Re-export the create-rule seam so the recategorize slice's test imports both from one module
// (the popover's two write paths). NOTE: this is `__createRuleFromTx` (the forward-rule
// writer), NOT `reapplyRuleToPast` — recategorize never reaches into the bulk re-apply.
export { __createRuleFromTx } from "@/lib/actions/create-rule";
