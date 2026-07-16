// eb-reconnect EXCHANGE input contract (REM-01, D-02/D-04).
//
// Split out of `eb-reconnect.ts` because a Next 15 FILE-level `'use server'` module may export ONLY
// async functions — this plain module holds the zod schema the action and the unit test import
// (mirrors set-thresholds.schema.ts / recurring-series.schema.ts). The `{ code, state }` callback
// payload is `.parse`d BEFORE any exchange/write: a malformed payload is rejected up front, and
// unknown keys are STRIPPED (the first half of the mass-assignment guard).

import { z } from "zod";

/**
 * The `/eb/callback` exchange payload: the SCA `code` Revolut hands back and the `state` nonce it
 * echoes. Both are required non-empty strings; the action then compares `state` to the httpOnly
 * `eb_reconnect_state` cookie (CSRF binding, D-04) before exchanging the code.
 */
export const EbReconnectSchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
});

export type EbReconnectInput = z.infer<typeof EbReconnectSchema>;
