"use server";

// Recategorize Server Action — the Transações inline-edit write plane (CAT-04, D2-02/03).
//
// SCOPE NOTE: Plan 02-05 lands ONLY the validated input CONTRACT (`RecategorizeInputSchema`,
// in the sibling `recategorize.schema.ts`) so the write-plane shape is frozen and the actions
// test resolves; the full mutation body (update one row + optional forward rule) is built in
// Plan 02-06 (the Transações slice).
//
// FILE-level `'use server'` (exports only async functions); the schema/type live in the
// sibling schema module. The LOCKED write-plane shape (RESEARCH Pattern 6): zod `.parse`
// BEFORE any DB write + the `@supabase/ssr` server client (anon + user JWT → allowlist RLS
// authorizes). NEVER the postgres/Drizzle client, `service_role`, or `DATABASE_URL` (Pitfall 3).

import { revalidatePath } from "next/cache";

import { RecategorizeInputSchema } from "@/lib/actions/recategorize.schema";
import { createClient } from "@/lib/supabase/server";

/**
 * recategorize — validates the payload now; the mutation body lands in Plan 02-06 (Transações).
 * Exposed as a `'use server'` function so the contract + the SSR-client write plane are wired,
 * but the full one-row update + forward-rule insert is deferred to the Transações slice.
 */
export async function recategorize(raw: unknown): Promise<{ ok: true }> {
  // V5: validate before any write — the locked boundary even though the body is deferred.
  RecategorizeInputSchema.parse(raw);
  // Touch the SSR client so the write-plane wiring is real (RLS-authorized session).
  await createClient();
  // Full mutation (update one row + optional forward rule) → Plan 02-06.
  revalidatePath("/transacoes");
  return { ok: true };
}
