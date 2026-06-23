// Recategorize write-plane INPUT CONTRACT (CAT-04, D2-02/03, V5).
//
// Split out of `recategorize.ts` because a Next 15 FILE-level `'use server'` module may export
// ONLY async functions — this plain module holds the zod schema + type the action and the
// unit test import. The locked validation boundary for the Transações inline-edit write plane.

import { z } from "zod";

/**
 * The inline re-categorize input contract (CAT-04, RESEARCH Pattern 6):
 *   • `txId` — the ONE transaction to update (D2-03: a single row).
 *   • `categoryId` — the new category (nullable → back to Uncategorized).
 *   • `costCenter` — the new analytical cost-center label.
 *   • `createRule` — optionally write a FORWARD-only rule for this merchant (D2-02).
 *   • `merchant` — the match string for that forward rule (only used when `createRule`).
 */
export const RecategorizeInputSchema = z.object({
  txId: z.uuid(),
  categoryId: z.uuid().nullable().optional(),
  costCenter: z.string().min(1),
  createRule: z.boolean(),
  merchant: z.string().optional(),
});

export type RecategorizeInput = z.infer<typeof RecategorizeInputSchema>;
