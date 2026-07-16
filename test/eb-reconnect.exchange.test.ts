import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

// Wave-0 TDD RED (Phase-14 REM-01, D-02/D-04/D-08) — freezes the EXCHANGE contract for the reconnect
// callback Server Action's testable core `__completeReconnect(raw, deps)` in the not-yet-existent
// `@/lib/actions/eb-reconnect` (+ its sibling `EbReconnectSchema` in `@/lib/actions/eb-reconnect.schema`).
// Mirrors the injected-fake-client seam of `test/recurring-series.action.test.ts` so the action runs
// DB/network-free. RED at RUNTIME only: the COMPUTED dynamic-import specifier keeps `tsc --noEmit`
// green while the modules are absent, and `await import(...)` REJECTS ("Cannot find package") until
// 14-02 lands them. The negative SOURCE-GREP is staged-RED via readFileSync ENOENT until then.
//
// The LOCKED write-plane discipline this pins (owner-JWT-only, Anti-Patterns + Security Domain):
//   • the { code, state } payload is zod-`.parse`d BEFORE any write (a malformed payload -> nothing written).
//   • state-nonce mismatch (cookie state !== parsed state) -> exchange-error, NO sessions() call, NO write (CSRF, D-04).
//   • happy path -> sessions(code) then a SINGLE connections UPDATE whose payload carries ONLY
//     session_id, expires_at (= the response's access.valid_until, never a hard-coded 90/180), and
//     consent_status:'active' (mass-assignment guard — an injected is_demo/provider/extra key never lands).
//   • env absent -> 503-shaped degrade (NO signing/network/write).
//   • revalidatePath invoked on success (so the banner clears — Pitfall 5).
//   • the module never reaches service_role / DATABASE_URL / postgres|drizzle — RLS under the owner JWT
//     via the injected @supabase/ssr client is the ONLY authorization wall (negative source-grep).
//
// Synthetic values only; no PII, no real key.

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const ACTION_MODULE = "@/lib/actions/eb-reconnect";
const SCHEMA_MODULE = "@/lib/actions/eb-reconnect.schema";

// --- Synthetic fixtures ----------------------------------------------------------------------
const STATE_NONCE = "state-nonce-abcdef";
const FAKE_CODE = "auth-code-xyz-123";
const VALID_EXCHANGE = { code: FAKE_CODE, state: STATE_NONCE };
const NEW_SESSION_ID = "sess-reconnected-999";
const NEW_VALID_UNTIL = "2026-12-15T00:00:00Z"; // the REAL consent window from the response
const CONN_ID = "22222222-2222-2222-2222-222222222222";
const FAKE_PEM = "-----BEGIN PRIVATE KEY-----\nSYNTHETIC-NOT-A-REAL-KEY\n-----END PRIVATE KEY-----";

interface ExchangeResult {
  status: number;
  ok?: boolean;
  reason?: string;
}

interface ExchangeDeps {
  getClient: () => Promise<unknown>;
  isDemo: () => Promise<boolean>;
  cookieStore: () => Promise<{ get: (name: string) => { value: string } | undefined; delete?: (name: string) => void }>;
  env: () => { appId?: string; pem?: string; redirectUrl?: string };
  signJwt: (appId: string, pem: string) => Promise<string>;
  sessions: (jwt: string, code: string) => Promise<{ session_id: string; access: { valid_until: string } }>;
  revalidate: () => void;
}

type CompleteFn = (raw: unknown, deps: ExchangeDeps) => Promise<ExchangeResult>;

async function loadAction(): Promise<{ __completeReconnect: CompleteFn }> {
  const mod = (await import(/* @vite-ignore */ ACTION_MODULE)) as Record<string, unknown>;
  return { __completeReconnect: mod.__completeReconnect as CompleteFn };
}

async function loadSchema(): Promise<{
  EbReconnectSchema: { safeParse: (v: unknown) => { success: boolean } };
}> {
  const mod = (await import(/* @vite-ignore */ SCHEMA_MODULE)) as Record<string, unknown>;
  return {
    EbReconnectSchema: mod.EbReconnectSchema as { safeParse: (v: unknown) => { success: boolean } },
  };
}

interface Call {
  table: string;
  op: "select" | "update";
  payload: Record<string, unknown>;
  eqs: Array<[string, unknown]>;
}

/**
 * A spy @supabase/ssr-shaped client recording every from()/select()/update()/eq() call (structurally
 * cloned from recurring-series.action.test.ts). A connections select resolves to a stub {id} row so
 * the action can find the latest row to UPDATE without a live DB.
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
      order(_col?: string, _opts?: unknown) {
        return this;
      },
      limit(_n?: number) {
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
        return Promise.resolve({ data: { id: CONN_ID }, error: null });
      },
    };
    return builder;
  }

  return { client: { from } as unknown, calls };
}

const updatesTo = (calls: Call[], table: string) =>
  calls.filter((c) => c.table === table && c.op === "update");

/** Deps with happy defaults; overrides break one seam per case. Tracks signJwt / sessions calls. */
function makeDeps(
  overrides: Partial<ExchangeDeps> = {},
  client: unknown = makeFakeSupabase().client,
) {
  const calls = { signJwt: 0, sessions: 0, revalidate: 0 };
  const deps: ExchangeDeps = {
    getClient: async () => client,
    isDemo: async () => false,
    cookieStore: async () => ({ get: (_name: string) => ({ value: STATE_NONCE }), delete: () => {} }),
    env: () => ({ appId: "app-1", pem: FAKE_PEM }),
    signJwt: async () => {
      calls.signJwt++;
      return "signed.jwt.token";
    },
    sessions: async (_jwt, _code) => {
      calls.sessions++;
      return { session_id: NEW_SESSION_ID, access: { valid_until: NEW_VALID_UNTIL } };
    },
    revalidate: () => {
      calls.revalidate++;
    },
    ...overrides,
  };
  return { deps, calls };
}

describe("EbReconnectSchema — the { code, state } payload boundary", () => {
  it("accepts a well-formed exchange payload", async () => {
    const { EbReconnectSchema } = await loadSchema();
    expect(EbReconnectSchema.safeParse(VALID_EXCHANGE).success).toBe(true);
  });

  it("rejects a malformed payload (missing code)", async () => {
    const { EbReconnectSchema } = await loadSchema();
    expect(EbReconnectSchema.safeParse({ state: STATE_NONCE }).success).toBe(false);
  });
});

describe("__completeReconnect — zod-parse BEFORE any write", () => {
  it("rejects a malformed { code, state } before touching the client (nothing written)", async () => {
    const { __completeReconnect } = await loadAction();
    const fake = makeFakeSupabase();
    const { deps } = makeDeps({}, fake.client);
    await expect(__completeReconnect({ state: STATE_NONCE }, deps)).rejects.toThrow();
    expect(fake.calls.filter((c) => c.op === "update")).toHaveLength(0);
  });
});

describe("__completeReconnect — CSRF state-nonce binding (D-04)", () => {
  it("nonce mismatch -> exchange-error, NO sessions() call and NO connections write", async () => {
    const { __completeReconnect } = await loadAction();
    const fake = makeFakeSupabase();
    const { deps, calls } = makeDeps(
      { cookieStore: async () => ({ get: () => ({ value: "a-different-nonce" }), delete: () => {} }) },
      fake.client,
    );
    const res = await __completeReconnect(VALID_EXCHANGE, deps);
    expect(res.ok).not.toBe(true);
    expect(calls.sessions).toBe(0);
    expect(updatesTo(fake.calls, "connections")).toHaveLength(0);
  });
});

describe("__completeReconnect — happy path (owner-JWT connections UPDATE, mass-assignment guard)", () => {
  it("calls sessions(code) then writes a SINGLE connections UPDATE with ONLY the three mapped columns", async () => {
    const { __completeReconnect } = await loadAction();
    const fake = makeFakeSupabase();
    const { deps, calls } = makeDeps({}, fake.client);
    await __completeReconnect(VALID_EXCHANGE, deps);

    expect(calls.sessions).toBe(1);
    const connUpdates = updatesTo(fake.calls, "connections");
    expect(connUpdates).toHaveLength(1);
    // expires_at is the RESPONSE's access.valid_until — never a hard-coded 90/180.
    expect(connUpdates[0].payload).toEqual({
      session_id: NEW_SESSION_ID,
      expires_at: NEW_VALID_UNTIL,
      consent_status: "active",
    });
  });

  it("strips injected extra keys (is_demo / provider / forged session_id never reach the payload)", async () => {
    const { __completeReconnect } = await loadAction();
    const fake = makeFakeSupabase();
    const { deps } = makeDeps({}, fake.client);
    await __completeReconnect(
      { ...VALID_EXCHANGE, is_demo: true, provider: "evil", session_id: "forged", consent_status: "hacked" },
      deps,
    );
    const connUpdates = updatesTo(fake.calls, "connections");
    expect(connUpdates[0].payload).toEqual({
      session_id: NEW_SESSION_ID,
      expires_at: NEW_VALID_UNTIL,
      consent_status: "active",
    });
  });

  it("revalidates on success so the banner clears (Pitfall 5)", async () => {
    const { __completeReconnect } = await loadAction();
    const { deps, calls } = makeDeps();
    await __completeReconnect(VALID_EXCHANGE, deps);
    expect(calls.revalidate).toBe(1);
  });
});

describe("__completeReconnect — env-gated degrade (D-03)", () => {
  it("EB env absent -> 503-shaped, NO signing / NO sessions() / NO write", async () => {
    const { __completeReconnect } = await loadAction();
    const fake = makeFakeSupabase();
    const { deps, calls } = makeDeps({ env: () => ({}) }, fake.client);
    const res = await __completeReconnect(VALID_EXCHANGE, deps);
    expect(res.status).toBe(503);
    expect(calls.signJwt).toBe(0);
    expect(calls.sessions).toBe(0);
    expect(updatesTo(fake.calls, "connections")).toHaveLength(0);
  });
});

describe("eb-reconnect action — the RLS wall (no privileged client)", () => {
  it("never imports service_role / DATABASE_URL / drizzle|postgres, and carries 'use server'", () => {
    // Source-level negative grep, staged-RED until the module lands (readFileSync throws ENOENT).
    const src = readFileSync(join(__dirname, "..", "src/lib/actions/eb-reconnect.ts"), "utf8");
    expect(src).not.toMatch(/service_role|SERVICE_ROLE/);
    expect(src).not.toMatch(/DATABASE_URL/);
    expect(src).not.toMatch(/from ["']drizzle|drizzle-orm|postgres["']/);
    // File-level "use server" boundary (the LOCKED write-plane header discipline).
    expect(src).toMatch(/["']use server["']/);
  });
});
