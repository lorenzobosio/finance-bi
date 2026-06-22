// src/lib/ingestion/enable-banking/client.ts
//
// Typed, zod-validated fetch wrapper over the Enable Banking REST API (Pattern 1).
// EVERY response is parsed with the schemas from schemas.ts AT THE BOUNDARY (V5,
// T-01-06): a shape change fails loudly here instead of silently corrupting the
// ledger. 401/403 from any endpoint throws ConsentExpiredError, which drives the
// fail-soft consent-expired path + loud banner in 01-04/01-05 (T-01-12).
//
// SERVER-PLANE ONLY (FND-03): this module lives under src/lib/ingestion and must
// NEVER be imported into the Next app/client bundle. It receives the signed JWT as
// an argument (signing lives in jwt.ts) and never logs the JWT, IBANs, amounts, or
// transaction descriptions — only counts/status (V7, T-01-11).

import {
  AspspsResponseSchema,
  AuthResponseSchema,
  BalancesResponseSchema,
  SessionsResponseSchema,
  TxPageSchema,
  type AspspsResponse,
  type AuthResponse,
  type Balance,
  type RawTx,
  type SessionsResponse,
} from "./schemas";

// Single source of truth for the API host (A7) — never built from untrusted input.
export const EB_BASE = "https://api.enablebanking.com";

/**
 * Thrown when an Enable Banking endpoint returns 401/403 — the consent has lapsed
 * (PSD2 reconnect cadence). Callers (the cron in 01-05) catch this to flag
 * connections.consent_status='expired' and surface the reconnect banner (ING-05),
 * rather than crashing the pull.
 */
export class ConsentExpiredError extends Error {
  constructor(message = "Enable Banking consent expired (401/403)") {
    super(message);
    this.name = "ConsentExpiredError";
  }
}

/**
 * Low-level GET/POST against the EB API. Throws ConsentExpiredError on 401/403 and
 * a generic Error on any other non-2xx. Never logs the JWT or response body PII —
 * the thrown message carries only the method/path/status (the EB error text is not
 * financial PII but is truncated defensively).
 */
async function ebFetch(
  path: string,
  jwt: string,
  init?: RequestInit,
): Promise<unknown> {
  const res = await fetch(`${EB_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (res.status === 401 || res.status === 403) {
    throw new ConsentExpiredError(
      `EB ${init?.method ?? "GET"} ${path} -> ${res.status}`,
    );
  }

  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      `EB ${init?.method ?? "GET"} ${path} -> ${res.status}: ${text.slice(0, 300)}`,
    );
  }

  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new Error(
      `EB ${init?.method ?? "GET"} ${path} -> non-JSON response (${text.length} bytes)`,
    );
  }
}

/**
 * GET /aspsps — discover the bank (Revolut) and its maximum_consent_validity ceiling.
 */
export async function aspsps(
  jwt: string,
  country: string,
  psuType = "personal",
): Promise<AspspsResponse> {
  const qs = new URLSearchParams({ country, psu_type: psuType });
  const raw = await ebFetch(`/aspsps?${qs}`, jwt);
  return AspspsResponseSchema.parse(raw);
}

/**
 * POST /auth — request the bank authorization URL the human opens for SCA.
 * `body` is the EB auth payload (access.valid_until, aspsp, psu_type, state,
 * redirect_url — the redirect_url must be the exact whitelisted constant, T-01-05).
 */
export async function auth(
  jwt: string,
  body: Record<string, unknown>,
): Promise<AuthResponse> {
  const raw = await ebFetch("/auth", jwt, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return AuthResponseSchema.parse(raw);
}

/**
 * POST /sessions — exchange the SCA `code` for the session + accounts + the real
 * consent window (access.valid_until). This is the source of truth for
 * connections.expires_at (ING-05).
 */
export async function sessions(
  jwt: string,
  code: string,
): Promise<SessionsResponse> {
  const raw = await ebFetch("/sessions", jwt, {
    method: "POST",
    body: JSON.stringify({ code }),
  });
  return SessionsResponseSchema.parse(raw);
}

/**
 * GET /accounts/{uid}/transactions — async generator that paginates via
 * continuation_key (the documented EB cursor; offset paging is not offered).
 * Each page is zod-parsed at the boundary; each transaction is yielded one at a
 * time. Throws ConsentExpiredError on 401/403 (via ebFetch).
 */
export async function* fetchTransactions(
  jwt: string,
  uid: string,
  dateFrom: string,
): AsyncGenerator<RawTx> {
  let key: string | null | undefined;
  do {
    const qs = new URLSearchParams({ date_from: dateFrom });
    if (key) qs.set("continuation_key", key);
    const raw = await ebFetch(`/accounts/${uid}/transactions?${qs}`, jwt);
    const page = TxPageSchema.parse(raw);
    for (const t of page.transactions) yield t;
    key = page.continuation_key;
  } while (key);
}

/**
 * GET /accounts/{uid}/balances — the daily balance snapshot source (Phase 2 BI).
 */
export async function balances(jwt: string, uid: string): Promise<Balance[]> {
  const raw = await ebFetch(`/accounts/${uid}/balances`, jwt);
  return BalancesResponseSchema.parse(raw).balances;
}
