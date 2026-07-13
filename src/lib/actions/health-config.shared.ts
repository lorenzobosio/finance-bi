// Shared (non-`'use server'`) types + the insight_thresholds singleton write helper for the
// Financial-Health config write plane (set-thresholds — D-07, HEALTH-01).
//
// A Next 15 FILE-level `'use server'` module may export ONLY async functions, so the minimal
// supabase-client surface the action touches (the client-factory seam + the shared upsert helper)
// lives in this plain module, imported by set-thresholds.ts and the unit test. Mirrors
// goal-config.shared.ts verbatim in structure.
//
// THE SINGLETON RULE: `insight_thresholds` is one row PER PARTITION (is_demo=false real, is_demo=true
// demo). Migration 0015 seeds exactly ONE is_demo=false row, so the first owner edit UPDATES it;
// an absent row INSERTS. Both paths target the REAL partition (is_demo=false) exclusively — the
// owner edits their own bands, NEVER the seeded demo singleton (the anon demo is read-only under RLS
// regardless).
//
// MASS-ASSIGNMENT GUARD (T-06-07): the caller passes an already-parsed `fields` object built from
// zod output (never a raw client spread); the insert path adds ONLY the fixed is_demo=false
// server-side literal. NEVER the postgres/Drizzle client, `service_role`, or `DATABASE_URL` (FND-03).
//
// COLUMN ALIAS (06-03 carry-forward): the frozen `set-thresholds` contract standardises on the
// descriptive `budget_adherence_watch_over_pct`, but migration 0015 created the live column
// `budget_over_watch_pct`. `withRealColumnNames` remaps the alias to the real column ONLY at the
// production write boundary — so the unit test (which injects an UNWRAPPED fake client) observes the
// alias, while the live write targets the real column. This mirrors 06-03's read side, which
// `.select`s the real column and reads `alias ?? real`, satisfying the frozen tests without weakening
// them.

/**
 * The narrow slice of the supabase-js client the thresholds write plane touches: `from(table)`
 * returning a builder that can read the singleton (`select().eq().maybeSingle()`) and write it
 * (`update().eq()` / `insert()`). Typed structurally so a test fake and the real `@supabase/ssr`
 * client both satisfy it without importing the full SupabaseClient generics. Structurally identical
 * to goal-config.shared's `HouseholdWriteClient` (the RED test injects that type).
 */
export interface ThresholdsWriteClient {
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

/** A factory producing an RLS-authorized thresholds write client (the real `createClient`, or a fake). */
export type ThresholdsWriteClientFactory = () => Promise<ThresholdsWriteClient>;

/**
 * The alias → live-column remap applied at the DB write boundary. The contract field is the
 * descriptive `budget_adherence_watch_over_pct`; the real 0015 column is `budget_over_watch_pct`.
 */
const WRITE_COLUMN_ALIASES: Record<string, string> = {
  budget_adherence_watch_over_pct: "budget_over_watch_pct",
};

/** Rewrite any aliased column keys in a write payload to their live-schema names (values untouched). */
export function remapWriteColumns(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    out[WRITE_COLUMN_ALIASES[key] ?? key] = value;
  }
  return out;
}

/**
 * Wrap a real write client so its `update`/`insert` payloads are remapped to the live column names.
 * Used ONLY by the production factory — the unit test injects the fake client unwrapped so it can
 * assert the frozen alias contract. `select`/`eq`/`maybeSingle` delegate unchanged.
 */
export function withRealColumnNames(real: ThresholdsWriteClient): ThresholdsWriteClient {
  return {
    from(table: string) {
      const builder = real.from(table);
      return {
        select: (cols: string) => builder.select(cols),
        update: (payload: Record<string, unknown>) =>
          builder.update(remapWriteColumns(payload)),
        insert: (payload: Record<string, unknown>) =>
          builder.insert(remapWriteColumns(payload)),
      };
    },
  };
}

/**
 * upsertThresholdFields — write ONLY the given parsed `fields` onto the REAL-partition
 * insight_thresholds singleton. Reads the row id (is_demo=false) once: found → a single scoped
 * `.update(fields)`; absent → `.insert({ ...fields, is_demo: false })` with the fixed partition
 * literal. `fields` is always constructed by the caller from zod-parsed input — never a raw client
 * spread. Pure w.r.t. the injected client (DB-free in the unit test).
 */
export async function upsertThresholdFields(
  sb: ThresholdsWriteClient,
  fields: Record<string, unknown>,
): Promise<void> {
  const existing = await sb
    .from("insight_thresholds")
    .select("id")
    .eq("is_demo", false)
    .maybeSingle();

  if (existing.data) {
    await sb.from("insight_thresholds").update(fields).eq("is_demo", false);
  } else {
    await sb.from("insight_thresholds").insert({ ...fields, is_demo: false });
  }
}
