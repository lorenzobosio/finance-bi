"use server";

// create-rule Server Action — write a FORWARD-only categorization rule from a transaction
// (CAT-04, D2-02). Future ingests inherit the rule; it does NOT touch any existing
// transaction (applying to history is the SEPARATE explicit reapply-rule action — CAT-05).
//
// LOCKED write-plane shape (RESEARCH Pattern 6): `'use server'` + the `@supabase/ssr` server
// client (anon + user JWT → the existing `allowlist_all for all to authenticated` RLS on
// `rules` authorizes the insert). NEVER the postgres/Drizzle client, `service_role`, or
// `DATABASE_URL` (Pitfall 3) — RLS is the authorization wall, not a TS check.

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import type { CreateRuleClientFactory, CreateRuleInput } from "@/lib/actions/recategorize.shared";

/**
 * Insert ONE forward-only rule for a merchant. `match_criteria` is the structured
 * `{ contains }` object the engine matches case-insensitively against the normalized
 * description (db-rules.ts) — never a raw string concatenated into a query. Seeded at
 * `priority: 100` (after the builtins) / `version: 1`. A blank merchant is a no-op (there is
 * nothing to match forward). Writes ONLY the explicit fields (mass-assignment guard).
 *
 * The `factory` seam exists so the unit test can inject a fake supabase client and keep the
 * action DB-free; production callers omit it and the real `@supabase/ssr` client is used.
 */
export async function __createRuleFromTx(
  input: CreateRuleInput,
  // The factory is the narrow structural `WriteClient` seam (so the unit test can inject a
  // DB-free fake). Since `server.ts` now returns the fully-typed `createServerClient<Database>`
  // client (DSN-06c), the deep recursive `rules.Insert`/`Json` generic makes TS2589 ("type
  // instantiation excessively deep") fire when it tries to prove the typed client is assignable
  // to the loose seam. The cast is safe and confined to THIS default-arg seam: the typed client
  // structurally satisfies `WriteClient`, and every real mart READ stays fully typed.
  factory: CreateRuleClientFactory = createClient as unknown as CreateRuleClientFactory,
): Promise<{ ok: true }> {
  const merchant = input.merchant?.trim();
  if (!merchant) return { ok: true }; // nothing to match forward — no rule written

  const sb = await factory();
  await sb.from("rules").insert({
    match_criteria: { contains: merchant },
    set_category: input.categoryId ?? null,
    set_cost_center: input.costCenter,
    priority: 100,
    version: 1,
  });

  revalidatePath("/transacoes");
  revalidatePath("/config");
  return { ok: true };
}

/**
 * createRuleFromTx — the public Server Action the edit popover calls. Wraps the testable
 * `__createRuleFromTx` seam with the real RLS-authorized client.
 */
export async function createRuleFromTx(input: CreateRuleInput): Promise<{ ok: true }> {
  return __createRuleFromTx(input);
}
