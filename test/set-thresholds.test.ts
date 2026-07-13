import { describe, expect, it } from "vitest";

// Wave-0 TDD RED (D-07 LOCKED write-plane) — freezes the Threshold Config Server Action contract for
// the not-yet-existent `@/lib/actions/set-thresholds` (+ its sibling `.schema`). FAILS at
// import-resolution until the modules land — the intended Nyquist RED anchor, NOT a bug.
//
// Copies `test/set-launch-date.test.ts` verbatim in structure: an injected fake write-client factory
// so the action runs DB-free. The LOCKED write-plane discipline (RESEARCH Pattern 6 / 06-PATTERNS):
//   • SetThresholdsInputSchema rejects a malformed payload and accepts a valid band set.
//   • __setThresholds writes ONLY the parsed band fields (mass-assignment guard — no extra key such
//     as an injected `is_demo`/`id` reaches `.update`/`.insert`) via a single scoped
//     `.update(...).eq('is_demo', false)` when the singleton exists, and an `.insert(...)` carrying
//     the fixed `is_demo=false` partition literal when it does not.
//   • A malformed payload throws BEFORE any write (zod `.parse` first — the fake write methods are
//     never called). Never references service_role / DATABASE_URL / the Drizzle client.
//
// Synthetic band numbers only; no PII.

// revalidatePath throws outside a Next request context — stub it so the DB-free unit test can
// exercise the action body (we assert the supabase calls, not the cache revalidation).
import { vi } from "vitest";
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import type { HouseholdWriteClient } from "@/lib/actions/goal-config.shared";
import { SetThresholdsInputSchema } from "@/lib/actions/set-thresholds.schema";
import { __setThresholds } from "@/lib/actions/set-thresholds";

// A valid flat (form-shaped) threshold payload — the seeded defaults.
const VALID = {
  savingsRateHealthy: 0.2,
  savingsRateWatch: 0.1,
  reserveHealthy: 6,
  reserveWatch: 3,
  budgetAdherenceWatchOverPct: 0.1,
  streakWatchMisses: 1,
};

// The snake_case columns the action must map the parsed input to (mirrors set-launch-date's
// launchDate → launch_date mapping) — and NOTHING else.
const EXPECTED_COLUMNS = {
  savings_rate_healthy: 0.2,
  savings_rate_watch: 0.1,
  reserve_healthy: 6,
  reserve_watch: 3,
  budget_adherence_watch_over_pct: 0.1,
  streak_watch_misses: 1,
};

/**
 * A spy household client recording every from()/select()/update()/insert()/eq() call (copied from
 * set-launch-date.test.ts). `existing` decides whether the singleton read finds a row (→ update
 * path) or not (→ insert path).
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

  return { client: { from } as unknown as HouseholdWriteClient, calls };
}

describe("SetThresholdsInputSchema — locked band boundary", () => {
  it("accepts a valid band set", () => {
    expect(SetThresholdsInputSchema.safeParse(VALID).success).toBe(true);
  });

  it("rejects a malformed (non-numeric) band", () => {
    expect(
      SetThresholdsInputSchema.safeParse({ ...VALID, savingsRateHealthy: "nope" }).success,
    ).toBe(false);
  });
});

describe("__setThresholds — writes ONLY the parsed band fields to the real partition", () => {
  it("updates the singleton in place when the row exists (mapped columns only, is_demo scoped)", async () => {
    const { client, calls } = makeFakeSupabase({ id: "abc" });
    await __setThresholds(VALID, async () => client);

    const updates = calls.filter((c) => c.table === "insight_thresholds" && c.op === "update");
    expect(updates).toHaveLength(1);
    expect(updates[0].payload).toEqual(EXPECTED_COLUMNS);
    expect(updates[0].eqs).toEqual([["is_demo", false]]);
    expect(calls.filter((c) => c.op === "insert")).toHaveLength(0);
  });

  it("inserts a real-partition row (is_demo=false) when none exists yet", async () => {
    const { client, calls } = makeFakeSupabase(null);
    await __setThresholds(VALID, async () => client);

    const inserts = calls.filter((c) => c.table === "insight_thresholds" && c.op === "insert");
    expect(inserts).toHaveLength(1);
    expect(inserts[0].payload).toEqual({ ...EXPECTED_COLUMNS, is_demo: false });
    expect(calls.filter((c) => c.op === "update")).toHaveLength(0);
  });

  it("strips injected extra keys (mass-assignment guard — is_demo/id never reach the write)", async () => {
    const { client, calls } = makeFakeSupabase({ id: "abc" });
    await __setThresholds({ ...VALID, is_demo: true, id: "evil" }, async () => client);

    const updates = calls.filter((c) => c.table === "insight_thresholds" && c.op === "update");
    expect(updates).toHaveLength(1);
    // Only the mapped band columns — no forged is_demo=true, no id.
    expect(updates[0].payload).toEqual(EXPECTED_COLUMNS);
    expect(updates[0].eqs).toEqual([["is_demo", false]]);
  });

  it("rejects a malformed payload before any write (zod parse first)", async () => {
    const { client, calls } = makeFakeSupabase({ id: "abc" });
    await expect(
      __setThresholds({ ...VALID, reserveHealthy: "nope" }, async () => client),
    ).rejects.toThrow();
    expect(calls.filter((c) => c.op === "update" || c.op === "insert")).toHaveLength(0);
  });
});
