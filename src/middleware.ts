import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Routes reachable without an authenticated, allowlisted session (D-17).
// `/eb/callback` is the Enable Banking OAuth landing page (D-07): the browser arrives
// here mid-SCA straight from Revolut/Enable Banking with no app session yet, so it must
// be public for the redirect to land.
const PUBLIC_PATHS = ["/login", "/auth/callback", "/eb/callback"];

/**
 * Session refresh + route protection + allowlist gate (D-13/D-17, FND-01/FND-02c).
 *
 * - Refreshes the session and validates the user with `getUser()` (network-validated,
 *   never the unvalidated storage-only read — RESEARCH Pitfall 3 / T-00-08).
 * - Redirects unauthenticated requests on protected paths to `/login` (307).
 * - Signs out and redirects any authenticated but non-allowlisted user to
 *   `/login?denied=1`.
 *
 * The allowlist is sourced from the `app_allowlist` DB table via the
 * `public.is_email_allowed()` SECURITY DEFINER function — NOT from an env var. This
 * keeps the middleware gate in lockstep with the RLS policies (every table is gated on
 * the same function) and makes it immune to Edge-runtime env-var inlining / per-deploy
 * env drift (which silently denied legitimate users when read from `process.env` in the
 * Edge runtime). Fails CLOSED: any RPC error or a non-true result denies access.
 */
export async function middleware(request: NextRequest) {
  // PUBLIC DEMO DEPLOY (D4-14 / DEMO-02): on the second Vercel project the `NEXT_PUBLIC_DEMO=1`
  // flag is set, so let ALL traffic through BEFORE any session work — there is no user to validate,
  // the allowlist RPC is never called, and no auth redirect fires (the demo is no-login). The anon
  // RLS cap (`is_demo=true`) is the SOLE control on this path; this branch only skips the auth
  // gate, it never elevates anything — the anon-key createServerClient is used everywhere and the
  // elevated server-only write client is never on this path (FND-03; the source-cleanliness
  // co-location guard keeps it out). The REAL deploy is byte-identical because the env is absent
  // there, so this early return is unreachable.
  if (process.env.NEXT_PUBLIC_DEMO === "1") {
    return NextResponse.next({ request });
  }

  // `response` carries refreshed auth cookies back to the browser. Recreated on the
  // happy path; the redirect branches return their own response.
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT: validated user lookup via getUser() — never the unvalidated
  // storage-only session read (RESEARCH Pitfall 3 / T-00-08).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some(
    (p) => path === p || path.startsWith(`${p}/`),
  );

  // Unauthenticated request to a protected path -> login.
  if (!user && !isPublic) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Authenticated -> confirm the email is on the DB allowlist (source of truth).
  // Fails closed: RPC error or a non-true answer signs out + denies (D-13).
  if (user) {
    const { data: allowed, error } = await supabase.rpc("is_email_allowed", {
      check_email: user.email ?? "",
    });
    if (error || allowed !== true) {
      await supabase.auth.signOut();
      return NextResponse.redirect(new URL("/login?denied=1", request.url));
    }
  }

  return response;
}

export const config = {
  // Run on every path except Next internals and the favicon.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
