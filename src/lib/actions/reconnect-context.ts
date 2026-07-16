"use server";

// getReconnectContext — the server-only context the client /eb/callback page needs to decide whether
// to offer the in-app reconnect confirm card (REM-01, D-02/D-03/D-04). All three signals are
// server-only (session cookie, request cookie, non-public server env), so the client page reads them
// through this thin Server Action rather than inlining them:
//   • sessionEmail — the signed-in owner's email (null when mid-OAuth / not signed in → the byte-
//     identical CLI display-code path stays the fallback, D-02).
//   • isDemo       — the public demo build must show NO reconnect surface (D-04).
//   • envConfigured — whether the EB server env is present; absent → the calm muted degrade card
//     (never an error-red state, D-03), matching exactly the 503 gate completeReconnect enforces.
//
// Read-only: no write, no secret ever crosses the boundary (only a boolean + the already-known email).

import { isDemoForReads } from "@/lib/demo/mode";
import { createClient } from "@/lib/supabase/server";

export interface ReconnectContext {
  sessionEmail: string | null;
  isDemo: boolean;
  envConfigured: boolean;
}

export async function getReconnectContext(): Promise<ReconnectContext> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isDemo = await isDemoForReads();
  // Mirror the exact gate completeReconnect applies (appId + PEM) so the page's "configured" verdict
  // agrees with the action — never a NEXT_PUBLIC_* prefix (server env only).
  const envConfigured = Boolean(
    process.env.ENABLE_BANKING_APP_ID && process.env.ENABLE_BANKING_PRIVATE_KEY,
  );
  return { sessionEmail: user?.email ?? null, isDemo, envConfigured };
}
