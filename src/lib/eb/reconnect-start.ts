// Reconnect START core (REM-01, D-02/D-03/D-04) — the in-app equivalent of `pnpm eb:connect`'s
// [1/5]→[3/5] steps, so Fernanda can renew the bank consent without the CLI.
//
// SERVER-PLANE ONLY (FND-03): the EB private key (PEM) is read from env in the Route Handler and
// passed in here as an argument; it lives ONLY inside the injected `deps` closure — never returned,
// never logged. This module is orchestration over the already-audited signEbJwt / aspsps / auth
// primitives (D-08: no new dependency, no new table).
//
// PURITY / TESTABILITY: `buildAuthRequest` is a pure body builder; `__startReconnect(deps)` runs the
// gate ladder auth/network/DB-free because every seam (getUser / isDemo / env / cookieStore / signJwt
// / aspsps / auth / randomState) is INJECTED. The production Route Handler wires the REAL deps.

/** The httpOnly CSRF nonce cookie the START sets and the EXCHANGE (eb-reconnect.ts) verifies (D-04). */
export const EB_RECONNECT_STATE_COOKIE = "eb_reconnect_state";

/** The PSD2-safe consent window used when the ASPSP does not advertise a ceiling (matches the CLI). */
const DEFAULT_CONSENT_SECONDS = 90 * 24 * 3600;

/** The discriminated result the Route Handler maps to a bare-status Response (never a PII body, V7). */
export interface StartResult {
  status: number;
  url?: string;
  reason?: string;
}

/** Every side-effecting seam injected so the core is auth/network/DB-free under test. */
export interface StartDeps {
  getUser: () => Promise<{ id: string } | null>;
  isDemo: () => Promise<boolean>;
  env: () => { appId?: string; pem?: string; redirectUrl?: string };
  cookieStore: () => Promise<{
    set: (name: string, value: string, opts?: Record<string, unknown>) => void;
  }>;
  signJwt: (appId: string, pem: string) => Promise<string>;
  aspsps: (
    jwt: string,
    country: string,
  ) => Promise<{
    aspsps: Array<{ name: string; country: string; maximum_consent_validity?: number | null }>;
  }>;
  auth: (jwt: string, body: Record<string, unknown>) => Promise<{ url: string }>;
  randomState: () => string;
}

/**
 * buildAuthRequest — the pure POST /auth body (mirrors scripts/eb-connect.ts main()). The
 * `redirect_url` is the whitelisted env constant handed in by the caller, NEVER request-derived
 * (Pitfall 4 / T-14-05 open-redirect guard); the `state` is the random CSRF nonce.
 */
export function buildAuthRequest(input: {
  validUntil: string;
  redirectUrl: string;
  aspsp: { name: string; country: string };
  state: string;
}): Record<string, unknown> {
  return {
    access: { valid_until: input.validUntil },
    aspsp: input.aspsp,
    psu_type: "personal",
    state: input.state,
    redirect_url: input.redirectUrl,
  };
}

/**
 * __startReconnect — the testable START core. The gate ladder, in order:
 *   • any EB env value absent -> 503 "not configured" (env-gated calm degrade, D-03) — NO signing/network.
 *   • no session             -> 401 (owner-only; the route is NOT in PUBLIC_PATHS either) — NO signing.
 *   • demo session           -> 403 (a demo/anon caller can NEVER start a real reconnect, D-04).
 * Then: mint the random state nonce, sign the 1h EB JWT server-side, discover Revolut + its
 * maximum_consent_validity ceiling, POST /auth for the bank URL, and set the httpOnly state cookie.
 * The PEM stays inside this closure — it is never placed on the returned object (key-safety test).
 */
export async function __startReconnect(deps: StartDeps): Promise<StartResult> {
  const { appId, pem, redirectUrl } = deps.env();
  if (!appId || !pem || !redirectUrl) {
    return { status: 503, reason: "not configured" };
  }

  const user = await deps.getUser();
  if (!user) return { status: 401, reason: "unauthorized" };

  if (await deps.isDemo()) return { status: 403, reason: "forbidden" };

  const state = deps.randomState();
  const jwt = await deps.signJwt(appId, pem);

  const discovery = await deps.aspsps(jwt, "DE");
  const revolut = discovery.aspsps.find((a) => a.name.toLowerCase().includes("revolut"));
  if (!revolut) return { status: 503, reason: "bank unavailable" };

  const ceilingSeconds = revolut.maximum_consent_validity ?? DEFAULT_CONSENT_SECONDS;
  const validUntil = new Date(Date.now() + ceilingSeconds * 1000).toISOString();

  const { url } = await deps.auth(
    jwt,
    buildAuthRequest({
      validUntil,
      redirectUrl,
      aspsp: { name: revolut.name, country: revolut.country },
      state,
    }),
  );

  const store = await deps.cookieStore();
  store.set(EB_RECONNECT_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 900,
    // Never ride a plaintext request in production (audit); left off in dev so localhost http works.
    secure: process.env.NODE_ENV === "production",
  });

  return { status: 200, url };
}
