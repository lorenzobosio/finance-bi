"use server";

// set-launch-date Server Action — the pre-launch "Set your launch date" CTA write plane (D5-01/16).
//
// The launch date is the single most important switch in Phase 5: NULL = the first-class
// pre-launch "waiting" state (the couple is pre-launch, no shame); setting it ACTIVATES the
// journey (streak clock, allocation waterfall, ETA, alerts all gate on it). Clearing it (null)
// returns to waiting.
//
// FILE-level `'use server'` (exports only async functions); the zod schema lives in the sibling
// `set-launch-date.schema.ts`, the client seam + singleton upsert helper in `goal-config.shared.ts`.
// LOCKED write-plane shape (RESEARCH Pattern 6): zod `.parse` BEFORE any DB write + the
// `@supabase/ssr` server client (anon + user JWT → allowlist RLS authorizes). The write carries
// ONLY the parsed `launch_date` (mass-assignment guard) onto the REAL-partition singleton — NEVER
// the postgres/Drizzle client, `service_role`, or `DATABASE_URL` (Pitfall 3).

import { revalidatePath } from "next/cache";

import {
  upsertHouseholdField,
  type HouseholdWriteClient,
  type HouseholdWriteClientFactory,
} from "@/lib/actions/goal-config.shared";
import { SetLaunchDateInputSchema } from "@/lib/actions/set-launch-date.schema";
import { createClient } from "@/lib/supabase/server";

/**
 * __setLaunchDate — the testable core. Validates the untrusted payload, then writes ONLY the parsed
 * `launch_date` onto the real-partition household singleton (upsert). The `factory` seam injects a
 * fake client so the unit test runs DB-free; production omits it. Revalidates the Goal page and Home
 * (both read `launch_date`).
 */
export async function __setLaunchDate(
  raw: unknown,
  // See recategorize.ts: the typed `createServerClient<Database>` client trips TS2589 against the
  // loose structural seam; the cast is confined to this default-arg and is safe (the typed client
  // structurally satisfies the seam).
  factory: HouseholdWriteClientFactory = createClient as unknown as HouseholdWriteClientFactory,
): Promise<{ ok: true }> {
  // Validate before any write — `.parse` throws on a malformed/impossible date (the action surfaces it).
  const input = SetLaunchDateInputSchema.parse(raw);
  const sb: HouseholdWriteClient = await factory();

  await upsertHouseholdField(sb, { launch_date: input.launchDate });

  revalidatePath("/goal");
  revalidatePath("/");
  return { ok: true };
}

/**
 * setLaunchDate — the public Server Action the pre-launch `<form>` CTA posts to. Reads the native
 * `<input type="date" name="launchDate">` value from FormData (an empty string clears → null) and
 * delegates to `__setLaunchDate` with the real RLS-authorized `@supabase/ssr` client.
 */
export async function setLaunchDate(formData: FormData): Promise<void> {
  const raw = formData.get("launchDate");
  const value = typeof raw === "string" && raw.trim().length > 0 ? raw : null;
  await __setLaunchDate({ launchDate: value });
}
