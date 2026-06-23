// Shared (non-`'use server'`) types for the Transactions write plane.
//
// A Next 15 FILE-level `'use server'` module may export ONLY async functions, so the
// minimal supabase-client surface the actions use + the client-factory seam (the injected
// fake for DB-free tests) live in this plain module, imported by recategorize.ts /
// create-rule.ts and the unit test.

/**
 * The narrow slice of the supabase-js client the write plane touches: `from(table)` returning
 * a builder with `update`/`insert`/`eq`. Typed structurally so a test fake (and the real
 * `@supabase/ssr` client) both satisfy it without importing the full SupabaseClient generics.
 */
export interface WriteClient {
  from(table: string): {
    update(payload: Record<string, unknown>): {
      eq(col: string, val: unknown): unknown;
    };
    insert(payload: Record<string, unknown>): unknown;
  };
}

/** A factory producing an RLS-authorized write client (the real `createClient`, or a fake). */
export type WriteClientFactory = () => Promise<WriteClient>;

/** Same factory, named for the create-rule action's signature. */
export type CreateRuleClientFactory = WriteClientFactory;

/** The forward-rule input: the merchant to match + the category/cost-center it sets. */
export interface CreateRuleInput {
  merchant: string;
  categoryId: string | null;
  costCenter: string;
}
