"use server";

// recurring-series Server Actions — the FLOW-01 confirm/dismiss write plane (D-02/D-03).
//
// Confirming a detected series persists `recurring_series.status='active'` AND stamps
// `transactions.is_recurring=true` on the series' matched rows — the D-03 GOAL-09 interaction (a
// recurring bill is then skipped by window rules, db-rules.ts:84). Dismissing flips the status to
// 'dismissed' (reversible; the list offers an inline Undo, no modal) and DOES NOT unstamp
// is_recurring (A5/OQ1 — a dismissed series' rows were genuinely recurring).
//
// FILE-level `'use server'` (exports ONLY async functions) so the recurring-list Client Component can
// import these actions directly; the zod schemas live in the sibling `recurring-series.schema.ts`.
// LOCKED write-plane shape (09-PATTERNS "LOCKED write-plane" / budgets.ts + set-thresholds.ts): zod
// `.parse` BEFORE any write + the `@supabase/ssr` server client (anon key + the owner JWT, so the
// `allowlist_all for all to authenticated` RLS authorizes the write). The write carries ONLY the
// parsed, explicitly-mapped fields (mass-assignment guard) — NEVER a raw client spread. This module
// never reaches the elevated key / direct DB URL / Drizzle — RLS under the owner JWT is the
// authorization wall (T-09-04); the injected `@supabase/ssr` seam is the ONLY client.

import { revalidatePath } from "next/cache";

import type {
  HouseholdWriteClient,
  HouseholdWriteClientFactory,
} from "@/lib/actions/goal-config.shared";
import {
  ConfirmSeriesSchema,
  DismissSeriesSchema,
} from "@/lib/actions/recurring-series.schema";
import { createClient } from "@/lib/supabase/server";

/** The production write-client factory: the real RLS-authorized `@supabase/ssr` client. */
async function createSeriesWriteClient(): Promise<HouseholdWriteClient> {
  return (await createClient()) as unknown as HouseholdWriteClient;
}

/**
 * __confirmSeries — the testable core. Validates the untrusted payload, then activates the series
 * and stamps `transactions.is_recurring=true` on the matched rows (scoped by the normalized series
 * key on `transactions.counterparty`). Writes ONLY the parsed, explicitly-mapped literals — the
 * injected is_recurring/is_demo/status keys never reach a write. The `factory` seam injects a fake
 * client so the unit test runs DB-free; production omits it.
 */
export async function __confirmSeries(
  raw: unknown,
  factory: HouseholdWriteClientFactory = createSeriesWriteClient,
): Promise<{ ok: true }> {
  // Validate before any write — `.parse` throws on a malformed payload (nothing is written).
  const input = ConfirmSeriesSchema.parse(raw);
  const sb = await factory();

  // Activate the series by id — ONLY the fixed status literal (mass-assignment guard).
  await sb.from("recurring_series").update({ status: "active" }).eq("id", input.id);

  // Stamp the matched transactions — ONLY the fixed is_recurring literal, scoped by the normalized
  // series key on the counterparty column (the D-03 GOAL-09 interaction; dismiss never unstamps).
  await sb.from("transactions").update({ is_recurring: true }).eq("counterparty", input.seriesKey);

  revalidatePath("/cashflow");
  return { ok: true };
}

/**
 * __dismissSeries — the testable core. Validates the payload, then flips the series to 'dismissed'
 * (a reversible status flip) and does NOT touch `transactions.is_recurring`. The `factory` seam
 * injects a fake client so the unit test runs DB-free; production omits it.
 */
export async function __dismissSeries(
  raw: unknown,
  factory: HouseholdWriteClientFactory = createSeriesWriteClient,
): Promise<{ ok: true }> {
  const input = DismissSeriesSchema.parse(raw);
  const sb = await factory();

  await sb.from("recurring_series").update({ status: "dismissed" }).eq("id", input.id);

  revalidatePath("/cashflow");
  return { ok: true };
}

/** confirmSeries — the public Server Action the recurring-list Confirm button invokes. */
export async function confirmSeries(raw: unknown): Promise<{ ok: true }> {
  return __confirmSeries(raw);
}

/** dismissSeries — the public Server Action the recurring-list Dismiss/Undo button invokes. */
export async function dismissSeries(raw: unknown): Promise<{ ok: true }> {
  return __dismissSeries(raw);
}
