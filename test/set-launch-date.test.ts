import { describe, expect, it } from "vitest";

// set-launch-date + edit-why write-plane behaviour test (D5-01/16, PERS-04).
//
// DB-free: both Server Actions take an injected `createClient` factory (mirroring the
// recategorize/create-rule injected-fake style) so we can assert exactly which supabase-js
// calls fire — without a live DB. Synthetic values only (no PII).
//
// Invariants asserted here (the LOCKED write-plane discipline — RESEARCH Pattern 6):
//   • SetLaunchDateInputSchema rejects a malformed date and accepts an ISO date / null-to-clear.
//   • EditWhyInputSchema rejects empty/over-long text and accepts a bounded string.
//   • __setLaunchDate / __editWhy write ONLY the parsed field (mass-assignment guard) via a
//     single `.update(...).eq('is_demo', false)` when the singleton row exists, and an
//     `.insert(...)` (with the fixed is_demo=false partition literal) when it does not.
//   • Neither action references service_role / DATABASE_URL / the Drizzle client.

// revalidatePath throws outside a Next request context — stub it so the DB-free unit test can
// exercise the action bodies (we assert the supabase calls, not the cache revalidation).
import { vi } from "vitest";
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { EditWhyInputSchema } from "@/lib/actions/edit-why.schema";
import { __editWhy } from "@/lib/actions/edit-why";
import type { HouseholdWriteClient } from "@/lib/actions/goal-config.shared";
import { SetLaunchDateInputSchema } from "@/lib/actions/set-launch-date.schema";
import { __setLaunchDate } from "@/lib/actions/set-launch-date";

/**
 * A spy household client recording every from()/select()/update()/insert()/eq() call. `existing`
 * decides whether the singleton read finds a row (→ update path) or not (→ insert path).
 */
function makeFakeSupabase(existing: { id: string } | null) {
  const calls: Array<{
    table: string;
    op: "select" | "update" | "insert";
    payload: Record<string, unknown>;
    eqs: Array<[string, unknown]>;
  }> = [];

  function from(table: string) {
    const builder = {
      _op: null as "select" | "update" | "insert" | null,
      _payload: {} as Record<string, unknown>,
      _eqs: [] as Array<[string, unknown]>,
      select(_cols: string) {
        this._op = "select";
        return this;
      },
      update(payload: Record<string, unknown>) {
        this._op = "update";
        this._payload = payload;
        return this;
      },
      insert(payload: Record<string, unknown>) {
        this._op = "insert";
        this._payload = payload;
        calls.push({ table, op: "insert", payload, eqs: [] });
        return Promise.resolve({ data: null, error: null });
      },
      eq(col: string, val: unknown) {
        this._eqs.push([col, val]);
        if (this._op === "update") {
          calls.push({ table, op: "update", payload: this._payload, eqs: [...this._eqs] });
          return Promise.resolve({ data: null, error: null });
        }
        return this;
      },
      maybeSingle() {
        calls.push({ table, op: "select", payload: {}, eqs: [...this._eqs] });
        return Promise.resolve({ data: existing, error: null });
      },
    };
    return builder;
  }

  // The structural fake satisfies the write seam; the union return of `eq` (builder | Promise) is
  // wider than the seam needs, so cast at the boundary (the runtime shape is exact).
  return { client: { from } as unknown as HouseholdWriteClient, calls };
}

describe("SetLaunchDateInputSchema — locked date boundary", () => {
  it("rejects a malformed date", () => {
    expect(SetLaunchDateInputSchema.safeParse({ launchDate: "nope" }).success).toBe(false);
  });

  it("rejects an impossible calendar date", () => {
    expect(SetLaunchDateInputSchema.safeParse({ launchDate: "2026-13-40" }).success).toBe(false);
  });

  it("accepts a well-formed ISO date", () => {
    expect(SetLaunchDateInputSchema.safeParse({ launchDate: "2026-07-01" }).success).toBe(true);
  });

  it("accepts null to clear the launch date", () => {
    expect(SetLaunchDateInputSchema.safeParse({ launchDate: null }).success).toBe(true);
  });
});

describe("EditWhyInputSchema — bounded free text", () => {
  it("rejects empty text", () => {
    expect(EditWhyInputSchema.safeParse({ why: "   " }).success).toBe(false);
  });

  it("rejects over-long text", () => {
    expect(EditWhyInputSchema.safeParse({ why: "x".repeat(2000) }).success).toBe(false);
  });

  it("accepts a bounded string", () => {
    expect(EditWhyInputSchema.safeParse({ why: "One year off together." }).success).toBe(true);
  });
});

describe("__setLaunchDate — writes ONLY the parsed field to the real partition", () => {
  it("updates the singleton in place when the row exists (single field, is_demo scoped)", async () => {
    const { client, calls } = makeFakeSupabase({ id: "abc" });
    await __setLaunchDate({ launchDate: "2026-07-01" }, async () => client);

    const updates = calls.filter((c) => c.table === "household" && c.op === "update");
    expect(updates).toHaveLength(1);
    // Only the parsed launch_date is written — never a raw client spread.
    expect(updates[0].payload).toEqual({ launch_date: "2026-07-01" });
    // The update is scoped to the real partition (is_demo=false) — never the demo singleton.
    expect(updates[0].eqs).toEqual([["is_demo", false]]);
    expect(calls.filter((c) => c.op === "insert")).toHaveLength(0);
  });

  it("inserts a real-partition row (is_demo=false) when none exists yet", async () => {
    const { client, calls } = makeFakeSupabase(null);
    await __setLaunchDate({ launchDate: "2026-07-01" }, async () => client);

    const inserts = calls.filter((c) => c.table === "household" && c.op === "insert");
    expect(inserts).toHaveLength(1);
    expect(inserts[0].payload).toEqual({ launch_date: "2026-07-01", is_demo: false });
    expect(calls.filter((c) => c.op === "update")).toHaveLength(0);
  });

  it("rejects a malformed date before any write", async () => {
    const { client, calls } = makeFakeSupabase({ id: "abc" });
    await expect(__setLaunchDate({ launchDate: "not-a-date" }, async () => client)).rejects.toThrow();
    expect(calls.filter((c) => c.op === "update" || c.op === "insert")).toHaveLength(0);
  });
});

describe("__editWhy — writes ONLY the parsed why", () => {
  it("updates the singleton why (single field, is_demo scoped)", async () => {
    const { client, calls } = makeFakeSupabase({ id: "abc" });
    await __editWhy({ why: "  Freedom to choose our work.  " }, async () => client);

    const updates = calls.filter((c) => c.table === "household" && c.op === "update");
    expect(updates).toHaveLength(1);
    // Trimmed + only the parsed field.
    expect(updates[0].payload).toEqual({ why: "Freedom to choose our work." });
    expect(updates[0].eqs).toEqual([["is_demo", false]]);
  });
});
