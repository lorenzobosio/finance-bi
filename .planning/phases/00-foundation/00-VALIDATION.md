---
phase: 0
slug: foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-21
---

# Phase 0 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from `00-RESEARCH.md` § Validation Architecture. Task IDs are filled in once PLAN.md files exist.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | None present yet (greenfield) — **Wave 0 installs**. Vitest for unit/integration + SQL assertions via `psql`/`postgres-js`; optional Playwright for the one auth-gate e2e |
| **Config file** | none — create `vitest.config.ts` in Wave 0 |
| **Quick run command** | `pnpm vitest run` |
| **Full suite command** | `pnpm lint && pnpm build && pnpm vitest run && pnpm test:rls` |
| **Estimated runtime** | ~30–60 seconds (excludes the manual Google-login walkthrough) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm lint && pnpm vitest run`
- **After every plan wave:** Run the full suite incl. `pnpm build` + bundle grep + SQL/RLS assertions
- **Before `/gsd-verify-work`:** Full suite green + the manual allowlisted-login e2e walkthrough (real Google)
- **Max feedback latency:** ~60 seconds (automated); manual gate once per phase

---

## Per-Requirement Verification Map

> Task IDs (`00-NN-MM`) are assigned by the planner; this map binds each requirement to its cheapest reliable assertion.

| Requirement | Behavior to prove | Test Type | Automated Command / Assertion | File (Wave 0) | Status |
|-------------|-------------------|-----------|-------------------------------|---------------|--------|
| FND-01 | Allowlisted Google login reaches a protected page; non-allowlisted blocked | unit + manual e2e | `isAllowed()` unit test; middleware redirect unit test; manual real-Google walkthrough | `test/allowlist.test.ts`, `test/middleware.test.ts` | ⬜ pending |
| FND-02a | Every `public` table has RLS enabled | SQL (CI) | `select count(*) from pg_tables where schemaname='public' and rowsecurity=false` **= 0** | `test/rls.assert.sql` | ⬜ pending |
| FND-02b | Non-allowlisted identity → zero rows | SQL/integration | Query tables with a non-allowlisted JWT → 0 rows; allowlisted JWT → rows | `test/rls.assert.sql` | ⬜ pending |
| FND-02c | All app routes require auth | middleware unit / e2e | Unauthenticated request to a protected path → 307 redirect to `/login` | `test/middleware.test.ts` | ⬜ pending |
| FND-03 | `service_role` absent from client bundle | CI grep / bundle scan | `grep -r SUPABASE_SERVICE_ROLE_KEY .next/static` returns nothing; ESLint guard passes; `server-only` build succeeds | `.github/workflows/ci.yml` | ⬜ pending |
| FND-04a | Schema push succeeded (tables exist) | SQL | `select to_regclass('public.<table>')` not null for each of the 12 tables | `test/rls.assert.sql` | ⬜ pending |
| FND-04b | Calendar dimension seeded 2024–2035 | SQL | `count(*) from dim_calendar` ≈ **4383**; `count(distinct period_key)` = **144**; min/max period_key = 202401/203512 | `test/rls.assert.sql` | ⬜ pending |
| FND-04c | Members + taxonomy seeded | SQL | `count(*) from members` = 2; categories include the 3 groups with parents | `test/rls.assert.sql` | ⬜ pending |
| FND-05 | App deployed & reachable on Vercel | manual / smoke | `curl -I <vercel-url>` → 200/redirect; `/login` renders | — | ⬜ pending |
| FND-06 | Tremor Raw, not `@tremor/react` | static assertion | `grep '@tremor/react' package.json` returns nothing; a copied Tremor Raw chart renders | `package.json` | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `vitest.config.ts` + Vitest install — no test infra exists
- [ ] `test/rls.assert.sql` (or a postgres-js script) — RLS-on-every-table + zero-rows-for-non-allowlisted + seed counts
- [ ] `test/middleware.test.ts` — unauthenticated redirect + non-allowlisted sign-out
- [ ] `test/allowlist.test.ts` — `isAllowed()` parsing of `ALLOWED_EMAILS`
- [ ] `.github/workflows/ci.yml` — lint + build + bundle grep + SQL assertions
- [ ] (Optional) Playwright for the one auth-gate e2e; otherwise document the manual walkthrough

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real Google sign-in by an allowlisted email reaches a protected page | FND-01 | Real Google OAuth/SCA is impractical to automate in CI | In the deployed app, sign in with an allowlisted Google account → land on a protected page; sign in with a non-allowlisted account → blocked/signed out |
| Deployed app reachable on Vercel | FND-05 | Requires the live Vercel deployment | `curl -I <vercel-url>` → 200/redirect; visit `/login` |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
