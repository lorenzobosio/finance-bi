# Phase 0: Foundation - Context

**Gathered:** 2026-06-21
**Status:** Ready for planning

<domain>
## Phase Boundary

A secure, deployed app shell with auth, RLS, the `service_role` boundary, and the full v1 dimensional schema in place — so all later data lands behind login and is month-comparable from day one. Covers requirements **FND-01..06**.

In scope: scaffold + tooling, UI/component foundation, the complete v1 database schema + seed (members, taxonomy, calendar), Google auth + 2-email allowlist, RLS on every table, the server-only `service_role` boundary (CI-asserted), route protection, and a first Vercel deploy verifying the auth gate.

Out of scope (later phases): any bank ingestion (Phase 1), BI views / dashboards / charts content (Phase 2+), deep visual design (UI phases), dark mode.
</domain>

<decisions>
## Implementation Decisions

### Scaffold & tooling
- **D-01:** `create-next-app` → Next.js 15 (App Router), TypeScript, Tailwind, ESLint, `src/` directory, import alias `@/*`.
- **D-02:** Package manager is **pnpm**; Node 20+.
- **D-03:** App/package name is `finance-bi` (Claude's discretion — see below; trivial to change).

### UI / component layer
- **D-04:** Initialize **shadcn/ui** — style `default`, base color `slate`, CSS variables on. This is the component/primitive layer for the shell and later pages.
- **D-05:** Charts/KPIs use **Tremor Raw** (copy-paste components on Tailwind v4 + Recharts) when they arrive in Phase 2+. **Do NOT install `@tremor/react`** (frozen at 3.18.7, Tailwind v3 / React 18 only).
- **D-06:** **Light mode only** for now — no dark mode in Phase 0.

### Data layer & migrations
- **D-07:** Use **Drizzle ORM + drizzle-kit** for schema definition and migrations against the Supabase Postgres. Acceptable fallback if it proves simpler in practice: `@supabase/supabase-js` + plain SQL migrations via the Supabase CLI.
- **D-08:** **RLS policies and the calendar/category seed are raw SQL migrations** (Drizzle doesn't manage RLS) — kept in version control alongside Drizzle's generated migrations.

### Schema scope & seed (full v1 schema NOW)
- **D-09:** Create the **full v1 schema up front** so later phases just use it: `members`, `accounts`, `transactions`, `categories`, `rules`, `budgets`, `investment_contributions`, `goals`, `milestones`, `balances`, `insights`, `connections`, plus a `dim_calendar` table. (Entity field shapes follow the data model in PROJECT.md / the master spec.)
- **D-10:** **Seed in Phase 0:** the 2 members (Lorenzo, Fernanda); the fixed category taxonomy (`group` = essential | desire | investment, with parents); `dim_calendar` covering **2024–2035** (`period_key` = YYYYMM) for MoM/YoY joins.
- **D-11:** **RLS enabled on every table** (no table ships without a policy).

### Auth & allowlist
- **D-12:** Supabase Auth with **Google** via `@supabase/ssr` (server components + middleware); **httpOnly cookie sessions**.
- **D-13:** Allowlist of **2 emails in env `ALLOWED_EMAILS`**; any email not on the list is **blocked / signed out** (cannot reach the app).
- **D-14:** Google OAuth client configured in the Supabase dashboard.

### RLS model & security boundary (both users see everything)
- **D-15:** RLS policies grant **full read/write to any authenticated user** — because only the 2 allowlisted emails can authenticate, this is the access wall. Cost center stays an analytical label, never an access boundary.
- **D-16:** The **`service_role` key is server-only** (ingestion/admin + audited route handlers) — never shipped to the client. Add a **CI/lint check that fails the build if `service_role` is imported into client-side code / the browser bundle** (FND-03).

### Routing / unauthorized UX
- **D-17:** Middleware protects **all routes except `/login` and the auth callback**; unauthenticated requests **redirect to login**.

### Deploy & environments
- **D-18:** GitHub → **Vercel (Hobby)** with env vars set; **single production environment, single Supabase project** (no separate dev/prod split for now — free-tier-friendly).
- **D-19:** **Definition of done (FND-01..06):** allowlisted Google login works and rejects others; RLS on all tables; `service_role` server-only (CI-asserted); full schema created + calendar/members/taxonomy seeded; Next 15 live on Vercel; shadcn/ui + Tremor Raw wiring in place; a protected page renders only after an allowlisted Google login.

### Phase 0 environment variables
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server-only), `ALLOWED_EMAILS`. (Google OAuth client configured in the Supabase dashboard.)

### Claude's Discretion
- App/package name `finance-bi`, light-mode-only, and single-project/single-environment were resolved as small details per the user's instruction ("answer small details on the spot"). All are trivially changeable.
- `dim_calendar` range (2024–2035) chosen to comfortably cover go-forward data plus the €100k ETA horizon; widen later if needed.

### Research flags (for gsd-phase-researcher — do NOT ask the user)
- **Drizzle + Supabase RLS read-path:** Drizzle migrations need a direct Postgres connection (service-role/owner). Resolve how the app's **user-facing reads** stay RLS-enforced: recommended split is reads/queries via `@supabase/ssr` (anon key + user JWT, RLS applies) while Drizzle handles schema/migrations and server-side `service_role` writes. Confirm Drizzle + drizzle-kit migration flow against Supabase (connection string, `prepare:false` for the pooler) and that hand-written RLS SQL coexists cleanly with Drizzle migrations.
- **CI service_role guard:** confirm a concrete mechanism (lint rule / grep gate / bundle check) that fails CI when `SUPABASE_SERVICE_ROLE_KEY` or the service client is reachable from client code.
- **Allowlist enforcement layer:** confirm whether to enforce `ALLOWED_EMAILS` at the middleware/callback layer (sign out non-allowlisted) in addition to RLS returning zero rows — decision is "block/sign-out", so verify the cleanest Supabase pattern.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project & scope
- `.planning/PROJECT.md` — locked decisions, constraints, data model, security principles
- `.planning/REQUIREMENTS.md` — FND-01..06 (the Phase 0 requirements) + MVP acceptance criteria
- `.planning/ROADMAP.md` — Phase 0 goal + 5 success criteria

### Stack & architecture (most important for this phase)
- `.claude/CLAUDE.md` — generated stack reference: exact versions, Supabase RLS/service_role pattern, Tremor Raw rationale, env vars
- `.planning/research/STACK.md` — Next 15 / Tailwind v4 / `@supabase/ssr` / Tremor Raw specifics; what NOT to use
- `.planning/research/ARCHITECTURE.md` — three-plane model (write/derivation/read), RLS allowlist strategy, `service_role` isolation (`lib/supabase/service.ts` chokepoint), schema + calendar dimension shape
- `.planning/research/PITFALLS.md` — RLS misconfiguration, `service_role` leak, Supabase free-tier pause (CI/security guardrails)
- `.planning/research/SUMMARY.md` — Phase 0 implications + key decisions to confirm (Tremor Raw)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- None — greenfield. This phase creates the scaffold.

### Established Patterns
- None yet. Patterns established here (data layer = Drizzle, components = shadcn/ui, charts = Tremor Raw, auth = `@supabase/ssr`, RLS-on-every-table) become the conventions for all later phases.

### Integration Points
- The schema and `service_role` server boundary created here are the integration surface for Phase 1 ingestion (GitHub Action writing via `service_role`) and Phase 2 read views.

</code_context>

<specifics>
## Specific Ideas

- shadcn/ui config is explicit: style `default`, base color `slate`, CSS variables on.
- Tremor Raw is the explicit (and only) way to satisfy the "Tremor" constraint — copy-paste, no npm package.
- Full v1 schema up front (not a thin foundation) is a deliberate choice to keep later phases additive.

</specifics>

<deferred>
## Deferred Ideas

- **Dark mode** — not now (light mode only); revisit during the UI phases if wanted.
- **Separate dev/prod Supabase + Vercel preview deploys** — single environment for now; reconsider if collaboration/risk grows.
- Deep visual design / theming and the 9-page content — handled in Phase 2+ and the UI phases.

None of the above is scope creep into Phase 0 — they are explicitly held for later.

</deferred>

---

*Phase: 0-Foundation*
*Context gathered: 2026-06-21*
