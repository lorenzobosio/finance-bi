"use server";

// edit-why Server Action — the shared editable "Our why" write plane (PERS-04, D5-17, T-05-14).
//
// The "why" is the couple's shared statement of purpose, rendered on the Goal page (primary content
// in the pre-launch state) and Home. EITHER partner can edit it; the single household singleton is
// shared, so a save by one is seen by both. Rendered as React-escaped TEXT — never
// dangerouslySetInnerHTML — with the zod length bound as the second XSS guard-rail (T-05-14).
//
// FILE-level `'use server'` (exports only async functions); the zod schema lives in the sibling
// `edit-why.schema.ts`, the client seam + singleton upsert helper in `goal-config.shared.ts`.
// LOCKED write-plane shape: zod `.parse` (trims + bounds) BEFORE any DB write + the `@supabase/ssr`
// server client (anon + user JWT → allowlist RLS). The write carries ONLY the parsed `why` field
// (mass-assignment guard) — NEVER the postgres/Drizzle client, `service_role`, or `DATABASE_URL`.

import { revalidatePath } from "next/cache";

import {
  upsertHouseholdField,
  type HouseholdWriteClient,
  type HouseholdWriteClientFactory,
} from "@/lib/actions/goal-config.shared";
import { EditWhyInputSchema } from "@/lib/actions/edit-why.schema";
import { createClient } from "@/lib/supabase/server";

/**
 * __editWhy — the testable core. Validates + trims the untrusted text, then writes ONLY the parsed
 * `why` onto the real-partition household singleton (upsert). The `factory` seam injects a fake
 * client so the unit test runs DB-free; production omits it. Revalidates the Goal page and Home.
 */
export async function __editWhy(
  raw: unknown,
  factory: HouseholdWriteClientFactory = createClient as unknown as HouseholdWriteClientFactory,
): Promise<{ ok: true }> {
  // Validate + trim + length-bound before any write (T-05-14) — `.parse` throws on empty/over-long.
  const input = EditWhyInputSchema.parse(raw);
  const sb: HouseholdWriteClient = await factory();

  await upsertHouseholdField(sb, { why: input.why });

  revalidatePath("/goal");
  revalidatePath("/");
  return { ok: true };
}

/**
 * editWhy — the public Server Action the inline "Our why" editor `<form>` posts to. Reads the
 * `<textarea name="why">` value from FormData and delegates to `__editWhy` with the real
 * RLS-authorized `@supabase/ssr` client.
 */
export async function editWhy(formData: FormData): Promise<void> {
  const raw = formData.get("why");
  await __editWhy({ why: typeof raw === "string" ? raw : "" });
}
