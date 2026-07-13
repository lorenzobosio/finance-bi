"use server";

// set-travel-window Server Action — the booking-date-window auto-tag (GOAL-09, D5-09).
//
// "We're in Brazil Dec 1–20" is a rule whose `match_criteria` carries a STRUCTURED booking-date
// window (never a SQL string — T-05-18). Writing the rule is forward-only, exactly like
// create-rule; then an EXPLICIT reapply tags the ALREADY-INGESTED rows inside the window. The
// retro-apply is NEVER silent (Phase-2 SC3): this action IS the explicit apply the user invokes,
// it SKIPS `is_recurring` rows (known bills — D5-09 option (b)), and it is idempotent (a second
// run re-computes an empty set → 0 rows via `computeReapply`).
//
// LOCKED write-plane shape (RESEARCH Pattern 6): file-level `'use server'`, zod `.parse` BEFORE
// any write, the `@supabase/ssr` server client (anon + user JWT → allowlist RLS authorizes),
// only parsed fields written. NEVER the postgres/Drizzle client, `service_role`, or `DATABASE_URL`.

import { revalidatePath } from "next/cache";

import {
  TravelWindowSchema,
  type GoalWriteClientFactory,
} from "@/lib/actions/goal-write.shared";
import {
  computeReapply,
  type ReapplyRule,
  type ReapplyTx,
} from "@/lib/actions/reapply-rule";
import { createClient } from "@/lib/supabase/server";

/**
 * __setTravelWindow — the testable core. Validates the untrusted window, writes a forward window
 * rule, then performs the EXPLICIT, idempotent reapply scoped to the window + `is_recurring=false`
 * (the pure matcher in reapply-rule.ts enforces both). The `factory` seam injects a fake client
 * so the unit test runs DB-free; production omits it. Returns the affected-count.
 */
export async function __setTravelWindow(
  raw: unknown,
  // The typed `createServerClient<Database>` client trips TS2589 against the loose structural
  // seam; the cast is confined to this default-arg and is safe (the typed client satisfies it).
  factory: GoalWriteClientFactory = createClient as unknown as GoalWriteClientFactory,
): Promise<{ affected: number }> {
  const input = TravelWindowSchema.parse(raw);
  const sb = await factory();

  // 1. Write the forward window rule. `match_criteria` is a structured object (the pure matcher
  // reads `bookingDateFrom`/`bookingDateTo`) — user input is never concatenated into a query.
  await sb.from("rules").insert({
    match_criteria: { bookingDateFrom: input.from, bookingDateTo: input.to },
    set_cost_center: input.costCenter,
    priority: 100,
    version: 1,
  });

  // 2. EXPLICIT reapply over PAST rows (never silent — Phase-2 SC3). The window rule tags only
  // in-window, non-recurring rows not already at the target (idempotency core in computeReapply).
  const rule: ReapplyRule = {
    id: "travel-window",
    matchCriteria: { bookingDateFrom: input.from, bookingDateTo: input.to },
    setsCostCenter: input.costCenter,
  };

  const { data: txRows } = await sb
    .from("transactions")
    .select("id, description, cost_center, booking_date, is_recurring");

  const candidates: ReapplyTx[] = (txRows ?? []).map((r) => ({
    id: r.id as string,
    normalizedDescription: (r.description as string | null) ?? "",
    costCenter: (r.cost_center as string | null) ?? null,
    bookingDate: (r.booking_date as string | null) ?? undefined,
    isRecurring: (r.is_recurring as boolean | null) ?? false,
  }));

  const targetIds = computeReapply(rule, candidates);

  // Bulk-UPDATE only the computed set (.in scopes it — never a WHERE-less bulk update). Write
  // only the parsed target cost center (mass-assignment guard).
  if (targetIds.length > 0) {
    await sb.from("transactions").update({ cost_center: input.costCenter }).in("id", targetIds);
  }

  revalidatePath("/transactions");
  revalidatePath("/goal/brazil");
  revalidatePath("/goal/adventures");
  return { affected: targetIds.length };
}

/**
 * setTravelWindow — the public Server Action the bucket-page "Set a travel window" control calls.
 * Wraps `__setTravelWindow` with the real RLS-authorized `@supabase/ssr` client.
 */
export async function setTravelWindow(raw: unknown): Promise<{ affected: number }> {
  return __setTravelWindow(raw);
}

/**
 * setTravelWindowForm — the progressive-enhancement `<form action={...}>` entrypoint the Brazil /
 * Adventures bucket pages render (works with NO client JS). Reads the native `<input type="date">`
 * `from`/`to` values + the hidden `costCenter` from FormData and delegates to `setTravelWindow`; the
 * downstream zod `.parse` still owns validation (an inverted/malformed range is rejected there).
 */
export async function setTravelWindowForm(formData: FormData): Promise<void> {
  await setTravelWindow({
    from: String(formData.get("from") ?? ""),
    to: String(formData.get("to") ?? ""),
    costCenter: String(formData.get("costCenter") ?? ""),
  });
}
