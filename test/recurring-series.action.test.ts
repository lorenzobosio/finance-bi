import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

// Wave-0 TDD RED (FLOW-01 write-plane, D-02/D-03) — freezes the LOCKED confirm/dismiss Server Action
// contract for the not-yet-existent `@/lib/actions/recurring-series` (+ its sibling `.schema`). RED at
// RUNTIME only ("Cannot find package '@/lib/actions/recurring-series'"); the import specifier is
// COMPUTED so `tsc --noEmit` stays green while the module is absent (STATE.md 07-01/08-01 KEY
// MECHANISM). Mirrors the injected-fake-client seam of `test/set-thresholds.test.ts` so the action
// runs DB-FREE — the `__confirmSeries(raw, factory)` / `__dismissSeries(raw, factory)` testable core.
//
// The LOCKED write-plane discipline (09-PATTERNS "LOCKED write-plane" / budgets.ts + set-thresholds):
//   • the payload is zod-`.parse`d BEFORE any write (a malformed payload throws, nothing written).
//   • ONLY parsed + explicitly-mapped fields reach the client (mass-assignment guard — an injected
//     is_recurring / is_demo / status key NEVER appears in an update payload).
//   • confirmSeries sets recurring_series.status='active' AND stamps transactions.is_recurring=true
//     on the series' matched rows (the D-03 GOAL-09 interaction).
//   • dismissSeries flips status='dismissed' and does NOT unstamp is_recurring (A5/OQ1 — a dismissed
//     series' rows were genuinely recurring).
//   • the module never reaches the service key / DATABASE_URL / Drizzle — RLS under the owner JWT is
//     the authorization wall (the injected @supabase/ssr seam is the ONLY client).
//
// Synthetic values only; no PII.

// revalidatePath throws outside a Next request context — stub it so the DB-free unit test can
// exercise the action body (we assert the supabase calls, not the cache revalidation).
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import type { HouseholdWriteClient } from "@/lib/actions/goal-config.shared";

const ACTION_MODULE = "@/lib/actions/recurring-series";
const SCHEMA_MODULE = "@/lib/actions/recurring-series.schema";

// A well-formed confirm payload (a uuid id + the stable detection key that scopes the stamp).
const SERIES_ID = "11111111-1111-1111-1111-111111111111";
const VALID_CONFIRM = { id: SERIES_ID, seriesKey: "spotify" };
const VALID_DISMISS = { id: SERIES_ID };

interface FactoryFn {
  (): Promise<HouseholdWriteClient>;
}

interface ActionModule {
  __confirmSeries: (raw: unknown, factory: FactoryFn) => Promise<{ ok: true }>;
  __dismissSeries: (raw: unknown, factory: FactoryFn) => Promise<{ ok: true }>;
}

async function loadAction(): Promise<ActionModule> {
  const mod = (await import(/* @vite-ignore */ ACTION_MODULE)) as Record<string, unknown>;
  return {
    __confirmSeries: mod.__confirmSeries as ActionModule["__confirmSeries"],
    __dismissSeries: mod.__dismissSeries as ActionModule["__dismissSeries"],
  };
}

async function loadSchema(): Promise<{
  ConfirmSeriesSchema: { safeParse: (v: unknown) => { success: boolean } };
}> {
  const mod = (await import(/* @vite-ignore */ SCHEMA_MODULE)) as Record<string, unknown>;
  return {
    ConfirmSeriesSchema: mod.ConfirmSeriesSchema as {
      safeParse: (v: unknown) => { success: boolean };
    },
  };
}

interface Call {
  table: string;
  op: "select" | "update";
  payload: Record<string, unknown>;
  eqs: Array<[string, unknown]>;
}

/**
 * A spy household client recording every from()/select()/update()/eq() call (copied structurally
 * from set-thresholds.test.ts). Every recurring_series select resolves to a stub row so the action
 * can resolve the stamp scope without a live DB.
 */
function makeFakeSupabase() {
  const calls: Call[] = [];

  function from(table: string) {
    const builder = {
      _op: null as "select" | "update" | null,
      _payload: {} as Record<string, unknown>,
      _eqs: [] as Array<[string, unknown]>,
      select(_cols?: string) {
        this._op = "select";
        return this;
      },
      update(payload: Record<string, unknown>) {
        this._op = "update";
        this._payload = payload;
        return this;
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
        return Promise.resolve({
          data: { id: SERIES_ID, series_key: "spotify", amount_eur: -12.99 },
          error: null,
        });
      },
    };
    return builder;
  }

  return { client: { from } as unknown as HouseholdWriteClient, calls };
}

const updatesTo = (calls: Call[], table: string) =>
  calls.filter((c) => c.table === table && c.op === "update");

describe("recurring-series schema — locked payload boundary", () => {
  it("accepts a valid confirm payload", async () => {
    const { ConfirmSeriesSchema } = await loadSchema();
    expect(ConfirmSeriesSchema.safeParse(VALID_CONFIRM).success).toBe(true);
  });

  it("rejects a malformed (non-uuid) id", async () => {
    const { ConfirmSeriesSchema } = await loadSchema();
    expect(ConfirmSeriesSchema.safeParse({ ...VALID_CONFIRM, id: "not-a-uuid" }).success).toBe(
      false,
    );
  });
});

describe("__confirmSeries — activates the series AND stamps is_recurring (D-03)", () => {
  it("sets recurring_series.status='active' scoped by id", async () => {
    const { __confirmSeries } = await loadAction();
    const { client, calls } = makeFakeSupabase();
    await __confirmSeries(VALID_CONFIRM, async () => client);

    const seriesUpdates = updatesTo(calls, "recurring_series");
    expect(seriesUpdates).toHaveLength(1);
    expect(seriesUpdates[0].payload).toEqual({ status: "active" });
    expect(seriesUpdates[0].eqs).toContainEqual(["id", SERIES_ID]);
  });

  it("stamps transactions.is_recurring=true on the matched rows (GOAL-09 interaction)", async () => {
    const { __confirmSeries } = await loadAction();
    const { client, calls } = makeFakeSupabase();
    await __confirmSeries(VALID_CONFIRM, async () => client);

    const txUpdates = updatesTo(calls, "transactions");
    expect(txUpdates.length).toBeGreaterThanOrEqual(1);
    // The ONLY mapped column — a fixed literal, never a caller-supplied value.
    expect(txUpdates[0].payload).toEqual({ is_recurring: true });
  });

  it("strips injected extra keys (mass-assignment guard — is_recurring/is_demo/status never forged)", async () => {
    const { __confirmSeries } = await loadAction();
    const { client, calls } = makeFakeSupabase();
    await __confirmSeries(
      { ...VALID_CONFIRM, is_recurring: false, is_demo: true, status: "evil" },
      async () => client,
    );

    // The series update carries ONLY the fixed status literal — no forged is_demo, no forged status.
    const seriesUpdates = updatesTo(calls, "recurring_series");
    expect(seriesUpdates[0].payload).toEqual({ status: "active" });
    // The transactions stamp carries ONLY is_recurring:true — the injected is_recurring:false is ignored.
    const txUpdates = updatesTo(calls, "transactions");
    expect(txUpdates[0].payload).toEqual({ is_recurring: true });
  });

  it("rejects a malformed payload BEFORE any write (zod parse first)", async () => {
    const { __confirmSeries } = await loadAction();
    const { client, calls } = makeFakeSupabase();
    await expect(__confirmSeries({ id: "not-a-uuid" }, async () => client)).rejects.toThrow();
    expect(calls.filter((c) => c.op === "update")).toHaveLength(0);
  });
});

describe("__dismissSeries — flips status, does NOT unstamp is_recurring (A5/OQ1)", () => {
  it("sets recurring_series.status='dismissed' scoped by id", async () => {
    const { __dismissSeries } = await loadAction();
    const { client, calls } = makeFakeSupabase();
    await __dismissSeries(VALID_DISMISS, async () => client);

    const seriesUpdates = updatesTo(calls, "recurring_series");
    expect(seriesUpdates).toHaveLength(1);
    expect(seriesUpdates[0].payload).toEqual({ status: "dismissed" });
    expect(seriesUpdates[0].eqs).toContainEqual(["id", SERIES_ID]);
  });

  it("does NOT touch transactions.is_recurring (a dismissed series' rows were genuinely recurring)", async () => {
    const { __dismissSeries } = await loadAction();
    const { client, calls } = makeFakeSupabase();
    await __dismissSeries(VALID_DISMISS, async () => client);
    expect(updatesTo(calls, "transactions")).toHaveLength(0);
  });
});

describe("recurring-series action — the RLS wall (no privileged client)", () => {
  it("never imports service_role / DATABASE_URL / Drizzle (RLS under the owner JWT authorizes)", () => {
    // Source-level negative grep, staged-RED until the module lands (readFileSync throws ENOENT).
    const src = readFileSync(
      join(__dirname, "..", "src/lib/actions/recurring-series.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/service_role|SERVICE_ROLE/);
    expect(src).not.toMatch(/DATABASE_URL/);
    expect(src).not.toMatch(/from ["']drizzle|drizzle-orm|postgres["']/);
    // File-level "use server" boundary (the LOCKED write-plane header discipline).
    expect(src).toMatch(/["']use server["']/);
  });
});
