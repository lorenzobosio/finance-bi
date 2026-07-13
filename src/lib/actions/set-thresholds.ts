"use server";

// set-thresholds Server Action — the Config scorecard-band write plane (D-07, HEALTH-01).
//
// The bands define what "healthy / watch / off-track" mean for the couple; editing them retunes the
// Financial-Health scorecard the Home + /health reads narrate. Migration 0015 seeds the DEFAULT_BANDS
// on the real partition; this action lets the owner tune them, and "Reset to defaults" re-writes the
// seeded values (a normal parsed write — no destructive delete this phase).
//
// FILE-level `'use server'` (exports only async functions); the zod schema lives in the sibling
// `set-thresholds.schema.ts`, the client seam + singleton upsert helper in `health-config.shared.ts`.
// LOCKED write-plane shape (RESEARCH Pattern 6 / 06-PATTERNS): zod `.parse` BEFORE any DB write + the
// `@supabase/ssr` server client (anon + user JWT → allowlist RLS authorizes). The write carries ONLY
// the parsed, explicitly-mapped band columns (mass-assignment guard) onto the REAL-partition
// singleton — NEVER the postgres/Drizzle client, `service_role`, or `DATABASE_URL` (FND-03 / Pitfall 3).

import { revalidatePath } from "next/cache";

import {
  upsertThresholdFields,
  withRealColumnNames,
  type ThresholdsWriteClient,
  type ThresholdsWriteClientFactory,
} from "@/lib/actions/health-config.shared";
import { SetThresholdsInputSchema } from "@/lib/actions/set-thresholds.schema";
import { createClient } from "@/lib/supabase/server";

/**
 * The production write-client factory: the real RLS-authorized `@supabase/ssr` client, wrapped so
 * the aliased `budget_adherence_watch_over_pct` write column is remapped to the live 0015 column
 * `budget_over_watch_pct` (06-03 carry-forward). The unit test overrides this seam with an unwrapped
 * fake so it can assert the frozen alias contract DB-free.
 */
async function createThresholdsWriteClient(): Promise<ThresholdsWriteClient> {
  const real = (await createClient()) as unknown as ThresholdsWriteClient;
  return withRealColumnNames(real);
}

/**
 * __setThresholds — the testable core. Validates the untrusted band payload, then writes ONLY the
 * parsed, explicitly-mapped band columns onto the real-partition insight_thresholds singleton
 * (upsert). The `factory` seam injects a fake client so the unit test runs DB-free; production omits
 * it. Revalidates Config + Home + /health (all read the bands).
 */
export async function __setThresholds(
  raw: unknown,
  factory: ThresholdsWriteClientFactory = createThresholdsWriteClient,
): Promise<{ ok: true }> {
  // Validate before any write — `.parse` throws on a malformed/out-of-range band (the action surfaces it).
  const input = SetThresholdsInputSchema.parse(raw);
  const sb = await factory();

  // Explicit field→column mapping (the second half of the mass-assignment guard): ONLY these six
  // band columns ever reach the write; the descriptive `budget_adherence_watch_over_pct` alias is
  // remapped to the live column inside the production factory (unwrapped in the test).
  await upsertThresholdFields(sb, {
    savings_rate_healthy: input.savingsRateHealthy,
    savings_rate_watch: input.savingsRateWatch,
    reserve_healthy: input.reserveHealthy,
    reserve_watch: input.reserveWatch,
    budget_adherence_watch_over_pct: input.budgetAdherenceWatchOverPct,
    streak_watch_misses: input.streakWatchMisses,
  });

  revalidatePath("/config");
  revalidatePath("/");
  revalidatePath("/health");
  return { ok: true };
}

/**
 * setThresholds — the public Server Action the Config band editor `<form>` posts to. Reads the six
 * numeric band inputs from FormData and delegates to `__setThresholds` with the real RLS-authorized
 * `@supabase/ssr` client. Malformed input is rejected by the schema before any write.
 */
export async function setThresholds(formData: FormData): Promise<void> {
  const numOf = (key: string) => Number(formData.get(key));
  await __setThresholds({
    savingsRateHealthy: numOf("savingsRateHealthy"),
    savingsRateWatch: numOf("savingsRateWatch"),
    reserveHealthy: numOf("reserveHealthy"),
    reserveWatch: numOf("reserveWatch"),
    budgetAdherenceWatchOverPct: numOf("budgetAdherenceWatchOverPct"),
    streakWatchMisses: numOf("streakWatchMisses"),
  });
}
