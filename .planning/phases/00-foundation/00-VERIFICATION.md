---
phase: 00-foundation
verified: 2026-06-22T00:00:00Z
status: passed
score: 6/6 must-haves verified
behavior_unverified: 0
overrides_applied: 0
re_verification: null
---

# Phase 0: Foundation Verification Report

**Phase Goal:** A secure, deployed app shell exists with auth, RLS, the service_role boundary, and the dimensional schema in place — so all later data lands behind login and is month-comparable from day one.
**Verified:** 2026-06-22
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| SC1 | Scaffold (Next.js 15 + Tailwind v4 + Tremor Raw + @supabase/ssr) deployed on Vercel; Tremor Raw charting wiring in place (recharts + cx utility, no @tremor/react) | VERIFIED | Live at https://finance-bi-chi.vercel.app; `recharts@3.8.1` in package.json; `@tremor/react` absent; `src/lib/utils.ts` exports `cn`/`cx`; CI green on main |
| SC2 | Allowlisted Google email signs in; non-allowlisted is rejected; every app route requires authentication | VERIFIED | Middleware uses `getUser()` + `is_email_allowed` DB RPC; `/login?denied=1` redirect on rejection; PUBLIC_PATHS = ["/login", "/auth/callback"]; user-confirmed in production |
| SC3 | RLS enabled on every table enforcing the 2-email allowlist (unauthorized identity SELECTs zero rows) | VERIFIED | `0001_rls_policies.sql` enables RLS on all 14 tables; SECURITY DEFINER `is_email_allowed()` function; `rls.assert.mjs` proves zero rows for denied email, dynamic table-driven allowlist; live DB confirmed: 4383 rows for allowlisted / 0 for non-allowlisted |
| SC4 | CI fails build if `service_role` appears in client bundle; passes when isolated to server-only code | VERIFIED | `ci.yml` bundle-grep step fails if `SUPABASE_SERVICE_ROLE_KEY` name or value found in `.next/static/**/*.js`; `import "server-only"` in `service.ts`; ESLint `no-restricted-imports` + `no-restricted-syntax` guard; live bundle confirmed `sb_secret_` 0x in 8 JS chunks |
| SC5 | Base Postgres schema exists with seeded calendar dimension (period_key=YYYYMM) covering past and future months | VERIFIED | `schema.ts` defines 14 tables; `0002_seed.sql` seeds dim_calendar 2024-01-01..2035-12-31 (4383 rows, 144 period_keys 202401–203512); live DB confirmed |

**Score:** 5/5 ROADMAP SCs verified. All 6 FND requirements also individually verified (see below).

---

### FND Requirements Detail

| Requirement | Description | Status | Evidence |
|-------------|-------------|--------|----------|
| FND-01 | User can sign in with Google, restricted to 2-email allowlist | PASS | `middleware.ts` calls `is_email_allowed` DB RPC; signs out non-allowlisted; `/auth/callback/route.ts` handles PKCE exchange; login page shows OAuth button; user-confirmed in production — allowlisted email reaches members page, non-allowlisted → `/login?denied=1` |
| FND-02 | Every table has RLS enabled enforcing the allowlist; all app routes require authentication | PASS | `0001_rls_policies.sql` enables RLS on all 14 tables (`app_allowlist` included); SECURITY DEFINER `public.is_email_allowed()` as the single policy oracle; middleware gates all routes except `/login` and `/auth/callback`; `rls.assert.mjs` (pnpm test:rls) proves RLS on every table and zero-rows for denied identities; CI runs it on every push |
| FND-03 | `service_role` key isolated to server-only code; never ships in client bundle (CI-asserted) | PASS | `src/lib/supabase/service.ts` — `import "server-only"` on line 1; `SUPABASE_SERVICE_ROLE_KEY` (non-NEXT_PUBLIC); ESLint `no-restricted-imports` blocks import of `@/lib/supabase/service` from client files; `no-restricted-syntax` blocks `SUPABASE_SERVICE_ROLE_KEY` env access in TSX; CI `ci.yml` bundle-grep step (name + value grep over `.next/static`) — live confirmed `sb_secret_` 0x in 8 JS chunks |
| FND-04 | Base Postgres schema with seeded calendar dimension supporting MoM/YoY | PASS | `src/lib/db/schema.ts` defines 14 tables (members, accounts, transactions, categories, rules, budgets, investment_contributions, goals, milestones, balances, insights, connections, dim_calendar, app_allowlist); `drizzle/0002_seed.sql` (4448 lines): members Lorenzo+Fernanda (display names, no emails), category taxonomy (3 groups + 10 children), goal EUR 100k + 5 milestones, dim_calendar 2024-01-01..2035-12-31 (4383 rows, 144 period_keys); live DB confirmed by `rls.assert.mjs` assertions |
| FND-05 | App scaffold deployed and reachable on Vercel | PASS | Live at https://finance-bi-chi.vercel.app — root → HTTP 307 → /login; /login → HTTP 200; GitHub Actions CI green on main; CI workflow in `.github/workflows/ci.yml` runs lint/build/bundle-grep/test/rls on every push; Next.js 15.5.19 (security patch applied 15.5.4→15.5.19) |
| FND-06 | Charting adopts Tremor Raw (Tailwind v4 + Recharts), not the frozen @tremor/react package | PASS | `package.json`: `"recharts": "^3.8.1"` present; `@tremor/react` absent (confirmed by grep); `clsx`, `tailwind-merge`, `tailwind-variants` present; `src/lib/utils.ts` exports `cn` + `cx`; note: actual chart components arrive in Phase 2+ (D-05 explicit) — this phase establishes the dependency wiring so Tremor Raw components can be copy-pasted when needed |

---

### Required Artifacts

| Artifact | Purpose | Status | Notes |
|----------|---------|--------|-------|
| `src/middleware.ts` | Route protection + allowlist gate | VERIFIED | `getUser()` + `is_email_allowed` RPC; fails closed on error; PUBLIC_PATHS gated |
| `src/lib/supabase/client.ts` | Browser anon client | VERIFIED | `createBrowserClient` with anon key; RLS enforces access |
| `src/lib/supabase/server.ts` | Server cookie-based client | VERIFIED | `createServerClient` with anon key; user JWT drives RLS |
| `src/lib/supabase/service.ts` | service_role chokepoint | VERIFIED | `import "server-only"` L1; `SUPABASE_SERVICE_ROLE_KEY` non-public; `{persistSession:false}` |
| `src/lib/db/schema.ts` | Full v1 dimensional schema | VERIFIED | 14 tables, 3 enums, correct constraints (`dedupe_hash` UNIQUE, money as `numeric(14,2)`) |
| `drizzle/0001_rls_policies.sql` | RLS on all 14 tables + SECURITY DEFINER fn | VERIFIED | 14 `alter table ... enable row level security` + 14 `create policy "allowlist_all"` + `is_email_allowed()` |
| `drizzle/0002_seed.sql` | Members + taxonomy + goals + dim_calendar | VERIFIED | 4448 lines; 4383 calendar rows 202401..203512; no email literals; idempotent |
| `.github/workflows/ci.yml` | lint/build/bundle-grep/test/rls CI | VERIFIED | FND-03 bundle-grep step; name + value grep; pnpm test + pnpm test:rls; DATABASE_URL required |
| `scripts/seed-allowlist.mjs` | Deploy-time allowlist seeder (no email in git) | VERIFIED | Reads `ALLOWED_EMAILS` env; upserts into `app_allowlist`; never prints email values; fails if empty |
| `src/app/(auth)/login/page.tsx` | Google OAuth sign-in UI | VERIFIED | `signInWithOAuth({provider:"google"})`; `/auth/callback` redirectTo; `?denied=1` alert |
| `src/app/auth/callback/route.ts` | PKCE exchange | VERIFIED | `exchangeCodeForSession`; open-redirect guard (`safeNext`); falls back to `/login?error=auth` |
| `src/app/(protected)/page.tsx` | RLS-bound protected page | VERIFIED | `createClient()` server client; `from("members").select()`; renders rows for allowlisted user |
| `test/rls.assert.mjs` | Live DB RLS assertions | VERIFIED | 10 assertions: RLS-on-all-tables, is_email_allowed SECURITY DEFINER, app_allowlist seeded, zero-rows dynamic test, calendar bounds, member count, no email PII |
| `src/lib/auth/allowlist.ts` | Env-var allowlist parser | PRESENT | Exists and is used in unit tests; NOT the live enforcement path (middleware uses DB RPC since Wave-5 hardening); kept as utility |

---

### Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| `middleware.ts` | `app_allowlist` DB table | `supabase.rpc("is_email_allowed", ...)` | VERIFIED — code confirmed; live confirmed |
| `service.ts` | server-only boundary | `import "server-only"` + ESLint guard + CI bundle-grep | VERIFIED — three-layer guard confirmed in code and CI |
| `0001_rls_policies.sql` | `public.is_email_allowed()` | every `allowlist_all` policy USING clause | VERIFIED — 14 policies all use the same function |
| `0002_seed.sql` | `dim_calendar` | 4383-row INSERT (202401..203512) | VERIFIED — file confirmed; live DB confirmed |
| `ci.yml` | `.next/static/**/*.js` | `grep -rIl SUPABASE_SERVICE_ROLE_KEY` + `grep -rIlF $value` | VERIFIED — CI step present; live confirmed 0x occurrences |
| `scripts/seed-allowlist.mjs` | `app_allowlist` | `insert into public.app_allowlist` | VERIFIED — script confirmed; live DB has 2 rows (count only) |

---

### Behavioral Spot-Checks

| Behavior | Evidence Source | Status |
|----------|----------------|--------|
| Root → 307 → /login (unauthenticated) | Live HTTP check (execution evidence) | PASS |
| /login → 200 | Live HTTP check (execution evidence) | PASS |
| Allowlisted email → members page with 4383 RLS rows | User-confirmed in production (2026-06-22) | PASS |
| Non-allowlisted email → signed out → /login?denied=1 | User-confirmed in production (2026-06-22) | PASS |
| service_role key/name absent from all JS chunks | Live bundle grep: `sb_secret_` 0x in 8 chunks | PASS |
| RLS enabled on all 14 tables, zero rows for denied identity | `rls.assert.mjs` live assertions (CI-run) | PASS |
| dim_calendar 4383 rows, 144 periods 202401..203512 | `rls.assert.mjs` FND-04b assertions (CI-run) | PASS |
| Members 2 rows, 0 email literals | `rls.assert.mjs` FND-04c assertions (CI-run) | PASS |

---

### Requirements Coverage

| Requirement | Plans | Status | Evidence |
|-------------|-------|--------|----------|
| FND-01 | 00-03-PLAN | SATISFIED | Middleware + login + callback + middleware.test.ts |
| FND-02 | 00-02-PLAN, 00-03-PLAN, 00-05 | SATISFIED | RLS SQL + middleware routing + rls.assert.mjs + live DB |
| FND-03 | 00-04-PLAN | SATISFIED | service.ts + ESLint + CI bundle-grep + live bundle |
| FND-04 | 00-02-PLAN | SATISFIED | schema.ts + 0002_seed.sql + live DB |
| FND-05 | 00-04-PLAN | SATISFIED | Live Vercel deployment + CI green |
| FND-06 | 00-01-PLAN | SATISFIED | recharts in package.json, @tremor/react absent |

---

### Anti-Patterns Found

No blockers. The following are informational only:

| File | Pattern | Severity | Assessment |
|------|---------|----------|------------|
| `src/lib/auth/allowlist.ts` | `isAllowed()` not called by middleware (superseded by DB RPC in Wave 5 hardening) | INFO | Not dead code — used in `allowlist.test.ts` unit tests as a standalone utility; correctly not wired to middleware after hardening |
| `src/app/(protected)/page.tsx` | Single-page scaffold; no navigation | INFO | Phase 0 intent is an app shell, not a full UI — correct state |

No `TBD`, `FIXME`, or `XXX` markers found in phase-modified files.

---

### Human Verification Required

None. All must-haves verified with code-level evidence plus live confirmed behavior provided in the verification context.

---

### Deferred Items

None. All SC and FND-01..06 requirements are verified. Phase 2+ items (chart components, BI views) are correctly not present and are not gaps for Phase 0.

**Note on SC1 "charts render via Tremor Raw":** The ROADMAP phrasing is about the stack wiring being in place (D-05 defers actual chart components to Phase 2+; D-19 says "Tremor Raw wiring in place"). The Tremor Raw dependency set (recharts, clsx, tailwind-merge, tailwind-variants, cn/cx utility) is confirmed present. No chart components are expected in Phase 0 — they are a Phase 2+ deliverable.

---

### Gaps Summary

No gaps. All 6 FND requirements pass. All 5 ROADMAP Success Criteria are verified. The foundation phase goal is achieved: a secure, deployed app shell exists with auth, RLS, the service_role boundary, and the dimensional schema in place.

---

_Verified: 2026-06-22_
_Verifier: Claude (gsd-verifier)_
