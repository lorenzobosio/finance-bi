// src/lib/goal/household.ts — the demo-partitioned household-config READ helper (D5-01/16/17).
//
// PURE w.r.t. the INJECTED client (mirrors the rest of src/lib/goal/*: no @supabase / next / drizzle
// import — the caller hands in the already-constructed @supabase/ssr client). Returns the household
// singleton for the ACTIVE read partition, degrading to nulls when no row exists yet (0014 seeds no
// household row, so the pre-launch couple has NO row → launchDate null → the first-class waiting
// state). The read is is_demo-scoped by the caller's `demoFilter` (T-05-17 — a missing filter would
// blend the real launch date into demo mode).

/** The resolved household config every Goal/Home surface consumes (camelCased from the DB row). */
export interface HouseholdConfig {
  /** ISO `YYYY-MM-DD`, or null = the pre-launch "waiting" state (D5-16). */
  launchDate: string | null;
  /** The shared editable "why" (PERS-04), or null when unset. */
  why: string | null;
  /** Gates the Adventures big-trip tranche state (D5-10). */
  epicTripActive: boolean;
}

/** The raw household row shape the read selects (a subset of the table). */
interface HouseholdRow {
  launch_date: string | null;
  why: string | null;
  epic_trip_active: boolean;
}

/**
 * The narrow read slice of the supabase-js client: `from(table).select(cols).eq(col,val).maybeSingle()`.
 * Typed structurally so the real `@supabase/ssr` client (cast at the call site) and a test fake both
 * satisfy it without importing the SupabaseClient generics into this pure module.
 */
export interface HouseholdReadClient {
  from(table: string): {
    select(cols: string): {
      eq(
        col: string,
        val: unknown,
      ): {
        maybeSingle(): Promise<{ data: HouseholdRow | null; error: unknown }>;
      };
    };
  };
}

/** The pre-launch fallback config (no row / no launch date). */
export const PRE_LAUNCH_HOUSEHOLD: HouseholdConfig = {
  launchDate: null,
  why: null,
  epicTripActive: false,
};

/**
 * readHouseholdConfig — read the household singleton for the active partition. Tolerant of a missing
 * row (returns {@link PRE_LAUNCH_HOUSEHOLD}) and of a read error (also degrades to pre-launch rather
 * than throwing — the Goal page's own error boundary owns hard failures). Pure w.r.t. the injected
 * client.
 */
export async function readHouseholdConfig(
  client: HouseholdReadClient,
  demoFilter: boolean,
): Promise<HouseholdConfig> {
  const { data } = await client
    .from("household")
    .select("launch_date, why, epic_trip_active")
    .eq("is_demo", demoFilter)
    .maybeSingle();

  if (!data) return PRE_LAUNCH_HOUSEHOLD;
  return {
    launchDate: data.launch_date ?? null,
    why: data.why ?? null,
    epicTripActive: data.epic_trip_active ?? false,
  };
}
