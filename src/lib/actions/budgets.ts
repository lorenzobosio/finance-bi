"use server";

// Budgets Server Actions — the FIRST write plane (BI-06, D2-12/13/14, RESEARCH Pattern 6).
//
// FILE-level `'use server'` so a Client Component (the BudgetEditor) can import these actions
// directly. A file-level directive may export ONLY async functions, so the zod schema + types
// live in the sibling `budgets.schema.ts` — the locked validation boundary every write flows
// through. The action: zod `.parse` (validate the untrusted client payload BEFORE any DB
// write, V5) + the `@supabase/ssr` server client (anon key + the user's JWT, so the existing
// `allowlist_all for all to authenticated` RLS on `budgets` authorizes the write — both
// allowlisted users may write; it is NOT per-member) + `revalidatePath`.
//
// SECURITY (T-02-14/15/16, RESEARCH Pitfall 3): this module NEVER imports the postgres/Drizzle
// client, `service_role`, or `DATABASE_URL` — RLS is the authorization wall, not a TS check.
// The DB write only ever carries the zod-PARSED fields (an explicit allow-list), never a raw
// spread of client input (the mass-assignment guard).

import { revalidatePath } from "next/cache";

import { BudgetInputSchema } from "@/lib/actions/budgets.schema";
import { createClient } from "@/lib/supabase/server";

/**
 * setBudget — upsert ONE budget row for (cost_center, category_id, period_key). Re-saving the
 * same key UPDATES in place (never a duplicate). Because `category_id` is nullable and there
 * is no DB unique constraint spanning a nullable column, this uses the check-then-write
 * idempotency idiom (mirrors `ingest.ts` `upsertBalance`): look up the existing row by the
 * three keys, then UPDATE it, else INSERT — all under the user JWT + RLS.
 */
export async function setBudget(raw: unknown): Promise<{ ok: true }> {
  // V5: validate before any write. `.parse` throws on a bad payload (the action surfaces it).
  const input = BudgetInputSchema.parse(raw);
  const sb = await createClient();

  // Find an existing budget row for this exact key (null-safe on category_id).
  const existing = sb
    .from("budgets")
    .select("id")
    .eq("cost_center", input.costCenter)
    .eq("period_key", input.periodKey);
  const keyed =
    input.categoryId === null
      ? existing.is("category_id", null)
      : existing.eq("category_id", input.categoryId);
  const { data: found } = await keyed.maybeSingle();

  if (found?.id) {
    // Update in place — only the parsed `amount_eur` field (mass-assignment guard).
    await sb.from("budgets").update({ amount_eur: input.amount }).eq("id", found.id);
  } else {
    // Insert — write ONLY the zod-parsed fields, never a raw client spread.
    await sb.from("budgets").insert({
      cost_center: input.costCenter,
      category_id: input.categoryId,
      period_key: input.periodKey,
      amount_eur: input.amount,
    });
  }

  // Reconcile the optimistic UI on both surfaces the budget affects.
  revalidatePath("/config");
  revalidatePath("/cost-centers");
  return { ok: true };
}

/**
 * setBudgetFromHistory — propose a budget from a PRIOR period's actual (D2-13), so the editor
 * prefills a real figure instead of inventing an arbitrary cap. Reads `v_costcenter_bva.actual`
 * for the given key at the prior period via the same SSR client (under RLS) and returns the
 * suggested amount; it does NOT write — the user reviews then saves via `setBudget`.
 */
export async function setBudgetFromHistory(
  costCenter: string,
  categoryId: string | null,
  priorPeriodKey: number,
): Promise<{ suggestedAmount: number }> {
  const sb = await createClient();
  const q = sb
    .from("v_costcenter_bva")
    .select("actual")
    .eq("cost_center", costCenter)
    .eq("period_key", priorPeriodKey);
  const keyed = categoryId === null ? q.is("category_id", null) : q.eq("category_id", categoryId);
  const { data } = await keyed.maybeSingle();

  const actual = data?.actual == null ? 0 : Number(data.actual);
  return { suggestedAmount: Number.isFinite(actual) ? Math.abs(actual) : 0 };
}
