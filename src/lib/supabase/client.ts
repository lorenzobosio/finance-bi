import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser (anon/publishable) Supabase client for client components — e.g. the login
 * island's `signInWithOAuth` call. Uses the publishable key value (this project issues
 * `sb_publishable_` keys; see Plan 00-01 SUMMARY) via the locked
 * `NEXT_PUBLIC_SUPABASE_ANON_KEY` var name. RLS + the user's JWT enforce the allowlist.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
