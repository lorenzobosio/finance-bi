// set-launch-date write-plane INPUT CONTRACT (D5-01/16).
//
// Split out of `set-launch-date.ts` because a Next 15 FILE-level `'use server'` module may export
// ONLY async functions — this plain module holds the zod schema the action and the unit test
// import. The launch date GATES the whole game (streak/waterfall/alerts run only post-launch);
// a null clears it back to the first-class pre-launch "waiting" state.

import { z } from "zod";

/**
 * The launch-date input contract: an ISO `YYYY-MM-DD` calendar date (zod validates BOTH the format
 * and that it is a real date), or `null` to clear it (return to pre-launch). Nothing else is a
 * valid launch date — a malformed or impossible date is rejected before any DB write.
 */
export const SetLaunchDateInputSchema = z.object({
  launchDate: z.iso.date().nullable(),
});

export type SetLaunchDateInput = z.infer<typeof SetLaunchDateInputSchema>;
