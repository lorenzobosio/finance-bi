# Phase 0: Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-21
**Phase:** 0-Foundation
**Areas discussed:** Schema scope, Unauthorized UX, Shell scope, Environments

> The user selected all four gray areas and answered them together in one comprehensive freeform decision set (also specifying scaffold, UI, data-layer, auth, and RLS choices). Options below reflect what was presented; the user's response is recorded per area.

---

## Schema scope

| Option | Description | Selected |
|--------|-------------|----------|
| Full v1 schema now | Create all entities up front (members, accounts, transactions, categories, rules, budgets, investment_contributions, goals, milestones, balances, insights, connections + dim_calendar) so later phases just use it | ✓ |
| Thin foundation | Auth + calendar + only Phase-0 tables; later phases add their own via migrations | |

**User's choice:** Full v1 schema now, via Drizzle ORM + drizzle-kit. Seed members (Lorenzo, Fernanda), the fixed category taxonomy, and dim_calendar (2024–2035). RLS enabled on every table.
**Notes:** RLS policies + seed are raw SQL migrations alongside Drizzle migrations. Fallback to supabase-js + SQL migrations acceptable if simpler.

---

## Unauthorized UX

| Option | Description | Selected |
|--------|-------------|----------|
| Hard access-denied screen | Show an explicit "not authorized" page | |
| Redirect to Google login | Middleware redirects unauthenticated users to /login | ✓ |
| Authenticated-but-empty | Let them in; RLS returns zero rows | |

**User's choice:** Middleware protects all routes except /login and the auth callback; unauthenticated → redirect to login. Any email not on `ALLOWED_EMAILS` is blocked / signed out.
**Notes:** Both users see everything once authenticated; the 2-email allowlist is the only access wall.

---

## Shell scope

| Option | Description | Selected |
|--------|-------------|----------|
| Full nav skeleton + theme | All 9 pages stubbed + basic mobile-first theme (light/dark) | partial |
| Minimal authenticated landing | A single protected placeholder page | |

**User's choice:** Scaffold with shadcn/ui (style default, base color slate, CSS variables on) + Tremor Raw wired for later charts. Light mode is enough for now. A protected page must render only after an allowlisted Google login.
**Notes:** Deep visual design and full page content deferred to Phase 2+ / UI phases. Dark mode deferred.

---

## Environments

| Option | Description | Selected |
|--------|-------------|----------|
| Single project + Vercel prod | One Supabase project, single Vercel Hobby production | ✓ |
| Dev/prod split + previews | Separate dev/prod Supabase + Vercel preview deploys | |

**User's choice:** GitHub → Vercel (Hobby) with env vars; single production environment, single Supabase project. Verify a protected page renders only after Google login by an allowlisted email.
**Notes:** Env vars — NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY (server-only), ALLOWED_EMAILS; Google OAuth configured in Supabase dashboard.

---

## Claude's Discretion

- App/package name `finance-bi`, light-mode-only, single Supabase project + single Vercel environment — resolved as small details per the user's instruction.
- `dim_calendar` range 2024–2035.
- Research flags (not user decisions): Drizzle + Supabase RLS read-path, the CI `service_role` guard mechanism, and the allowlist-enforcement layer — handed to the researcher.

## Deferred Ideas

- Dark mode — revisit during UI phases.
- Separate dev/prod environments + preview deploys — single environment for now.
- Deep visual design / 9-page content — Phase 2+ and UI phases.
