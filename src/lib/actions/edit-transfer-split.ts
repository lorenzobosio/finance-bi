"use server";

// edit-transfer-split Server Action — the per-transfer manual allocation override (D5-04).
//
// A single investimento leg can be manually split across the four bucket legs (wealth / brazil /
// adv-small / adv-big). One override row per transfer (PK = transaction_id), upserted so a later
// edit replaces it. IMPORTANT (Q1 resolution): a manual override REPLACES the discretionary split
// ONLY — the derived-on-read waterfall STILL settles bucket debt FIRST (engine step 1 applies
// regardless of any override). There are no stored bucket balances; only this per-transfer
// override + goal_events persist, everything else is derived-on-read.
//
// LOCKED write-plane shape (RESEARCH Pattern 6): file-level `'use server'`, zod `.parse` BEFORE
// any write, the `@supabase/ssr` server client (anon + user JWT → allowlist RLS authorizes), only
// parsed fields written. NEVER the postgres/Drizzle client, `service_role`, or `DATABASE_URL`.

import { revalidatePath } from "next/cache";

import {
  TransferSplitSchema,
  type GoalWriteClientFactory,
} from "@/lib/actions/goal-write.shared";
import { createClient } from "@/lib/supabase/server";

/**
 * __editTransferSplit — the testable core. Validates the untrusted split (each leg non-negative,
 * total positive — a non-sane split throws), then upserts ONE `transfer_overrides` row keyed on
 * `transaction_id`, writing only the parsed leg amounts (mass-assignment guard). The `factory`
 * seam injects a fake client so the unit test runs DB-free; production omits it.
 */
export async function __editTransferSplit(
  raw: unknown,
  factory: GoalWriteClientFactory = createClient as unknown as GoalWriteClientFactory,
): Promise<{ ok: true }> {
  const input = TransferSplitSchema.parse(raw);
  const sb = await factory();

  await sb.from("transfer_overrides").upsert(
    {
      transaction_id: input.transactionId,
      wealth_eur: input.wealthEur,
      brazil_eur: input.brazilEur,
      adv_small_eur: input.advSmallEur,
      adv_big_eur: input.advBigEur,
    },
    { onConflict: "transaction_id" },
  );

  revalidatePath("/goal/brazil");
  revalidatePath("/goal/adventures");
  return { ok: true };
}

/**
 * editTransferSplit — the public Server Action the transfer-split editor calls. Wraps
 * `__editTransferSplit` with the real RLS-authorized `@supabase/ssr` client.
 */
export async function editTransferSplit(raw: unknown): Promise<{ ok: true }> {
  return __editTransferSplit(raw);
}
