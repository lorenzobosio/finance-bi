"use server";

// Celebration-seen Server Action — the shared "played it" write for a once-only goal_events
// celebration (GOAL-11, D5-14). When either partner dismisses / saves the "You crossed €X!" card,
// this flips the SHARED `goal_events.seen` flag to true on that ONE row (by id). Because the flag
// lives in the DB (not a device/localStorage flag), the other partner has ALREADY had the row
// created unseen — so they still see the moment once on their next login, then it never replays.
//
// LOCKED write-plane shape (RESEARCH Pattern 6, mirrors recategorize.ts): FILE-level `'use server'`
// (exports only async functions — the zod schema is a NON-exported const, allowed); zod `.parse`
// BEFORE any write; the `@supabase/ssr` server client (anon + user JWT → allowlist RLS authorizes,
// FND-03) — NEVER `service_role`. The update carries ONLY `seen: true` (mass-assignment guard) on
// exactly the `.eq('id', …)` row — never a bulk update. The `factory` seam injects a fake client so
// the unit test runs DB-free; production omits it.

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { WriteClient, WriteClientFactory } from "@/lib/actions/recategorize.shared";
import { createClient } from "@/lib/supabase/server";

/** The seen-flip input: only the goal_events row id (the celebration to mark shared-seen). */
const CelebrationSeenSchema = z.object({ eventId: z.uuid() });

/**
 * __markCelebrationSeen — the testable core. Validates the untrusted payload, then updates ONLY
 * `seen=true` on the single goal_events row (`.eq('id', eventId)` — never a bulk update). Injectable
 * client factory keeps the unit test DB-free; production omits it.
 */
export async function __markCelebrationSeen(
  raw: unknown,
  factory: WriteClientFactory = createClient as unknown as WriteClientFactory,
): Promise<{ ok: true }> {
  const { eventId } = CelebrationSeenSchema.parse(raw);
  const sb: WriteClient = await factory();

  // Flip ONLY the shared played-flag on this one row (mass-assignment guard). Both partners share
  // this row, so once it is seen it never replays for either of them.
  await sb.from("goal_events").update({ seen: true }).eq("id", eventId);

  revalidatePath("/goal");
  return { ok: true };
}

/**
 * markCelebrationSeen — the public Server Action the celebration overlay calls when the card is
 * saved/dismissed. Wraps `__markCelebrationSeen` with the real RLS-authorized `@supabase/ssr` client.
 */
export async function markCelebrationSeen(raw: unknown): Promise<{ ok: true }> {
  return __markCelebrationSeen(raw);
}
