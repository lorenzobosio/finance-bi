// Shared (non-`'use server'`) zod contracts + client seam for the Phase-5 goal write plane
// (GOAL-09/GOAL-10, D5-04/09/10, CAT-08).
//
// A Next 15 FILE-level `'use server'` module may export ONLY async functions, so the zod input
// schemas (the locked validation boundary) + the narrow supabase-client seam (the injected fake
// for DB-free unit tests) live here, imported by set-travel-window.ts / edit-transfer-split.ts /
// toggle-epic-trip.ts and their test. Mirrors the recategorize.shared.ts / recategorize.schema.ts
// precedent.

import { z } from "zod";

/**
 * set-travel-window input (D5-09): a booking-date window + the bucket cost center it tags. The
 * window is stored as a STRUCTURED `match_criteria` object + applied by the pure in-memory
 * matcher — user input is NEVER concatenated into a query (T-05-18). `costCenter` is a closed
 * enum (only the two travel buckets), so a rogue center can't be mass-assigned. `from`/`to` are
 * YYYY-MM-DD; the refine rejects an inverted range (YYYY-MM-DD sorts lexicographically).
 */
export const TravelWindowSchema = z
  .object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    costCenter: z.enum(["brazil", "adventures"]),
  })
  .refine((v) => v.from <= v.to, { message: "travel window: 'from' must be on or before 'to'" });

export type TravelWindowInput = z.infer<typeof TravelWindowSchema>;

/**
 * edit-transfer-split input (D5-04): the per-transfer manual allocation of ONE investimento leg
 * across the four bucket legs. Each leg is non-negative and the split must sum to a positive
 * amount (a non-sane / all-zero / negative split is rejected). NOTE (Q1 resolution): this
 * override REPLACES the discretionary split only — the waterfall still settles bucket debt
 * FIRST (engine step 1 applies regardless of any override).
 */
export const TransferSplitSchema = z
  .object({
    transactionId: z.uuid(),
    wealthEur: z.number().nonnegative(),
    brazilEur: z.number().nonnegative(),
    advSmallEur: z.number().nonnegative(),
    advBigEur: z.number().nonnegative(),
  })
  .refine((v) => v.wealthEur + v.brazilEur + v.advSmallEur + v.advBigEur > 0, {
    message: "transfer split must allocate a positive total",
  });

export type TransferSplitInput = z.infer<typeof TransferSplitSchema>;

/**
 * toggle-epic-trip input (D5-10, GOAL-10, RESEARCH Q2): a single boolean. The action writes ONLY
 * `epic_trip_active` on the real household singleton — it never accepts an `id` or `is_demo` from
 * the client (mass-assignment / partition-crossing guard, T-05-31).
 */
export const EpicTripSchema = z.object({ active: z.boolean() });

export type EpicTripInput = z.infer<typeof EpicTripSchema>;

/**
 * The narrow slice of the supabase-js client the goal write plane touches: `from(table)`
 * returning a builder with `insert`/`upsert`/`select` and an `update(...)` chain exposing both
 * `.eq(...)` (single-row / partition scope) and `.in(...)` (bulk scope). Typed structurally so a
 * test fake AND the real `@supabase/ssr` client both satisfy it without importing the full
 * SupabaseClient generics (the real client is passed through an `as unknown` cast at the seam).
 */
export interface GoalWriteClient {
  from(table: string): {
    insert(payload: Record<string, unknown>): unknown;
    upsert(payload: Record<string, unknown>, options?: Record<string, unknown>): unknown;
    select(cols: string): Promise<{ data: Record<string, unknown>[] | null; error: unknown }>;
    update(payload: Record<string, unknown>): {
      eq(col: string, val: unknown): unknown;
      in(col: string, vals: unknown[]): unknown;
    };
  };
}

/** A factory producing an RLS-authorized goal write client (the real `createClient`, or a fake). */
export type GoalWriteClientFactory = () => Promise<GoalWriteClient>;
