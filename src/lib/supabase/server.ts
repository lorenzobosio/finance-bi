import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Server (cookie-based, user-JWT) Supabase client for Server Components and Route
 * Handlers. Reads run under the user's session so RLS enforces the allowlist — this is
 * the ONLY client the app uses for request-time user reads (never the Drizzle client,
 * which bypasses RLS; RESEARCH Pitfall 1).
 *
 * `setAll` is wrapped in try/catch so it is safe to call from a Server Component, where
 * cookie writes throw; the middleware refreshes the session cookie on the next request.
 */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component — cookie writes are read-only there.
            // The middleware refreshes the session cookie, so this is safe to ignore.
          }
        },
      },
    },
  );
}
