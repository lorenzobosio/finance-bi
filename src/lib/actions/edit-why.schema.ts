// edit-why write-plane INPUT CONTRACT (PERS-04, D5-17, T-05-14).
//
// Split out of `edit-why.ts` because a Next 15 FILE-level `'use server'` module may export ONLY
// async functions — this plain module holds the zod schema the action and the unit test import.
// The shared "why" is free text either partner can edit; it is rendered as React-escaped TEXT
// (never dangerouslySetInnerHTML), and this length bound is the second XSS guard-rail (T-05-14).

import { z } from "zod";

/** The maximum length of the shared "why" statement — a couple's sentence, not an essay. */
export const WHY_MAX_LENGTH = 600;

/**
 * The shared-"why" input contract (PERS-04): a non-empty, length-bounded string. Leading/trailing
 * whitespace is trimmed BEFORE the min/max check, so `"   "` is rejected as empty and the stored
 * value carries no incidental padding. React auto-escapes the rendered text — this bound caps the
 * payload size (defense-in-depth, T-05-14).
 */
export const EditWhyInputSchema = z.object({
  why: z.string().trim().min(1).max(WHY_MAX_LENGTH),
});

export type EditWhyInput = z.infer<typeof EditWhyInputSchema>;
