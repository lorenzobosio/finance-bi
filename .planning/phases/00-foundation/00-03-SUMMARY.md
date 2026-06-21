---
phase: 00-foundation
plan: 03
status: complete
requirements: [FND-01, FND-02]
completed: 2026-06-22
---

# Plan 00-03 Summary — Authentication Gate

## What was built

- **`@supabase/ssr` clients** — browser (`src/lib/supabase/client.ts`) and cookie-based server (`src/lib/supabase/server.ts`); `@supabase/supabase-js` pinned 2.108.2 (avoids the v2.91.0 deferred-cookie caveat).
- **Allowlist** — `src/lib/auth/allowlist.ts` `isAllowed()` parses `ALLOWED_EMAILS` (lowercase, comma-separated); matches the 2 emails hardcoded in the Plan-02 RLS policy exactly.
- **Middleware** (`src/middleware.ts`) — uses `getUser()` (network-validated, not `getSession()`); redirects unauthenticated → `/login`; signs out + bounces non-allowlisted → `/login?denied=1`; protects all routes except `/login` and `/auth/callback`.
- **`/auth/callback`** route handler — PKCE `exchangeCodeForSession`.
- **Login page** (`src/app/(auth)/login/page.tsx`) — "Sign in with Google" via `signInWithOAuth`.
- **Protected page** (`src/app/(protected)/page.tsx`) — one real RLS-bound read of `members` through `@supabase/ssr` (NOT the Drizzle client — RLS applies).

## Verification

- **Automated (all green):** `pnpm vitest run` 7/7 (allowlist 5/5, middleware 2/2), `tsc --noEmit` clean, `pnpm lint` clean, `pnpm build` green. Middleware uses `getUser()` (grep-confirmed, no `getSession`); protected page has no `@/lib/db` import.
- **Manual end-to-end (user-confirmed, 2026-06-22):**
  - Unauthenticated visit to `/` → redirected to `/login` ✓
  - Allowlisted Google login (one of the 2 permitted accounts) → protected page showing Household members (Lorenzo + Fernanda) — gate + RLS proven end-to-end ✓
  - Non-allowlisted Google account → signed out, bounced to `/login?denied=1`, never sees members ✓

## Requirements

- **FND-01** ✓ — Google login restricted to the 2-email allowlist; verified end-to-end.
- **FND-02** ✓ — app-layer half: RLS-enforced reads via `@supabase/ssr` + middleware route protection + non-allowlisted sign-out (the DB-layer RLS half was verified in Plan 00-02).

## Deviations (auto-applied)

1. Added `.claude/**`, `.planning/**`, `drizzle/**` to ESLint ignores (keep lint focused on app source). [Rule 1]
2. Fixed a pre-existing `: any` → `AnyPgColumn` typing in `schema.ts` (self-FK). [Rule 3]
3. Removed the boilerplate `src/app/page.tsx` (replaced by the protected route group). [Rule 1]

## Google OAuth (provisioned by user)

- Google Cloud OAuth Web client created; redirect URI = the Supabase callback. Consent screen in Testing mode with the 2 emails as test users.
- Supabase: Google provider enabled (client id/secret stored in Supabase, NOT in the repo); Site URL `http://localhost:3000`, redirect URL `http://localhost:3000/auth/callback`.

## Notes for downstream

- Vercel deploy (FND-05) is Plan 00-04; the Google OAuth client will also need the Vercel production URL added to its redirect URIs and to Supabase's redirect allowlist at that point.
