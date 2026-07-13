"use server";

// toggle-epic-trip Server Action — the epic-trip-active WRITE path (GOAL-10, D5-10, RESEARCH Q2).
//
// `household.epic_trip_active` gates the Adventures big-trip tranche routing that the Plan-02
// derived-on-read fold reads. The DEMO seeds this flag directly (Plan-09 seed), but the REAL,
// non-demo household had NO reachable write path — so without this action Lorenzo & Fernanda could
// never activate Adventures-big routing. This action is that path.
//
// SECURITY (T-05-31): zod-parses a SINGLE boolean and writes ONLY `epic_trip_active`. It never
// accepts an `id` or `is_demo` from the client — the write targets the REAL singleton via the
// server-constant `is_demo=false` scope (a partition-crossing / mass-assignment guard). The
// authenticated `@supabase/ssr` client (anon + user JWT) authorizes under allowlist RLS — NEVER
// `service_role`/Drizzle/`DATABASE_URL`.

import { revalidatePath } from "next/cache";

import {
  EpicTripSchema,
  type GoalWriteClientFactory,
} from "@/lib/actions/goal-write.shared";
import { createClient } from "@/lib/supabase/server";

/**
 * __toggleEpicTrip — the testable core. Validates `{ active: boolean }` (a non-boolean throws),
 * then updates ONLY `epic_trip_active` on the real (non-demo) household singleton. The `factory`
 * seam injects a fake client so the unit test runs DB-free; production omits it.
 */
export async function __toggleEpicTrip(
  raw: unknown,
  factory: GoalWriteClientFactory = createClient as unknown as GoalWriteClientFactory,
): Promise<{ ok: true }> {
  // Parse a SINGLE boolean — never an id/is_demo from the client (T-05-31).
  const input = EpicTripSchema.parse(raw);
  const sb = await factory();

  // Write ONLY the boolean, scoped to the REAL singleton via the server constant `is_demo=false`
  // (never a client-supplied partition). RLS authorizes the authenticated write.
  await sb.from("household").update({ epic_trip_active: input.active }).eq("is_demo", false);

  revalidatePath("/goal/adventures");
  return { ok: true };
}

/**
 * toggleEpicTrip — the public Server Action the Adventures page toggle calls. Wraps
 * `__toggleEpicTrip` with the real RLS-authorized `@supabase/ssr` client.
 */
export async function toggleEpicTrip(raw: unknown): Promise<{ ok: true }> {
  return __toggleEpicTrip(raw);
}

/**
 * toggleEpicTripForm — the progressive-enhancement `<form action={...}>` entrypoint the Adventures
 * page renders (works with NO client JS — Fernanda's mobile path). Reads the hidden
 * `<input name="active">` (the NEXT desired state, "true"/"false"), coerces it to the boolean the
 * zod-locked core expects, and delegates to `toggleEpicTrip`. The page emits `active` as the FLIP of
 * the current `epic_trip_active`, so one submit toggles the real household's Adventures-big routing.
 */
export async function toggleEpicTripForm(formData: FormData): Promise<void> {
  await toggleEpicTrip({ active: formData.get("active") === "true" });
}
