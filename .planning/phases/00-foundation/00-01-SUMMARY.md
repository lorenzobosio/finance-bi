---
phase: 00-foundation
plan: 01
status: complete
requirements: [FND-05, FND-06]
completed: 2026-06-21
---

# Plan 00-01 Summary — Foundation Scaffold

## What was built

- **Next.js 15.5.4 app shell** (App Router, TypeScript, Tailwind v4, ESLint, `src/`, `@/*` alias), pnpm (pinned `pnpm@9.15.9` for Node 20 compat), app name `finance-bi`. `pnpm build` green.
- **shadcn/ui** initialized with CSS variables on, base color `neutral` (light mode only — dark block removed per D-06). See deviation note on style preset.
- **Tremor Raw charting deps** — `recharts` 3.8.1 + `clsx`/`tailwind-merge`/`tailwind-variants`; `src/lib/utils.ts` exports `cn` + `cx`. **`@tremor/react` is absent (FND-06 ✓).**
- **Vitest Wave-0 harness** — `vitest.config.ts`, `test/allowlist.test.ts`, `test/middleware.test.ts` (RED until Plan 03 creates their targets), `test/rls.assert.sql` (FND-02/FND-04 checks, run live in Plans 02/04).
- **Secrets hygiene** — `.gitignore` ignores `.env*.local`; only placeholder `.env.example` is committed. `.env.local` written locally with validated Supabase credentials (never committed).

## Supabase provisioning (validated)

- Project `yhladxdieyxwdhsajrne` (eu-central-1). Uses the **new key style**: publishable key fills `NEXT_PUBLIC_SUPABASE_ANON_KEY`, secret key fills `SUPABASE_SERVICE_ROLE_KEY` — both work with `@supabase/ssr` / `@supabase/supabase-js` constructors exactly like legacy anon/service_role. **Plans 02–04 use these var names unchanged.**
- `DATABASE_URL` = Supabase **session-mode pooler (port 5432)** — correct for Drizzle migrations (no `prepare:false` needed). Transaction pooler 6543 is NOT used.
- Validated over HTTPS: publishable key → `/auth/v1/health` & `/auth/v1/settings` = 200; secret key → `/rest/v1/` = 200. Raw Postgres TCP to the pooler `:5432` confirmed reachable (node `net.connect`). Migration in Plan 00-02 will be the full end-to-end DB test.

## Requirements

- **FND-06** ✓ — Tremor Raw (no `@tremor/react`).
- **FND-05** — Vercel deploy is **delivered in Plan 00-04** (Wave 4). This plan establishes the deployable app + provisioning groundwork; the live deploy/verify is 00-04's responsibility.

## Deviations (auto-applied)

1. **pnpm pinned to 9.15.9** — env runs Node 20.20.1; latest pnpm needs Node 22.13. Same tool, compatible version. [Rule 3]
2. **shadcn style preset drift** — shadcn v4.11.0 removed the `--style new-york` / `--base-color slate` flags (beyond even RESEARCH A1/A2). Init produced `style: "radix-nova"` with `baseColor: "neutral"` + `cssVariables: true`. D-04 intent (neutral grey, CSS variables on) is preserved; the old `grep 'new-york' components.json` check is obsolete. [Rule 1]
3. **Removed shadcn's dormant `.dark` block + `@custom-variant dark`** from `globals.css` — light-mode-only per D-06.
4. **Moved `shadcn` to devDependencies** (it's a CLI, not a runtime dep). [Rule 1]

## Deferred (by orchestrator approval — just-in-time before their waves)

- **Google Cloud OAuth client** → set up before **Wave 3** (auth). Tracked in `PROVISIONING.md`.
- **Vercel link + deploy** → done in **Wave 4 / Plan 00-04** (FND-05). Tracked in `PROVISIONING.md`.

## Verification

- `pnpm build` succeeds; `@tremor/react` absent; Vitest runs (Wave-0 tests RED for the right reason); `.env.local` git-ignored & unstaged; Supabase keys + DB reachability validated.

## Notes for downstream plans

- Allowlist emails for the RLS policy + `ALLOWED_EMAILS`: the 2 permitted Google accounts (lowercase). The literal values live ONLY in `.env.local` / the `app_allowlist` table — they were removed from all committed files in Phase-0 hardening (00-05); see that summary.
- Use `DATABASE_URL` (session pooler 5432) for `drizzle-kit` in Plan 00-02.
