// Shared (non-`'use server'`) types + the household singleton write helper for the Goal-config
// write plane (set-launch-date / edit-why — D5-01/16, PERS-04).
//
// A Next 15 FILE-level `'use server'` module may export ONLY async functions, so the minimal
// supabase-client surface these actions touch (the client-factory seam + the shared upsert
// helper) live in this plain module, imported by set-launch-date.ts / edit-why.ts and the unit
// test. Mirrors recategorize.shared.ts.
//
// THE SINGLETON RULE: `household` is one row PER PARTITION (is_demo=false real, is_demo=true demo).
// No row is seeded (0014 creates the table only), so the first write must INSERT; later writes
// UPDATE. Both paths target the REAL partition (is_demo=false) exclusively — the owner edits their
// own household, NEVER the seeded demo singleton (the anon demo is read-only under RLS regardless).
//
// MASS-ASSIGNMENT GUARD (T-05-15): the caller passes an already-parsed `fields` object built from
// zod output (never a raw client spread); the insert path adds ONLY the fixed is_demo=false
// server-side literal. NEVER the postgres/Drizzle client, `service_role`, or `DATABASE_URL`.

/**
 * The narrow slice of the supabase-js client the Goal-config write plane touches: `from(table)`
 * returning a builder that can read the singleton (`select().eq().maybeSingle()`) and write it
 * (`update().eq()` / `insert()`). Typed structurally so a test fake and the real `@supabase/ssr`
 * client both satisfy it without importing the full SupabaseClient generics.
 */
export interface HouseholdWriteClient {
  from(table: string): {
    select(cols: string): {
      eq(
        col: string,
        val: unknown,
      ): {
        maybeSingle(): Promise<{ data: { id: string } | null; error: unknown }>;
      };
    };
    update(payload: Record<string, unknown>): {
      eq(col: string, val: unknown): unknown;
    };
    insert(payload: Record<string, unknown>): unknown;
  };
}

/** A factory producing an RLS-authorized household write client (the real `createClient`, or a fake). */
export type HouseholdWriteClientFactory = () => Promise<HouseholdWriteClient>;

/**
 * upsertHouseholdField — write ONLY the given parsed `fields` onto the REAL-partition household
 * singleton. Reads the row id (is_demo=false) once: found → a single scoped `.update(fields)`;
 * absent → `.insert({ ...fields, is_demo: false })` with the fixed partition literal. `fields` is
 * always constructed by the caller from zod-parsed input — never a raw client spread. Pure w.r.t.
 * the injected client (DB-free in the unit test).
 */
export async function upsertHouseholdField(
  sb: HouseholdWriteClient,
  fields: Record<string, unknown>,
): Promise<void> {
  const existing = await sb
    .from("household")
    .select("id")
    .eq("is_demo", false)
    .maybeSingle();

  if (existing.data) {
    await sb.from("household").update(fields).eq("is_demo", false);
  } else {
    await sb.from("household").insert({ ...fields, is_demo: false });
  }
}
