import { describe, expect, it, vi } from "vitest";

// Phase-5 goal write-plane behaviour test (GOAL-09/GOAL-10, D5-04/09/10, CAT-08).
//
// DB-free: each Server Action takes an injected `GoalWriteClientFactory` (mirroring the
// recategorize.test.ts injected-fake style) so we assert exactly which supabase-js calls fire —
// without a live DB. Synthetic uuids + fake merchants + synthetic round € only (T-02-01).
//
// Invariants asserted here:
//   • set-travel-window writes a STRUCTURED window rule (never a SQL string), then does an
//     EXPLICIT reapply scoped to the window AND is_recurring=false, and is IDEMPOTENT (a second
//     run affects 0 rows). A bad (inverted) date range is rejected before any write.
//   • edit-transfer-split rejects a non-sane split and upserts ONE override row (parsed fields).
//   • toggle-epic-trip rejects a non-boolean and writes ONLY epic_trip_active (no id/is_demo).

// revalidatePath throws outside a Next request context — stub it so the DB-free unit test can
// exercise the action bodies (we assert the supabase calls, not the cache revalidation).
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { __setTravelWindow } from "@/lib/actions/set-travel-window";
import { __editTransferSplit } from "@/lib/actions/edit-transfer-split";
import { __toggleEpicTrip } from "@/lib/actions/toggle-epic-trip";

const TX_UUID = "00000000-0000-4000-8000-000000000000";

interface FakeTx {
  // Index signature so the fake `select` result satisfies the seam's Record<string, unknown>[].
  [key: string]: unknown;
  id: string;
  description: string;
  cost_center: string | null;
  booking_date: string;
  is_recurring: boolean;
}

interface Call {
  table: string;
  op: "insert" | "upsert" | "select" | "update";
  payload?: Record<string, unknown>;
  options?: Record<string, unknown>;
  in?: [string, unknown[]];
  eq?: [string, unknown];
}

/** A spy goal-write client. `select('...')` on transactions returns the (mutable) seed rows so
 *  the idempotency test can re-run against the already-tagged set. `update().in()` mutates that
 *  set to simulate the DB write. */
function makeFake(seedTx: FakeTx[] = []) {
  const calls: Call[] = [];
  const state = { transactions: [...seedTx] };

  function from(table: string) {
    return {
      insert(payload: Record<string, unknown>) {
        calls.push({ table, op: "insert", payload });
        return Promise.resolve({ error: null });
      },
      upsert(payload: Record<string, unknown>, options?: Record<string, unknown>) {
        calls.push({ table, op: "upsert", payload, options });
        return Promise.resolve({ error: null });
      },
      select(cols: string) {
        calls.push({ table, op: "select", payload: { cols } });
        const data = table === "transactions" ? state.transactions : [];
        return Promise.resolve({ data, error: null });
      },
      update(payload: Record<string, unknown>) {
        return {
          in(col: string, vals: unknown[]) {
            calls.push({ table, op: "update", payload, in: [col, vals] });
            if (table === "transactions") {
              const ids = new Set(vals as string[]);
              state.transactions = state.transactions.map((r) =>
                ids.has(r.id) ? { ...r, cost_center: payload.cost_center as string } : r,
              );
            }
            return Promise.resolve({ error: null });
          },
          eq(col: string, val: unknown) {
            calls.push({ table, op: "update", payload, eq: [col, val] });
            return Promise.resolve({ error: null });
          },
        };
      },
    };
  }

  return { client: { from }, calls, state };
}

describe("set-travel-window (GOAL-09/D5-09) — explicit, idempotent, is_recurring-skipping reapply", () => {
  const seed: FakeTx[] = [
    // inside window, discretionary → tagged
    { id: "in-1", description: "flight sao paulo", cost_center: "shared", booking_date: "2025-12-05", is_recurring: false },
    { id: "in-2", description: "hotel rio", cost_center: "shared", booking_date: "2025-12-18", is_recurring: false },
    // inside window but RECURRING → skipped (D5-09 option (b))
    { id: "rec", description: "netflix", cost_center: "shared", booking_date: "2025-12-10", is_recurring: true },
    // outside window → skipped
    { id: "out", description: "grocery run", cost_center: "shared", booking_date: "2025-11-28", is_recurring: false },
  ];

  const validWindow = { from: "2025-12-01", to: "2025-12-20", costCenter: "brazil" as const };

  it("writes a STRUCTURED window rule (never a SQL string) and tags ONLY in-window non-recurring rows", async () => {
    const { client, calls } = makeFake(seed);
    const { affected } = await __setTravelWindow(validWindow, async () => client);

    // One structured window rule inserted — match_criteria is an object, not a string.
    const ruleInserts = calls.filter((c) => c.table === "rules" && c.op === "insert");
    expect(ruleInserts).toHaveLength(1);
    expect(ruleInserts[0].payload).toMatchObject({
      match_criteria: { bookingDateFrom: "2025-12-01", bookingDateTo: "2025-12-20" },
      set_cost_center: "brazil",
      priority: 100,
      version: 1,
    });
    expect(typeof ruleInserts[0].payload!.match_criteria).toBe("object");

    // Exactly the two in-window, non-recurring rows are bulk-tagged (.in scope).
    expect(affected).toBe(2);
    const bulk = calls.filter((c) => c.table === "transactions" && c.op === "update");
    expect(bulk).toHaveLength(1);
    expect((bulk[0].in![1] as string[]).sort()).toEqual(["in-1", "in-2"]);
    expect(bulk[0].payload).toEqual({ cost_center: "brazil" });
  });

  it("is idempotent — a second run over the already-tagged set affects 0 rows (no silent rewrite)", async () => {
    const { client } = makeFake(seed);
    const first = await __setTravelWindow(validWindow, async () => client);
    expect(first.affected).toBe(2);
    const second = await __setTravelWindow(validWindow, async () => client);
    expect(second.affected).toBe(0);
  });

  it("rejects an inverted date range BEFORE any write", async () => {
    const { client, calls } = makeFake(seed);
    await expect(
      __setTravelWindow({ from: "2025-12-20", to: "2025-12-01", costCenter: "brazil" }, async () => client),
    ).rejects.toThrow();
    expect(calls).toHaveLength(0); // nothing written on a bad payload
  });

  it("rejects a cost center outside the two travel buckets", async () => {
    const { client } = makeFake(seed);
    await expect(
      __setTravelWindow({ from: "2025-12-01", to: "2025-12-20", costCenter: "lorenzo" }, async () => client),
    ).rejects.toThrow();
  });
});

describe("edit-transfer-split (D5-04) — upsert one override, reject a non-sane split", () => {
  const validSplit = {
    transactionId: TX_UUID,
    wealthEur: 3000,
    brazilEur: 500,
    advSmallEur: 300,
    advBigEur: 200,
  };

  it("upserts exactly one transfer_overrides row keyed on transaction_id with only parsed fields", async () => {
    const { client, calls } = makeFake();
    await __editTransferSplit(validSplit, async () => client);
    const upserts = calls.filter((c) => c.table === "transfer_overrides" && c.op === "upsert");
    expect(upserts).toHaveLength(1);
    expect(upserts[0].payload).toEqual({
      transaction_id: TX_UUID,
      wealth_eur: 3000,
      brazil_eur: 500,
      adv_small_eur: 300,
      adv_big_eur: 200,
    });
    expect(upserts[0].options).toEqual({ onConflict: "transaction_id" });
  });

  it("rejects a negative leg (non-sane split) before any write", async () => {
    const { client, calls } = makeFake();
    await expect(
      __editTransferSplit({ ...validSplit, brazilEur: -100 }, async () => client),
    ).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });

  it("rejects an all-zero split (allocates nothing)", async () => {
    const { client } = makeFake();
    await expect(
      __editTransferSplit(
        { transactionId: TX_UUID, wealthEur: 0, brazilEur: 0, advSmallEur: 0, advBigEur: 0 },
        async () => client,
      ),
    ).rejects.toThrow();
  });
});

describe("toggle-epic-trip (GOAL-10/D5-10, RESEARCH Q2) — writes ONLY epic_trip_active", () => {
  it("updates only epic_trip_active on the non-demo singleton (no client-supplied id/is_demo)", async () => {
    const { client, calls } = makeFake();
    await __toggleEpicTrip({ active: true }, async () => client);
    const updates = calls.filter((c) => c.table === "household" && c.op === "update");
    expect(updates).toHaveLength(1);
    // The write carries ONLY the boolean — never id/is_demo (mass-assignment guard, T-05-31).
    expect(updates[0].payload).toEqual({ epic_trip_active: true });
    // Scoped to the REAL singleton via the server-constant is_demo=false.
    expect(updates[0].eq).toEqual(["is_demo", false]);
  });

  it("rejects a non-boolean active flag before any write", async () => {
    const { client, calls } = makeFake();
    await expect(__toggleEpicTrip({ active: "yes" }, async () => client)).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });

  it("ignores a client-supplied is_demo / id (parses only { active })", async () => {
    const { client, calls } = makeFake();
    await __toggleEpicTrip({ active: false, is_demo: true, id: "spoofed" }, async () => client);
    const updates = calls.filter((c) => c.table === "household" && c.op === "update");
    expect(updates[0].payload).toEqual({ epic_trip_active: false });
    expect(updates[0].eq).toEqual(["is_demo", false]);
  });
});
