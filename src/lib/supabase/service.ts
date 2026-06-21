import "server-only"; // build error if this module is imported into any client bundle
import { createClient } from "@supabase/supabase-js";

/**
 * The SINGLE chokepoint that constructs the elevated `service_role` Supabase client
 * (RESEARCH Pattern 4 — FND-03, D-16). The `import "server-only"` on the first line makes
 * Next fail the build if this module is ever pulled into a client/browser bundle; the
 * ESLint `no-restricted-imports` guard in `eslint.config.mjs` blocks client code from
 * importing it in the first place; and the CI bundle grep over `.next/static` is the
 * authoritative assertion that the key name/value never leaves the server tier.
 *
 * The `service_role` key BYPASSES RLS, so this client must only ever run server-side:
 * Route Handlers (audited) and, from Phase 1, the GitHub Actions ingestion writer. The
 * app does NOT need it at request time yet (every user-facing read goes through
 * `@supabase/ssr` under the user's JWT so RLS applies) — but the chokepoint + guards must
 * exist now so Phase 1 ingestion has exactly one secure entry point.
 *
 * Uses the project's new-style Supabase keys (publishable/secret) under the locked env
 * var NAMES `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (Plan 00-01 SUMMARY).
 * The secret key is NON-public on purpose — it is never `NEXT_PUBLIC_*`, so Next does not
 * inline it into the browser bundle.
 */
export const createServiceClient = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
