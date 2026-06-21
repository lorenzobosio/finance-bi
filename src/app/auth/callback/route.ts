import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * PKCE OAuth callback (FND-01). Google redirects here with `?code`; we exchange it for
 * a cookie session, then send the user to the app root. The middleware then enforces
 * the allowlist on that next request (block/sign-out if not allowlisted).
 *
 * Cookie-write timing (RESEARCH Pitfall 5): the v2.91.0 deferred-SIGNED_IN bug does NOT
 * apply here — this project pins `@supabase/supabase-js` 2.108.2, where the fix is in
 * and `await exchangeCodeForSession` persists the session cookie before we respond.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // `next` lets the OAuth initiator request a specific post-login destination; defaults
  // to the app root. Only same-origin relative paths are honored (no open redirect).
  const next = searchParams.get("next") ?? "/";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${safeNext}`);
    }
  }

  // No code, or exchange failed -> back to login with an error flag.
  return NextResponse.redirect(`${origin}/login?error=auth`);
}
