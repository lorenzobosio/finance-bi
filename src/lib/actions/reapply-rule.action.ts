"use server";

// reapplyRuleToPast — the explicit, idempotent Server Action that re-applies a rule to PAST
// transactions (CAT-05, D2-03). FILE-level `'use server'` (exports only the async action); the
// PURE matching core + types live in the sibling `reapply-rule.ts`.
//
// This action is invoked ONLY from the Transações "Re-apply to {n} matching past transactions"
// confirm dialog — NEVER automatically on save. recategorize.ts / create-rule.ts do not import
// it, so saving an edit can never become an automatic bulk rewrite of history.
//
// It writes through `@supabase/ssr` (anon + user JWT → the existing allowlist RLS on
// `transactions` authorizes) — never `service_role`/Drizzle/`DATABASE_URL` in the request path.
// Idempotent: only rows not already at the target are updated, so a re-run affects 0 rows.

import { revalidatePath } from "next/cache";

import {
  computeReapply,
  type ReapplyRule,
  type ReapplyTx,
} from "@/lib/actions/reapply-rule";
import { createClient } from "@/lib/supabase/server";

/**
 * Resolve a rule by its uuid id, or — when the caller passes a merchant string (the inline
 * editor's re-apply dialog only knows the merchant) — by the most-recent forward rule whose
 * `match_criteria.contains` equals that merchant. Returns null if no usable rule exists.
 */
async function resolveRule(sb: Awaited<ReturnType<typeof createClient>>, ruleKey: string) {
  const isUuid = /^[0-9a-fA-F-]{36}$/.test(ruleKey);
  if (isUuid) {
    const { data } = await sb
      .from("rules")
      .select("id, match_criteria, set_cost_center")
      .eq("id", ruleKey)
      .maybeSingle();
    return data ?? null;
  }
  // Merchant lookup: the forward rule recategorize/createRuleFromTx wrote stores
  // `{ contains: merchant }`. Pick the most recent matching rule with a target cost center.
  const { data } = await sb
    .from("rules")
    .select("id, match_criteria, set_cost_center, created_at")
    .eq("match_criteria->>contains", ruleKey)
    .not("set_cost_center", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

/**
 * Load the rule + its candidate transactions under RLS, compute the affected set (pure), bulk-
 * UPDATE only those rows, and return `{ affected }`. A re-run computes an empty set → no-op.
 * `ruleKey` is a rule uuid OR a merchant string (resolved to that merchant's forward rule).
 */
export async function reapplyRuleToPast(ruleKey: string): Promise<{ affected: number }> {
  const sb = await createClient();

  const ruleRow = await resolveRule(sb, ruleKey);

  if (!ruleRow?.set_cost_center) return { affected: 0 };

  const rule: ReapplyRule = {
    id: ruleRow.id as string,
    matchCriteria: (ruleRow.match_criteria ?? {}) as ReapplyRule["matchCriteria"],
    setsCostCenter: ruleRow.set_cost_center as string,
  };

  const { data: txRows } = await sb.from("transactions").select("id, description, cost_center");

  const candidates: ReapplyTx[] = (txRows ?? []).map((r) => ({
    id: r.id as string,
    normalizedDescription: (r.description as string | null) ?? "",
    costCenter: (r.cost_center as string | null) ?? null,
  }));

  // PURE: ids to update = matching rows not already at the target (idempotency core).
  const targetIds = computeReapply(rule, candidates);

  // Bulk-UPDATE only the computed set (.in scopes it — never a WHERE-less bulk update). Write
  // only the parsed target field (mass-assignment guard).
  if (targetIds.length > 0) {
    await sb.from("transactions").update({ cost_center: rule.setsCostCenter }).in("id", targetIds);
  }

  revalidatePath("/transacoes");
  return { affected: targetIds.length };
}
