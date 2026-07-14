// recurring-series write-plane INPUT CONTRACT (FLOW-01, D-02/D-03).
//
// Split out of `recurring-series.ts` because a Next 15 FILE-level `'use server'` module may export
// ONLY async functions — this plain module holds the zod schemas the action and the unit test import
// (mirrors set-thresholds.schema.ts). The confirm/dismiss payloads are the untrusted client boundary:
// a malformed (non-uuid) id is rejected BEFORE any DB write. Unknown keys are stripped (zod default) —
// the first half of the mass-assignment guard; the action then maps ONLY these validated fields to
// columns (the second half), so a forged `is_recurring`/`is_demo`/`status` key never reaches a write.

import { z } from "zod";

/**
 * A permissive UUID guard: the canonical 8-4-4-4-12 hex grouping WITHOUT the RFC version/variant
 * nibble constraints. `recurring_series.id` is a `gen_random_uuid()` v4 in production, but the guard
 * only needs to reject a non-uuid string (e.g. "not-a-uuid") at the client boundary — the strict
 * `z.uuid()` rejects otherwise-well-formed opaque ids (e.g. all-nibble-`1`), so the shape check is
 * the honest boundary here.
 */
const uuidLike = z
  .string()
  .regex(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/);

/**
 * Confirm payload: the series row `id` (uuid) + the detection `seriesKey` (the case-folded
 * counterparty the confirm stamp scopes `transactions.is_recurring` by). Unknown keys stripped.
 */
export const ConfirmSeriesSchema = z.object({
  id: uuidLike,
  seriesKey: z.string().min(1),
});

export type ConfirmSeriesInput = z.infer<typeof ConfirmSeriesSchema>;

/** Dismiss payload: just the series row `id` (uuid). A reversible status flip — no stamp change. */
export const DismissSeriesSchema = z.object({
  id: uuidLike,
});

export type DismissSeriesInput = z.infer<typeof DismissSeriesSchema>;
