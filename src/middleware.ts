import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

import { isAllowed } from "@/lib/auth/allowlist";

// Routes reachable without an authenticated, allowlisted session (D-17).
const PUBLIC_PATHS = ["/login", "/auth/callback"];

/**
 * Session refresh + route protection + allowlist gate (D-13/D-17, FND-01/FND-02c).
 *
 * - Refreshes the session and validates the user with `getUser()` (network-validated,
 *   never the unvalidated storage-only read — RESEARCH Pitfall 3 / T-00-08).
 * - Redirects unauthenticated requests on protected paths to `/login` (307).
 * - Signs out and redirects any authenticated but non-allowlisted user to
 *   `/login?denied=1` — defense-in-depth with the Plan-02 RLS zero-rows policy (T-00-09).
 */
export async function middleware(request: NextRequest) {
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

  // Authenticated but not on the allowlist -> sign out + deny (D-13).
  if (user && !isAllowed(user.email)) {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/login?denied=1", request.url));
  }

  return response;
}

export const config = {
  // Run on every path except Next internals and the favicon.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
