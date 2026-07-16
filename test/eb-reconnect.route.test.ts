import { describe, expect, it, vi } from "vitest";

// Wave-0 TDD RED (Phase-14 REM-01, D-02/D-03/D-04) — freezes the START contract for the reconnect
// flow's testable core `__startReconnect(deps)` + the pure `buildAuthRequest()`, both landing in the
// not-yet-existent `@/lib/eb/reconnect-start` (the Route Handler `src/app/api/eb/reconnect/route.ts`
// delegates to it in 14-02). RED at RUNTIME only: the COMPUTED dynamic-import specifier keeps
// `tsc --noEmit` green while the module is absent (the recurring-series.action.test.ts idiom), and
// `await import(...)` REJECTS with "Cannot find package '@/lib/eb/reconnect-start'" until 14-02 lands.
//
// Every seam is INJECTED so the core runs auth/network/DB-free: getUser, isDemo, env, cookieStore,
// signJwt, aspsps, auth, randomState. The frozen ladder (mirrors the owner-gated export route +
// the Sentry/fetch-prices env-gate, Pattern 1/2):
//   • no session            -> 401-shaped, NO signing, NO /auth call
//   • demo session          -> 403-shaped, NO signing
//   • any EB env value absent-> 503-shaped "not configured", NO signing, NO network
//   • happy path            -> { status: 200, url } from the injected auth fake, sets an httpOnly
//                              `eb_reconnect_state` cookie === the injected random state, hands the
//                              WHITELISTED env redirect_url to auth (never request-derived, Pitfall 4),
//                              and NEVER leaks the private key into the returned object.
//
// Synthetic secrets only; no PII, no real key.

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const START_MODULE = "@/lib/eb/reconnect-start";

// --- Synthetic, non-secret fixtures ----------------------------------------------------------
const FAKE_APP_ID = "app-12345";
const FAKE_PEM = "-----BEGIN PRIVATE KEY-----\nSYNTHETIC-NOT-A-REAL-KEY\n-----END PRIVATE KEY-----";
const WHITELISTED_REDIRECT = "https://finance.example.app/eb/callback";
const FAKE_STATE = "state-nonce-abcdef";
const BANK_URL = "https://api.enablebanking.com/auth/redirect/xyz";

interface CookieSet {
  name: string;
  value: string;
  opts: Record<string, unknown>;
}

interface StartResult {
  status: number;
  url?: string;
  reason?: string;
}

interface StartDeps {
  getUser: () => Promise<{ id: string } | null>;
  isDemo: () => Promise<boolean>;
  env: () => { appId?: string; pem?: string; redirectUrl?: string };
  cookieStore: () => Promise<{ set: (name: string, value: string, opts?: Record<string, unknown>) => void }>;
  signJwt: (appId: string, pem: string) => Promise<string>;
  aspsps: (jwt: string, country: string) => Promise<{ aspsps: Array<{ name: string; country: string }> }>;
  auth: (jwt: string, body: Record<string, unknown>) => Promise<{ url: string }>;
  randomState: () => string;
}

type StartFn = (deps: StartDeps) => Promise<StartResult>;
type BuildAuthRequest = (input: {
  validUntil: string;
  redirectUrl: string;
  aspsp: { name: string; country: string };
  state: string;
}) => Record<string, unknown>;

async function loadStart(): Promise<{ __startReconnect: StartFn; buildAuthRequest: BuildAuthRequest }> {
  const mod = (await import(/* @vite-ignore */ START_MODULE)) as Record<string, unknown>;
  return {
    __startReconnect: mod.__startReconnect as StartFn,
    buildAuthRequest: mod.buildAuthRequest as BuildAuthRequest,
  };
}

/**
 * A recording deps bundle with happy defaults. Overrides let each case break one seam. Every call to
 * signJwt / auth / aspsps is counted so the gate cases can assert "no signing / no network".
 */
function makeDeps(overrides: Partial<StartDeps> = {}) {
  const cookieSets: CookieSet[] = [];
  const authBodies: Record<string, unknown>[] = [];
  const calls = { signJwt: 0, auth: 0, aspsps: 0 };

  const deps: StartDeps = {
    getUser: async () => ({ id: "owner-1" }),
    isDemo: async () => false,
    env: () => ({ appId: FAKE_APP_ID, pem: FAKE_PEM, redirectUrl: WHITELISTED_REDIRECT }),
    cookieStore: async () => ({
      set: (name, value, opts = {}) => {
        cookieSets.push({ name, value, opts });
      },
    }),
    signJwt: async (_appId, _pem) => {
      calls.signJwt++;
      return "signed.jwt.token";
    },
    aspsps: async (_jwt, _country) => {
      calls.aspsps++;
      return { aspsps: [{ name: "Revolut", country: "DE" }] };
    },
    auth: async (_jwt, body) => {
      calls.auth++;
      authBodies.push(body);
      return { url: BANK_URL };
    },
    randomState: () => FAKE_STATE,
    ...overrides,
  };

  return { deps, cookieSets, authBodies, calls };
}

describe("__startReconnect() — the 401/403/503/happy gate ladder (REM-01, D-02/03/04)", () => {
  it("no session -> 401-shaped, NO signing and NO /auth call", async () => {
    const { __startReconnect } = await loadStart();
    const { deps, calls } = makeDeps({ getUser: async () => null });
    const res = await __startReconnect(deps);
    expect(res.status).toBe(401);
    expect(calls.signJwt).toBe(0);
    expect(calls.auth).toBe(0);
  });

  it("demo session -> 403-shaped, NO signing", async () => {
    const { __startReconnect } = await loadStart();
    const { deps, calls } = makeDeps({ isDemo: async () => true });
    const res = await __startReconnect(deps);
    expect(res.status).toBe(403);
    expect(calls.signJwt).toBe(0);
  });

  it("missing EB appId -> 503-shaped 'not configured', NO signing and NO network", async () => {
    const { __startReconnect } = await loadStart();
    const { deps, calls } = makeDeps({
      env: () => ({ pem: FAKE_PEM, redirectUrl: WHITELISTED_REDIRECT }),
    });
    const res = await __startReconnect(deps);
    expect(res.status).toBe(503);
    expect(calls.signJwt).toBe(0);
    expect(calls.aspsps).toBe(0);
    expect(calls.auth).toBe(0);
  });

  it("missing EB private key -> 503-shaped, NO signing", async () => {
    const { __startReconnect } = await loadStart();
    const { deps, calls } = makeDeps({
      env: () => ({ appId: FAKE_APP_ID, redirectUrl: WHITELISTED_REDIRECT }),
    });
    const res = await __startReconnect(deps);
    expect(res.status).toBe(503);
    expect(calls.signJwt).toBe(0);
  });

  it("missing EB redirect_url -> 503-shaped, NO signing", async () => {
    const { __startReconnect } = await loadStart();
    const { deps, calls } = makeDeps({
      env: () => ({ appId: FAKE_APP_ID, pem: FAKE_PEM }),
    });
    const res = await __startReconnect(deps);
    expect(res.status).toBe(503);
    expect(calls.signJwt).toBe(0);
  });
});

describe("__startReconnect() — happy path (bank URL + state nonce + whitelisted redirect + key safety)", () => {
  it("returns { status: 200, url } from the injected auth fake", async () => {
    const { __startReconnect } = await loadStart();
    const { deps } = makeDeps();
    const res = await __startReconnect(deps);
    expect(res.status).toBe(200);
    expect(res.url).toBe(BANK_URL);
  });

  it("sets an httpOnly `eb_reconnect_state` cookie whose value equals the injected random state", async () => {
    const { __startReconnect } = await loadStart();
    const { deps, cookieSets } = makeDeps();
    await __startReconnect(deps);
    const nonce = cookieSets.find((c) => c.name === "eb_reconnect_state");
    expect(nonce).toBeDefined();
    expect(nonce?.value).toBe(FAKE_STATE);
    expect(nonce?.opts.httpOnly).toBe(true);
  });

  it("hands the WHITELISTED env redirect_url to auth (never request-derived, Pitfall 4)", async () => {
    const { __startReconnect } = await loadStart();
    const { deps, authBodies } = makeDeps();
    await __startReconnect(deps);
    expect(authBodies).toHaveLength(1);
    expect(authBodies[0].redirect_url).toBe(WHITELISTED_REDIRECT);
    expect(authBodies[0].state).toBe(FAKE_STATE);
  });

  it("NEVER leaks the private key into the returned object", async () => {
    const { __startReconnect } = await loadStart();
    const { deps } = makeDeps();
    const res = await __startReconnect(deps);
    expect(JSON.stringify(res)).not.toContain(FAKE_PEM);
    expect(JSON.stringify(res)).not.toContain("PRIVATE KEY");
  });
});

describe("buildAuthRequest() — the pure /auth body builder", () => {
  it("shapes { access.valid_until, aspsp, psu_type:'personal', state, redirect_url }", async () => {
    const { buildAuthRequest } = await loadStart();
    const body = buildAuthRequest({
      validUntil: "2026-12-15T00:00:00Z",
      redirectUrl: WHITELISTED_REDIRECT,
      aspsp: { name: "Revolut", country: "DE" },
      state: FAKE_STATE,
    });
    expect(body).toEqual({
      access: { valid_until: "2026-12-15T00:00:00Z" },
      aspsp: { name: "Revolut", country: "DE" },
      psu_type: "personal",
      state: FAKE_STATE,
      redirect_url: WHITELISTED_REDIRECT,
    });
  });
});
