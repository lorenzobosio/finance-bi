"use server";

// eb-reconnect EXCHANGE Server Action — the `/eb/callback` consent-refresh write plane (REM-01,
// D-02/D-04/D-08). Closes the in-app reconnect loop the POST /api/eb/reconnect start route opens:
// the browser returns from Revolut with `?code&?state`, this action verifies the CSRF nonce,
// exchanges the code for the fresh session + REAL consent window, and UPDATEs the latest
// `connections` row so the reminder banner clears immediately.
//
// FILE-level `'use server'` (exports ONLY async functions); the zod schema lives in the sibling
// `eb-reconnect.schema.ts`. LOCKED write-plane discipline (mirrors set-thresholds.ts /
// recurring-series.ts): zod `.parse` BEFORE any write; the `@supabase/ssr` server client (anon key +
// the owner JWT, so the `allowlist_all` RLS authorizes) is the ONLY client — this module NEVER
// reaches the elevated key, the direct DB connection string, or a raw SQL driver (RLS under the
// owner JWT is the authorization wall, T-14-03). The UPDATE carries ONLY the three explicitly-mapped
// columns (mass-assignment guard). CONSENT-ONLY refresh: no account re-enumeration (OQ2).

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import { EbReconnectSchema } from "@/lib/actions/eb-reconnect.schema";
import { isDemoForReads } from "@/lib/demo/mode";
import { EB_RECONNECT_STATE_COOKIE } from "@/lib/eb/reconnect-start";
import { sessions } from "@/lib/ingestion/enable-banking/client";
import { signEbJwt } from "@/lib/ingestion/enable-banking/jwt";
import { createClient } from "@/lib/supabase/server";

/** The discriminated result the /eb/callback card renders (never a PII/row body). */
interface ExchangeResult {
  status: number;
  ok?: boolean;
  reason?: string;
}

/**
 * The narrow slice of the `@supabase/ssr` client this write plane touches: read the latest
 * `connections` row id, then a scoped `.update().eq()`. Typed structurally so a test fake and the
 * real client both satisfy it without importing the full SupabaseClient generics.
 */
interface ReconnectWriteClient {
  from(table: string): {
    select(cols: string): {
      order(
        col: string,
        opts: { ascending: boolean },
      ): {
        limit(n: number): {
          maybeSingle(): Promise<{ data: { id: string } | null; error: unknown }>;
        };
      };
    };
    update(payload: Record<string, unknown>): {
      eq(col: string, val: unknown): Promise<{ data: unknown; error: unknown }>;
    };
  };
}

/** Every side-effecting seam injected so the core runs DB/network-free under the unit test. */
interface ExchangeDeps {
  getClient: () => Promise<ReconnectWriteClient>;
  isDemo: () => Promise<boolean>;
  cookieStore: () => Promise<{
    get: (name: string) => { value: string } | undefined;
    delete?: (name: string) => void;
  }>;
  env: () => { appId?: string; pem?: string; redirectUrl?: string };
  signJwt: (appId: string, pem: string) => Promise<string>;
  sessions: (jwt: string, code: string) => Promise<{ session_id: string; access: { valid_until: string } }>;
  revalidate: () => void;
}

/**
 * __completeReconnect — the testable EXCHANGE core. Order is security-load-bearing:
 *   1. `EbReconnectSchema.parse(raw)` FIRST — a malformed payload THROWS, nothing is written; unknown
 *      keys are stripped (mass-assignment guard, first half).
 *   2. demo -> 403 (a demo caller can never refresh the real consent, D-04).
 *   3. EB env absent -> 503 calm degrade (D-03) — NO signing / sessions / write.
 *   4. CSRF: the httpOnly `eb_reconnect_state` cookie MUST equal the parsed `state`, else an
 *      exchange-error result with NO `sessions()` call and NO write (D-04).
 *   5. sign the EB JWT, `sessions(code)` for the fresh session + REAL `access.valid_until`.
 *   6. UPDATE the latest `connections` row (OQ1) under the owner JWT with ONLY the three
 *      explicitly-mapped columns { session_id, expires_at, consent_status:'active' } (guard, 2nd half;
 *      `expires_at` is the RESPONSE window, never a hard-coded 90/180).
 *   7. delete the nonce cookie, `revalidate()` so the banner clears (Pitfall 5).
 */
export async function __completeReconnect(
  raw: unknown,
  deps: ExchangeDeps,
): Promise<ExchangeResult> {
  // 1. Validate before ANY effect — throws on a malformed { code, state } (nothing written).
  const input = EbReconnectSchema.parse(raw);

  // 2. Demo callers can never refresh the real consent.
  if (await deps.isDemo()) return { status: 403, ok: false, reason: "forbidden" };

  // 3. Env-gated calm degrade — the CLI `pnpm eb:connect` stays the fallback.
  const { appId, pem } = deps.env();
  if (!appId || !pem) return { status: 503, ok: false, reason: "not configured" };

  // 4. CSRF: the server-set httpOnly nonce must match the state Revolut echoed back.
  const store = await deps.cookieStore();
  const nonce = store.get(EB_RECONNECT_STATE_COOKIE)?.value;
  if (!nonce || nonce !== input.state) {
    return { status: 403, ok: false, reason: "state mismatch" };
  }

  // 5. Exchange the code for the fresh session + the REAL consent window.
  const jwt = await deps.signJwt(appId, pem);
  const session = await deps.sessions(jwt, input.code);

  // 6. UPDATE the latest connections row under the owner JWT (RLS authorizes) — three mapped columns.
  const client = await deps.getClient();
  const { data: latest } = await client
    .from("connections")
    .select("id")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!latest) return { status: 500, ok: false, reason: "no connection" };

  await client
    .from("connections")
    .update({
      session_id: session.session_id,
      expires_at: session.access.valid_until,
      consent_status: "active",
    })
    .eq("id", latest.id);

  // 7. Clear the one-time nonce + revalidate so the reminder banner clears immediately.
  store.delete?.(EB_RECONNECT_STATE_COOKIE);
  deps.revalidate();

  return { status: 200, ok: true };
}

/**
 * completeReconnect — the public Server Action the `/eb/callback` card invokes. Wires the REAL deps:
 * the RLS-authorized `@supabase/ssr` client, `isDemoForReads`, the request cookie store, the EB env
 * (the PEM string, never a file path on Vercel), `signEbJwt`, the audited `sessions` exchange, and
 * `revalidatePath('/', 'layout')` (clears the banner across the shell). The elevated key is never used.
 */
export async function completeReconnect(raw: unknown): Promise<ExchangeResult> {
  return __completeReconnect(raw, {
    getClient: async () => (await createClient()) as unknown as ReconnectWriteClient,
    isDemo: isDemoForReads,
    cookieStore: () => cookies(),
    env: () => ({
      appId: process.env.ENABLE_BANKING_APP_ID,
      pem: process.env.ENABLE_BANKING_PRIVATE_KEY,
    }),
    signJwt: signEbJwt,
    sessions,
    revalidate: () => revalidatePath("/", "layout"),
  });
}
