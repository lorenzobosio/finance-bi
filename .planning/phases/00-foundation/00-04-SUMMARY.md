---
phase: 00-foundation
plan: 04
status: complete
requirements: [FND-03, FND-05]
completed: 2026-06-22
---

# Plan 00-04 Summary — service_role lockdown + CI + deploy

## What was built

- **`service_role` chokepoint** — `src/lib/supabase/service.ts` imports `server-only` (build-time backstop) and is the only constructor of the secret-key client.
- **ESLint guard** — `no-restricted-imports` fails lint if client code imports the service module / references the service key.
- **CI workflow** — `.github/workflows/ci.yml`: pnpm install, lint, build, **bundle grep over `.next/static`** (fails on `SUPABASE_SERVICE_ROLE_KEY`), plus the live RLS/seed assertions (secret-gated).
- **Deployed to Vercel** (Hobby) from the GitHub repo, single production environment.

## Requirements

- **FND-03** ✓ — `service_role` isolated server-side; 3-layer guard (server-only + ESLint + CI bundle-grep). **Verified on the live deployment**: `sb_secret_` appears 0× in the served HTML and all 8 JS chunks at `https://finance-bi-chi.vercel.app`.
- **FND-05** ✓ — deployed and reachable: `https://finance-bi-chi.vercel.app` (root → 307 → `/login`; `/login` → 200). Allowlisted Google login reaches the protected members page in production; non-allowlisted is blocked (user-confirmed, 2026-06-22).

## Verification (live)

- Production reachable; auth gate enforced on the real deployment.
- FND-03 proven against the deployed client bundle (no secret leak).
- GitHub CI on `main` green (lint · build · bundle-grep · vitest · RLS) after secrets were set.

## Notable follow-on work folded in during deploy (beyond the original plan)

- **Next.js 15.5.4 → 15.5.19** — Vercel's security gate blocked the vulnerable version; patched (relevant since the CVEs target middleware, our auth layer). Commit `c542413`.
- **Public repo + supply-chain security** — repo made public with **Dependabot** (npm + actions) and **CodeQL** scanning; git history rewritten to purge PII (emails); `main` branch protection (force-push + deletion blocked). Require-PR upgrade deferred to the Ops Backlog.
- **Env-driven allowlist hardening (Plan 00-05)** — emails removed from all source/history; `app_allowlist` table seeded from env.
- **DB-backed auth gate** — middleware allowlist now reads `app_allowlist` via the `is_email_allowed()` RPC instead of `process.env.ALLOWED_EMAILS`, fixing an Edge-runtime env-inlining issue that denied legitimate users in production. Commit `932a7fa`.

## Deferred / notes

- The Google OAuth client's prod redirect is handled via the Supabase callback (unchanged); the prod Site URL + redirect allowlist were added in Supabase by the user.
- Production deploys auto-trigger on push to `main`.
