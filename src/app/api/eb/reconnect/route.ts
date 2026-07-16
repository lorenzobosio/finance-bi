import { cookies } from "next/headers";

import { isDemoForReads } from "@/lib/demo/mode";
import { aspsps, auth } from "@/lib/ingestion/enable-banking/client";
import { signEbJwt } from "@/lib/ingestion/enable-banking/jwt";
import { __startReconnect, type StartDeps } from "@/lib/eb/reconnect-start";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/eb/reconnect — the OWNER-ONLY in-app reconnect START (REM-01, D-02/D-03/D-04).
 *
 * Fernanda opens this to renew the bank consent without the CLI: it signs the EB JWT SERVER-SIDE,
 * discovers Revolut, POSTs /auth, sets an httpOnly `eb_reconnect_state` CSRF nonce cookie, and
 * returns the bank authorization URL the browser then visits. The `/eb/callback` exchange
 * (completeReconnect) closes the loop.
 *
 * GATE LADDER (delegated to __startReconnect): any EB env value absent -> a calm 503 "not configured"
 * (D-03 — the CLI `pnpm eb:connect` stays the fallback, the app never breaks); no session -> 401;
 * a demo session (`isDemoForReads()`) -> 403 (a demo/anon caller can NEVER start a real reconnect).
 *
 * NOT IN PUBLIC_PATHS (T-14-04): unlike /eb/callback, this start route is deliberately absent from
 * middleware PUBLIC_PATHS, so an unauthenticated real request is redirected to /login before it lands.
 *
 * KEY SAFETY (T-14-02): the RSA private key is read from env HERE and passed into the core closure —
 * it is never in a response body or log. Errors return a BARE status code, never a row/query (V7).
 *
 * `force-dynamic` — this signs a fresh JWT + sets a per-request nonce; it is never statically optimized.
 */
export const dynamic = "force-dynamic";

export async function POST(): Promise<Response> {
  const supabase = await createClient();

  const deps: StartDeps = {
    getUser: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      return user ? { id: user.id } : null;
    },
    isDemo: isDemoForReads,
    // The PEM is the env string (matching the ingest.yml GitHub Actions secret shape) — NEVER a file
    // path on Vercel, NEVER a NEXT_PUBLIC_* client-public prefix (FND-03).
    env: () => ({
      appId: process.env.ENABLE_BANKING_APP_ID,
      pem: process.env.ENABLE_BANKING_PRIVATE_KEY,
      redirectUrl: process.env.ENABLE_BANKING_REDIRECT_URL,
    }),
    cookieStore: () => cookies(),
    signJwt: signEbJwt,
    aspsps,
    auth,
    randomState: () => crypto.randomUUID(),
  };

  try {
    const result = await __startReconnect(deps);
    if (result.status === 200 && result.url) {
      return Response.json({ url: result.url }, { status: 200 });
    }
    const text =
      result.status === 401
        ? "Unauthorized"
        : result.status === 403
          ? "Forbidden"
          : "Service Unavailable";
    return new Response(text, { status: result.status });
  } catch {
    // Never leak the key, a row, or the EB error body (V7) — a bare status code only.
    return new Response("Reconnect failed", { status: 500 });
  }
}
