# Phase 0: Foundation - Research

**Researched:** 2026-06-21
**Domain:** Secure Next.js 15 scaffold + Supabase (Auth/RLS) + Drizzle ORM schema/migrations + shadcn/ui + Tremor Raw, deployed on Vercel Hobby
**Confidence:** HIGH (all versions verified against npm registry June 2026; patterns verified against official Supabase / Drizzle / shadcn docs)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** `create-next-app` → Next.js 15 (App Router), TypeScript, Tailwind, ESLint, `src/` directory, import alias `@/*`.
- **D-02:** Package manager is **pnpm**; Node 20+.
- **D-03:** App/package name is `finance-bi`.
- **D-04:** Initialize **shadcn/ui** — style `default`, base color `slate`, CSS variables on. *(⚠️ see Assumptions A1/A2 — `default` style and `slate` base color are no longer valid in the current shadcn CLI; the planner must substitute `new-york` + a neutral-family base color. The intent — "neutral grey, CSS variables on" — is preserved.)*
- **D-05:** Charts/KPIs use **Tremor Raw** (copy-paste on Tailwind v4 + Recharts) when they arrive in Phase 2+. **Do NOT install `@tremor/react`.**
- **D-06:** **Light mode only** for now — no dark mode in Phase 0.
- **D-07:** Use **Drizzle ORM + drizzle-kit** for schema definition and migrations against Supabase Postgres. Acceptable fallback: `@supabase/supabase-js` + plain SQL migrations via the Supabase CLI.
- **D-08:** **RLS policies and the calendar/category seed are raw SQL migrations** (Drizzle doesn't manage RLS) — version-controlled alongside Drizzle's generated migrations.
- **D-09:** Create the **full v1 schema up front**: `members`, `accounts`, `transactions`, `categories`, `rules`, `budgets`, `investment_contributions`, `goals`, `milestones`, `balances`, `insights`, `connections`, plus `dim_calendar`.
- **D-10:** **Seed in Phase 0:** 2 members (Lorenzo, Fernanda); fixed category taxonomy (`group` = essential | desire | investment, with parents); `dim_calendar` covering **2024–2035** (`period_key` = YYYYMM).
- **D-11:** **RLS enabled on every table** (no table ships without a policy).
- **D-12:** Supabase Auth with **Google** via `@supabase/ssr` (server components + middleware); **httpOnly cookie sessions**.
- **D-13:** Allowlist of **2 emails in env `ALLOWED_EMAILS`**; any email not on the list is **blocked / signed out**.
- **D-14:** Google OAuth client configured in the Supabase dashboard.
- **D-15:** RLS policies grant **full read/write to any authenticated user** (the 2 allowlisted emails are the access wall). Cost center is an analytical label, never an access boundary.
- **D-16:** The **`service_role` key is server-only**; CI/lint check fails the build if `service_role` is imported into client-side code / the browser bundle (FND-03).
- **D-17:** Middleware protects **all routes except `/login` and the auth callback**; unauthenticated requests redirect to login.
- **D-18:** GitHub → **Vercel (Hobby)** with env vars; single production environment, single Supabase project.
- **D-19:** Definition of done (FND-01..06): allowlisted Google login works and rejects others; RLS on all tables; `service_role` server-only (CI-asserted); full schema created + calendar/members/taxonomy seeded; Next 15 live on Vercel; shadcn/ui + Tremor Raw wiring in place; a protected page renders only after an allowlisted Google login.
- **Env vars:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server-only), `ALLOWED_EMAILS`. *(⚠️ see Assumptions A3 — new Supabase projects issue `sb_publishable_…` / `sb_secret_…` keys; the planner must verify which key style this project's Supabase instance exposes and may need a `DATABASE_URL` for Drizzle in addition.)*

### Claude's Discretion
- App/package name `finance-bi`, light-mode-only, single-project/single-environment — all trivially changeable.
- `dim_calendar` range (2024–2035) chosen to cover go-forward data plus the €100k ETA horizon; widen later if needed.

### Deferred Ideas (OUT OF SCOPE)
- **Dark mode** — not now (light mode only); revisit during UI phases.
- **Separate dev/prod Supabase + Vercel preview deploys** — single environment for now.
- Deep visual design / theming and the 9-page content — Phase 2+ and the UI phases.
- Any bank ingestion (Phase 1), BI views / dashboards / charts content (Phase 2+).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FND-01 | Google sign-in restricted to a 2-email allowlist (all others rejected) | Seam 2: `@supabase/ssr` OAuth + allowlist enforced at middleware **and** in RLS (defense in depth) |
| FND-02 | Every table has RLS enabled enforcing the allowlist; all app routes require auth | Seam 1 (RLS as custom SQL migration) + Seam 2 (middleware route protection) + Validation Architecture RLS assertions |
| FND-03 | `service_role` key isolated to server-only code; never in client bundle (CI-asserted) | Seam 3: `server-only` package + ESLint `no-restricted-imports` + a grep/bundle CI gate |
| FND-04 | Base Postgres schema with seeded calendar dimension (`period_key` = YYYYMM) for MoM/YoY | Seam 4 (Drizzle schema) + Seam 1 (seed as custom SQL migration); `dim_calendar` generation 2024–2035 |
| FND-05 | App scaffold (Next 15 + Tailwind v4 + Tremor Raw + `@supabase/ssr`) deployed & reachable on Vercel | Seam 5 (scaffold + shadcn + Tremor Raw wiring) + Seam 6 (Vercel deploy) |
| FND-06 | Charting adopts Tremor Raw (Tailwind v4 + Recharts), not frozen `@tremor/react` | Seam 5: Tremor Raw wiring (utils helper + Recharts; no npm `@tremor/react`) |
</phase_requirements>

## Summary

Phase 0 is a **security-and-schema foundation**, not a feature. The hard part is not "scaffold Next.js" — `create-next-app` and `shadcn init` do that in minutes — but getting four boundaries correct and provable on day one: (1) the **Drizzle ↔ Supabase ↔ RLS seam**, where Drizzle owns schema/migrations through a privileged Postgres connection while user-facing reads go through `@supabase/ssr` under RLS; (2) the **Google OAuth + 2-email allowlist**, enforced both at the middleware (block/sign-out) and in the RLS policy (zero rows) so it is defense-in-depth; (3) the **`service_role` isolation**, asserted in CI so the build fails if the key can reach the browser; and (4) the **full v1 dimensional schema + seed**, defined once so later phases are purely additive.

The single most important architectural recommendation: **do not use the Drizzle query client at request-time in Phase 0.** Drizzle connects with a privileged owner/Postgres role that **bypasses RLS** — using it to serve user reads would silently defeat the entire allowlist. Drizzle's job is schema + migrations (and, in Phase 1+, `service_role`-style server-only writes from the GitHub Action). Every user-facing read/write in the app goes through `@supabase/ssr` (publishable/anon key + the user's JWT, so RLS applies). This split is the backbone of the whole app and must be established here.

Three current-reality deviations from the locked decisions surfaced and must be handled by the planner (none change intent): the shadcn `default` style and `slate` base color **no longer exist** in the current CLI (`new-york` + a neutral base color is the substitute); new Supabase projects issue `sb_publishable_…`/`sb_secret_…` keys instead of `anon`/`service_role`; and Drizzle needs a direct `DATABASE_URL` (Postgres connection string) in addition to the Supabase URL/keys. These are confirmation items, not blockers.

**Primary recommendation:** Scaffold Next 15 + Tailwind v4 + shadcn (`new-york`/neutral) → wire `@supabase/ssr` (browser/server/middleware) with Google OAuth + a `/auth/callback` route → enforce the allowlist in middleware (sign out non-allowlisted) **and** in every RLS policy → define the full v1 schema in Drizzle, push it, then add **two custom SQL migrations** (RLS policies; calendar/members/taxonomy seed) → isolate `service_role` behind a single `lib/supabase/service.ts` guarded by `server-only` + ESLint + a CI grep/bundle gate → deploy to Vercel Hobby and verify the auth gate end-to-end.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Schema definition + migrations | Database / Build-time (Drizzle + drizzle-kit via direct Postgres conn) | — | Drizzle owns DDL; runs offline against a privileged connection, never at request time |
| RLS policies + seed data | Database (raw SQL custom migrations) | — | Drizzle does not manage RLS; hand-written SQL is the source of truth, version-controlled |
| User-facing reads/writes | API / Frontend Server (Server Components + Route Handlers via `@supabase/ssr`) | Browser (client islands, anon key) | Must run under the user's JWT so RLS enforces the allowlist |
| Session management | Frontend Server (middleware + server client) | Browser (browser client) | Cookie-based httpOnly sessions; middleware refreshes the token |
| OAuth code exchange | API / Frontend Server (`/auth/callback` Route Handler) | — | PKCE code-for-session exchange is a server step |
| Allowlist enforcement | Frontend Server (middleware) **and** Database (RLS) | — | Defense in depth: middleware blocks/sign-out; RLS returns zero rows |
| `service_role` privileged writes | API / Backend (Route Handlers) + CI (GitHub Action, Phase 1) | — | Bypasses RLS; must never reach the browser tier |
| Charts/KPI rendering | Browser (client islands, Tremor Raw + Recharts) | Frontend Server (data fetch) | Recharts needs the client; data fetched server-side under RLS |
| Deploy/runtime | CDN / Frontend Server (Vercel Hobby) | — | Hosts the read app; never holds `service_role` except in audited Route Handlers |

## Standard Stack

### Core
| Library | Version (verified npm, 2026-06-21) | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `next` | `15.x` (pin; latest is `16.2.9`) | App Router framework + Route Handlers | Locked (D-01). Pin 15 per STACK.md; every dep below proven on it. [VERIFIED: npm registry] |
| `react` / `react-dom` | `19.x` | UI runtime | Default for Next 15. [VERIFIED: npm registry] |
| `typescript` | `5.x` (≥5.5) | Types everywhere | Strict mode on. [VERIFIED: npm registry] |
| `tailwindcss` | `4.3.1` | Styling (CSS-first, `@import "tailwindcss"`) | Locked (D-01). v4 is the shadcn + Next 15 default. [VERIFIED: npm registry] |
| `@supabase/supabase-js` | `2.108.2` | Core Supabase client | Used by `@supabase/ssr`; also the `service_role` client in Route Handlers / the Action. [VERIFIED: npm registry] |
| `@supabase/ssr` | `0.12.0` | Cookie-based App Router client (browser + server) | Locked (D-12). Replaces deprecated `@supabase/auth-helpers-nextjs`. Peer-deps `@supabase/supabase-js ^2.108.0`. [VERIFIED: npm registry] |
| `drizzle-orm` | `0.45.2` | Schema definition + (server-only) query builder | Locked (D-07). [VERIFIED: npm registry] |
| `drizzle-kit` | `0.31.10` | Migration generate/push/migrate CLI | Locked (D-07). [VERIFIED: npm registry] |
| `postgres` | `3.4.9` | postgres-js driver for Drizzle ↔ Supabase | The driver Drizzle's Supabase guide uses; needs `prepare:false` on the transaction pooler. [VERIFIED: npm registry] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `recharts` | `3.8.1` | Charting primitive under Tremor Raw | Phase 2+; install now so Tremor Raw blocks have their dependency. [VERIFIED: npm registry] *(note: STACK.md cites Recharts 2.x; registry latest is 3.x — Tremor Raw current blocks target Recharts 3; confirm the Tremor Raw block's stated Recharts version when copying — see A4)* |
| `clsx` | `2.1.1` | className composition (Tremor Raw `cx` util) | Tremor Raw + shadcn utilities. [VERIFIED: npm registry] |
| `tailwind-merge` | `3.6.0` | Merge conflicting Tailwind classes (`cx`/`cn`) | shadcn `cn()` + Tremor Raw `cx()`. [VERIFIED: npm registry] |
| `tailwind-variants` | `3.2.2` | Variant styling used by some Tremor Raw blocks | Pull per-component when copying Tremor Raw blocks. [VERIFIED: npm registry] |
| `server-only` | `0.0.1` | Build-time guard: error if a module is imported into a client bundle | Import at top of `lib/supabase/service.ts` (FND-03). [VERIFIED: npm registry] |
| `zod` | `4.4.3` | Input/response validation | Light use in Phase 0 (env validation optional); heavier in Phase 1. [VERIFIED: npm registry] |
| `date-fns` | `4.4.0` | Date math for `dim_calendar` seed generation | Generate the 2024–2035 calendar rows. [VERIFIED: npm registry] *(STACK.md cites 3.x; latest major is 4.x — either works; pin one.)* |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Drizzle + drizzle-kit | `@supabase/supabase-js` + Supabase CLI plain-SQL migrations | The locked fallback (D-07). Simpler if Drizzle's connection proves fiddly, but loses typed schema. Recommend staying with Drizzle; only fall back if the pooler connection blocks CI. |
| Drizzle query client at request-time | `@supabase/ssr` for all user reads | **Strongly recommend `@supabase/ssr` for reads** — Drizzle's connection bypasses RLS (see Seam 1). |
| `server-only` + ESLint + grep gate | Bundle-scan only | Layered is more robust; a single grep can be defeated by indirection. Use all three (Seam 3). |
| shadcn `new-york` style | `default` style | `default` is **deprecated/removed** from the CLI; `new-york` is the only valid value now (A1). |

**Installation (after `create-next-app`):**
```bash
# Supabase clients
pnpm add @supabase/supabase-js @supabase/ssr

# Data layer (Drizzle + postgres-js driver)
pnpm add drizzle-orm postgres
pnpm add -D drizzle-kit

# Charting deps for Tremor Raw (no @tremor/react)
pnpm add recharts clsx tailwind-merge tailwind-variants

# Server-only guard + validation + dates
pnpm add server-only zod date-fns

# shadcn (run its init separately)
pnpm dlx shadcn@latest init
```

**Version verification:** All versions above confirmed via `npm view <pkg> version` on 2026-06-21. Next.js intentionally pinned to 15.x (latest 16.2.9) per the locked decision.

## Package Legitimacy Audit

Run on 2026-06-21 via `gsd-tools query package-legitimacy check --ecosystem npm`.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `drizzle-orm` | npm | est. since 2022 | ~11.6M/wk | github.com/drizzle-team/drizzle-orm | OK | Approved |
| `drizzle-kit` | npm | est. since 2022 | ~9.6M/wk | github.com/drizzle-team/drizzle-orm | OK | Approved |
| `postgres` | npm | est. 5+ yrs | ~10.7M/wk | github.com/porsager/postgres | OK | Approved |
| `@supabase/ssr` | npm | recent release (2026-06-09) | ~4.9M/wk | github.com/supabase/ssr | SUS→**OK** | Approved (see note) |
| `@supabase/supabase-js` | npm | recent release (2026-06-15) | ~21.4M/wk | github.com/supabase/supabase-js | SUS→**OK** | Approved (see note) |
| `recharts` | npm | est. 8+ yrs | high | github.com/recharts/recharts | OK | Approved |
| `clsx`, `tailwind-merge`, `tailwind-variants`, `server-only`, `zod`, `date-fns` | npm | established | high | official repos | OK | Approved |

**Note on the two SUS verdicts:** `@supabase/ssr` and `@supabase/supabase-js` were flagged **only** for the `too-new` heuristic (a routine recent point release). Both are first-party Supabase packages with millions of weekly downloads, official `github.com/supabase/*` repos, no postinstall scripts, and are the canonical, documentation-recommended clients. These are **false positives** — treat as **OK**. No checkpoint required.

**Packages removed due to [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** none requiring action (the two above are confirmed first-party).

## Architecture Patterns

### System Architecture Diagram

```
                     ┌──────────────────────────────────────────────┐
   Google OAuth ────▶│  Browser (anon/publishable key, RLS-bound)   │
   (SCA at Google)   │   client islands · signInWithOAuth call      │
                     └───────────────┬──────────────────────────────┘
                                     │ httpOnly cookie session
                                     ▼
   ┌──────────────────────────────────────────────────────────────────┐
   │   FRONTEND SERVER (Next 15 App Router on Vercel)                   │
   │                                                                    │
   │   middleware.ts ── getUser() refresh ──┐                          │
   │      │ block non-allowlisted (sign out) │                          │
   │      ▼                                   ▼                          │
   │   /login   /auth/callback (exchangeCodeForSession)  protected pages│
   │      │           │                         │                       │
   │      └──── @supabase/ssr server client (user JWT) ───────┐         │
   │                                                          │ reads   │
   │   Route Handlers (audited) ── lib/supabase/service.ts ───┼─ writes │
   │                              (service_role, server-only) │ (RLS    │
   └──────────────────────────────────────────────────────────┼ bypass)│
                                                               ▼         ▼
   ┌──────────────────────────────────────────────────────────────────┐
   │   SUPABASE POSTGRES                                                │
   │   RLS on every table: (select auth.jwt()->>'email') in (allowlist)│
   │   tables: members accounts transactions categories rules budgets  │
   │           investment_contributions goals milestones balances      │
   │           insights connections  +  dim_calendar                   │
   └──────────────────────────────▲────────────────────────────────────┘
                                  │ direct Postgres conn (DATABASE_URL, prepare:false)
                     ┌────────────┴─────────────┐
                     │  Drizzle + drizzle-kit    │  ← BUILD-TIME ONLY
                     │  schema · push · migrate  │     (privileged role, bypasses RLS)
                     │  + custom SQL: RLS · seed │
                     └───────────────────────────┘
```

Trace the primary use case (allowlisted login → protected page): Google OAuth → `/auth/callback` exchanges the code for a cookie session → middleware refreshes + checks the email against `ALLOWED_EMAILS` → a Server Component reads via `@supabase/ssr` (user JWT) → RLS confirms the email ∈ allowlist → rows return → page renders.

### Recommended Project Structure
```
src/
├── app/
│   ├── (auth)/login/page.tsx     # Google sign-in button (client island)
│   ├── auth/callback/route.ts    # PKCE exchangeCodeForSession Route Handler
│   ├── (protected)/page.tsx      # a protected page proving the gate (DoD)
│   └── api/                       # Route Handlers (audited service_role writes)
├── lib/
│   ├── supabase/
│   │   ├── client.ts             # createBrowserClient (anon/publishable)
│   │   ├── server.ts             # createServerClient (user session)
│   │   └── service.ts            # service_role — `import "server-only"` at top
│   ├── db/
│   │   ├── schema.ts             # Drizzle table defs (full v1 schema)
│   │   └── index.ts              # postgres-js + drizzle client (server-only, migrations)
│   └── auth/allowlist.ts         # ALLOWED_EMAILS parse + isAllowed()
├── middleware.ts                 # session refresh + route protection + allowlist gate
└── drizzle/                      # generated + custom SQL migrations
    ├── 0000_init.sql             # generated: enums + tables + indexes
    ├── 0001_rls_policies.sql     # custom: enable RLS + allowlist policies (every table)
    └── 0002_seed.sql             # custom: members + taxonomy + dim_calendar
drizzle.config.ts                 # dialect postgresql, schema path, DATABASE_URL
```

### Pattern 1: Drizzle for schema/migrations, `@supabase/ssr` for request-time reads (THE seam)
**What:** Drizzle + drizzle-kit own DDL and run **offline** (CI / local) against a **direct privileged Postgres connection** (`DATABASE_URL`). The running Next.js app **never** uses the Drizzle query client to serve user reads — those go through `@supabase/ssr` so the user's JWT applies and RLS enforces the allowlist.
**When to use:** Always in this project. The Drizzle connection bypasses RLS (it connects as the DB owner/`postgres` role), so request-time use would defeat the allowlist.
**Phase 0 recommendation:** Do **not** instantiate a request-time Drizzle client at all in Phase 0. The only DB access the app needs in Phase 0 is the auth-gated read that proves the gate — use `@supabase/ssr` for it. Reserve Drizzle's query builder for Phase 1+ server-only `service_role`-equivalent ingestion writes (run from the GitHub Action, outside the browser).
```typescript
// drizzle.config.ts — build-time only
import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';
export default defineConfig({
  out: './drizzle',
  schema: './src/lib/db/schema.ts',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL! },
});

// src/lib/db/index.ts — server-only; used by migrations + (Phase 1+) ingestion writes
import 'server-only';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
// Transaction pooler (port 6543) requires prepare:false.
const client = postgres(process.env.DATABASE_URL!, { prepare: false });
export const db = drizzle({ client });
```
**Connection-string choice (verified):**
- Direct / **Session pooler** → port **5432** (full Postgres features; good for migrations).
- **Transaction pooler** → port **6543**; **must set `prepare: false`** (prepared statements unsupported). IPv4-only Supavisor endpoint: `aws-<region>.pooler.supabase.com`.
- **Recommendation:** Use the **Session pooler (5432)** connection string for `drizzle-kit push`/`migrate` (migrations want full features and run rarely). If you ever run Drizzle queries from a serverless/Action context, use the Transaction pooler (6543) with `prepare:false`. [CITED: supabase.com/docs/guides/database/connecting-to-postgres]

### Pattern 2: RLS policies + seed as custom SQL migrations alongside Drizzle (D-08)
**What:** Drizzle generates the table DDL; RLS and seed data are hand-written SQL migration files that drizzle-kit runs in timestamp/sequence order with the generated ones.
**When to use:** Always — Drizzle does not manage RLS, and the allowlist must be reviewable SQL, not dashboard clicks.
**How:** `pnpm drizzle-kit generate --custom --name=rls_policies` creates an empty `.sql` migration; hand-write `ALTER TABLE … ENABLE ROW LEVEL SECURITY` + the allowlist policy for **every** table. Repeat `--custom --name=seed` for the members/taxonomy/calendar seed. drizzle-kit orders by the numeric prefix, so generated DDL (`0000`) runs before RLS (`0001`) before seed (`0002`). [CITED: orm.drizzle.team/docs/drizzle-kit-generate]
```sql
-- 0001_rls_policies.sql  (repeat the block for EVERY table)
alter table public.transactions enable row level security;
create policy "allowlist_all" on public.transactions
  for all to authenticated
  using  ( (select auth.jwt() ->> 'email') in ('lorenzo@example.com','fernanda@example.com') )
  with check ( (select auth.jwt() ->> 'email') in ('lorenzo@example.com','fernanda@example.com') );
```

### Pattern 3: Allowlist defense-in-depth (middleware block + RLS zero-rows)
**What:** Enforce `ALLOWED_EMAILS` in **two** independent places: (a) middleware signs out / redirects any authenticated user whose email is not on the list (UX + hard block); (b) the RLS policy returns zero rows for non-allowlisted emails (data wall). Even if one layer is misconfigured, the other holds.
**When to use:** Always — this is FND-01 + FND-02.
**Recommendation on *where* in auth code:** enforce in **middleware** (it already runs `getUser()` to refresh the session, so the check is free and covers every route), not only in the callback. The callback is a single entry point; middleware is comprehensive. See Seam 2 for the code.
**Allowlist source for the RLS policy:** **hardcode the 2 emails in the policy SQL** for Phase 0 (simplest, 2 trusted users, version-controlled in the migration). A `members`/allowlist *table* read inside the policy is possible but adds a join on every query for zero benefit at this scale — defer unless the list grows. (The app-layer `ALLOWED_EMAILS` env stays the source for middleware; keep them in sync — note this in the seed migration as a comment.)

### Pattern 4: `service_role` single chokepoint, CI-asserted (FND-03)
**What:** Exactly one module (`lib/supabase/service.ts`) constructs the `service_role`/secret-key client; it begins with `import "server-only"`. Client/browser code can only reach elevated DB access through audited Route Handlers, never directly. CI fails if the key or the module leaks toward the bundle.
**When to use:** Always — this is the security keystone of the whole project (Pitfalls 7 & 8).

### Anti-Patterns to Avoid
- **Using the Drizzle query client to serve user reads.** It bypasses RLS — the allowlist becomes decorative. Reads go through `@supabase/ssr`.
- **`getSession()` in server code for authorization.** It does not revalidate the token; use `getUser()` (network-validated) for any gate decision. [CITED: supabase.com/docs/guides/auth/server-side/nextjs]
- **Naming the secret key `NEXT_PUBLIC_*`.** Next inlines `NEXT_PUBLIC_*` into the browser bundle → full DB compromise.
- **Enforcing the allowlist only in app code.** Must also be in the RLS policy (bypassable otherwise).
- **Shipping a table without RLS.** Default-deny with no policy locks legit users out; RLS-off leaks data to anon. Every table gets `ENABLE ROW LEVEL SECURITY` + a policy in the same migration.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cookie-based Supabase session in App Router | Custom cookie/JWT plumbing | `@supabase/ssr` `createServerClient`/`createBrowserClient` | Handles httpOnly cookies, refresh, getAll/setAll correctly across RSC/middleware |
| OAuth PKCE code exchange | Manual token swap | `supabase.auth.exchangeCodeForSession(code)` in `/auth/callback` | PKCE flow + cookie writes are subtle (see the v2.91.0 caveat below) |
| RLS allowlist enforcement | App-only email checks | RLS policy on every table | DB-level wall can't be bypassed by a forgotten code path |
| service_role isolation | "Be careful" convention | `server-only` + ESLint `no-restricted-imports` + CI grep | Conventions fail; tooling fails the build |
| Migration ordering/journal | Custom runner | `drizzle-kit generate`/`migrate` (timestamp journal) | Deterministic ordering of generated + custom SQL |
| Tailwind class merging | String concat | `clsx` + `tailwind-merge` (`cn`/`cx`) | Correctly resolves conflicting utilities; shadcn + Tremor Raw both rely on it |
| Calendar dimension | Ad-hoc `date_trunc` in queries | Seeded `dim_calendar` table | Dense rows → empty months render as €0; MoM/YoY are joins not date math (Pitfall 6) |

**Key insight:** In a personal-finance app the threats are RLS misconfiguration and `service_role` leakage, not scale. The libraries above exist precisely because the edge cases (cookie refresh, PKCE, class merging, RLS) are where hand-rolled code silently breaks security or comparability.

## Code Examples

Verified patterns from official sources.

### Browser + server + middleware clients (`@supabase/ssr`)
```typescript
// src/lib/supabase/client.ts
import { createBrowserClient } from '@supabase/ssr';
export const createClient = () =>
  createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, // or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY — see A3
  );

// src/lib/supabase/server.ts
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(toSet) {
          try { toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); }
          catch { /* called from a Server Component; middleware will refresh */ }
        },
      },
    },
  );
}
```
[CITED: supabase.com/docs/guides/auth/server-side/nextjs]

### Middleware: session refresh + route protection + allowlist gate
```typescript
// src/middleware.ts
import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

const ALLOWED = (process.env.ALLOWED_EMAILS ?? '').split(',').map(e => e.trim().toLowerCase());
const PUBLIC = ['/login', '/auth/callback'];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: request.headers } });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(toSet) { toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options)); },
    }},
  );
  const { data: { user } } = await supabase.auth.getUser(); // validated, not getSession()
  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC.some(p => path.startsWith(p));

  if (!user && !isPublic) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  if (user && !ALLOWED.includes((user.email ?? '').toLowerCase())) {
    await supabase.auth.signOut();                       // block/sign-out non-allowlisted (D-13)
    return NextResponse.redirect(new URL('/login?denied=1', request.url));
  }
  return response;
}
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
```
[CITED: supabase.com/docs/guides/auth/server-side/nextjs] — `getUser()` rationale and middleware shape.

### Google sign-in + `/auth/callback` Route Handler
```typescript
// in the login client island
const supabase = createClient();
await supabase.auth.signInWithOAuth({
  provider: 'google',
  options: { redirectTo: `${location.origin}/auth/callback` },
});

// src/app/auth/callback/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  if (code) {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);
  }
  return NextResponse.redirect(`${origin}/`);
}
```
[CITED: supabase.com/docs/guides/auth/social-login/auth-google]
**⚠️ Caveat (verified):** In `@supabase/supabase-js` **v2.91.0** the `SIGNED_IN` event after `exchangeCodeForSession` is deferred via `setTimeout`, which can complete *after* the request ends and **fail to write auth cookies** in SSR/serverless callback handlers. Pin/verify a `@supabase/supabase-js` version where this is fixed, or ensure the callback `await`s cookie persistence. Add a smoke test that the session cookie is present after callback. [CITED: github.com/supabase/supabase-js/issues/2037]

### service_role chokepoint (FND-03)
```typescript
// src/lib/supabase/service.ts
import 'server-only'; // build error if imported into any client bundle
import { createClient } from '@supabase/supabase-js';
export const createServiceClient = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
```

### ESLint guard — block service client / key from client code
```js
// eslint.config.mjs (flat config) — add a rule
import { defineConfig } from 'eslint/config'; // or merge into your next config array
export default [
  // ...next presets...
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['*/lib/supabase/service', '**/lib/supabase/service'],
          message: 'service_role client is server-only. Use it only inside Route Handlers / server code.',
        }],
      }],
    },
  },
  {
    // belt-and-suspenders: forbid the env var name in client components entirely
    files: ['src/**/*.tsx'],
    rules: {
      'no-restricted-syntax': ['error', {
        selector: "MemberExpression[object.property.name='env'][property.name='SUPABASE_SERVICE_ROLE_KEY']",
        message: 'SUPABASE_SERVICE_ROLE_KEY must never be referenced in client/UI files.',
      }],
    },
  },
];
```
[CITED: eslint.org/docs/latest/rules/no-restricted-imports]

### CI grep/bundle gate (the hard assertion for FND-03)
```yaml
# .github/workflows/ci.yml (excerpt)
- name: Lint (includes service_role import guard)
  run: pnpm lint
- name: Build
  run: pnpm build
- name: Assert service_role NOT in client bundle
  run: |
    if grep -rIl --include='*.js' -e 'SUPABASE_SERVICE_ROLE_KEY' .next/static; then
      echo "::error::service_role key leaked into the client bundle"; exit 1; fi
    # also assert the literal secret value never appears (build injects it only server-side)
    if [ -n "$SUPABASE_SERVICE_ROLE_KEY" ] && grep -rIlF "$SUPABASE_SERVICE_ROLE_KEY" .next/static; then
      echo "::error::service_role value leaked into the client bundle"; exit 1; fi
```
**Recommendation:** Use **all three layers** — `server-only` (fails the build at import time), ESLint (fails lint, fast feedback), and the **bundle grep** (the authoritative CI assertion that nothing leaked into `.next/static`). The bundle grep is the one that literally satisfies "CI-asserted" in FND-03.

### Drizzle table definition shape (Seam 4)
```typescript
// src/lib/db/schema.ts (illustrative — see Schema section for full table list)
import { pgTable, pgEnum, uuid, text, numeric, timestamp, integer, date, boolean, uniqueIndex } from 'drizzle-orm/pg-core';

export const flowType   = pgEnum('flow_type',   ['revenue','cost','investimento','transferencia']);
export const costCenter = pgEnum('cost_center', ['lorenzo','fernanda','shared']);
export const catGroup   = pgEnum('category_group', ['essential','desire','investment']);

export const transactions = pgTable('transactions', {
  id:           uuid('id').primaryKey().defaultRandom(),
  accountId:    uuid('account_id').notNull().references(() => accounts.id),
  bookingDate:  date('booking_date').notNull(),
  amountEur:    numeric('amount_eur', { precision: 14, scale: 2 }).notNull(),
  description:  text('description'),
  flowType:     flowType('flow_type'),
  costCenter:   costCenter('cost_center'),
  categoryId:   uuid('category_id').references(() => categories.id),
  dedupeHash:   text('dedupe_hash').notNull(),
  // ...
}, (t) => [ uniqueIndex('transactions_dedupe_hash_uq').on(t.dedupeHash) ]);
```
[CITED: orm.drizzle.team/docs/get-started/supabase-new]

### `dim_calendar` seed generation (2024–2035)
```typescript
// scripts/gen-calendar.ts → emits rows for 0002_seed.sql (or run via drizzle)
import { eachDayOfInterval, format } from 'date-fns';
const days = eachDayOfInterval({ start: new Date('2024-01-01'), end: new Date('2035-12-31') });
const rows = days.map(d => ({
  date: format(d, 'yyyy-MM-dd'),
  year: d.getFullYear(),
  month: d.getMonth() + 1,
  quarter: Math.floor(d.getMonth() / 3) + 1,
  periodKey: Number(format(d, 'yyyyMM')), // YYYYMM, e.g. 202406
}));
// ~4383 rows; emit as INSERT … VALUES into the custom seed migration.
```
`dim_calendar` columns: `date` (PK), `year`, `month`, `quarter`, `period_key` (YYYYMM int — the join key for MoM/YoY), optionally `is_month_start`/`day_of_month`. MoM = `period_key` vs prior month; YoY = `period_key - 100`.

## Full v1 Schema in Drizzle (Seam 4)

**Migration ordering (one generated + two custom):**
1. **`0000_init`** (generated) — enums → tables → indexes (drizzle-kit emits in dependency order; FKs after referenced tables).
2. **`0001_rls_policies`** (custom SQL) — `ENABLE ROW LEVEL SECURITY` + the allowlist `for all to authenticated` policy on **every** table.
3. **`0002_seed`** (custom SQL) — members, category taxonomy, `dim_calendar`.

**Enums (define once, reuse):**
- `flow_type` = `revenue | cost | investimento | transferencia` (the correctness keystone — only `investimento` feeds €100k; transfers excluded from cost/revenue).
- `cost_center` = `lorenzo | fernanda | shared` (analytical label, not access).
- `category_group` = `essential | desire | investment`.

**Tables (full v1, per D-09):**

| Table | Key columns / notes |
|-------|---------------------|
| `members` | `id`, `email` (unique), `display_name` — seed Lorenzo + Fernanda |
| `accounts` | `id`, `member_id?`, `name`, `kind`, `default_cost_center` (cost_center enum), `currency` (EUR) |
| `connections` | `id`, `account_ref`, `provider`, `expires_at` (Phase 1 stores real consent expiry), `status` |
| `transactions` | `id`, `account_id` FK, `booking_date`, `value_date?`, `amount_eur` numeric(14,2) signed, `description`, `flow_type`, `cost_center`, `category_id` FK, `rule_id?`, `import_batch_id?`, **`dedupe_hash` UNIQUE** |
| `categories` | `id`, `name`, `group` (category_group), `parent_id?` (self-FK for parent/child taxonomy) |
| `rules` | `id`, `priority`/order, `version`, `match` criteria, `set_category`/`set_cost_center`/`set_flow_type` |
| `budgets` | `id`, `cost_center`, `period_key`/month, `amount_eur` |
| `investment_contributions` | `id`, `transaction_id?`, `amount_eur`, `period_key`, `member_id?` — the €4k legs feeding €100k |
| `goals` | `id`, `name`, `target_eur` (100000), `metric` (cost_basis now; swappable Phase 6) |
| `milestones` | `id`, `goal_id` FK, `threshold_eur` (10k/25k/50k/75k/100k), `achieved_at?` |
| `balances` | `id`, `account_id` FK, `as_of_date`, `balance_eur` — daily snapshots (Phase 2 BI-07) |
| `insights` | `id`, `kind` (daily/weekly), `body`, `created_at`, `token_count?` — Phase 5 writer target |
| `dim_calendar` | `date` PK, `year`, `month`, `quarter`, `period_key` (YYYYMM) — seeded 2024–2035 |

**Notes:**
- Defining all 12 + `dim_calendar` now (even ones unused until Phase 5/6) is the locked choice (D-09) so later phases are additive. Empty tables still need RLS (D-11).
- `numeric(14,2)` for all money — never floats.
- `dedupe_hash` UNIQUE is defined now even though ingestion is Phase 1, so the idempotency contract exists from the start.
- Drizzle's `--custom` is also where you'd add any check constraints / partial indexes RLS doesn't cover.

## Runtime State Inventory

> Greenfield phase (no existing system to rename/migrate). This inventory confirms there is no pre-existing runtime state to carry.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — greenfield; Supabase project is new/empty | Create schema + seed (this phase) |
| Live service config | Supabase Auth (Google provider) + Google Cloud OAuth client must be configured **in dashboards** (not in git) (D-14) | Manual one-time dashboard setup; document redirect URLs |
| OS-registered state | None | — |
| Secrets/env vars | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (or `…PUBLISHABLE_KEY`), `SUPABASE_SERVICE_ROLE_KEY` (or `sb_secret_…`), `ALLOWED_EMAILS`, `DATABASE_URL` (Drizzle) — set in Vercel + GitHub + `.env.local` | Provision all; verify `SUPABASE_SERVICE_ROLE_KEY` is **not** `NEXT_PUBLIC_*` |
| Build artifacts | None yet | — |

**Note:** The OAuth client (Google Cloud) + Supabase Auth provider config live in dashboards, not git — a manual checklist item the planner should make an explicit task (with the exact authorized redirect URLs: Supabase callback URL + the Vercel production URL + `http://localhost:3000/auth/callback` for local).

## Common Pitfalls

### Pitfall 1: Drizzle query client used for user reads → RLS bypass
**What goes wrong:** Drizzle connects as the DB owner/`postgres` role, which **bypasses RLS**. Using it to serve dashboard reads returns all rows regardless of the user — the allowlist is silently defeated.
**Why it happens:** "I already have a typed Drizzle client, why not query with it?" The role distinction is invisible until tested with a non-allowlisted identity.
**How to avoid:** Phase 0 — do not create a request-time Drizzle client. All reads via `@supabase/ssr`. Reserve Drizzle for migrations + Phase 1 server-only ingestion writes.
**Warning signs:** A non-allowlisted (or anon) request returns rows; reads work even when RLS policies are intentionally broken in a test.

### Pitfall 2: shadcn `default`/`slate` no longer valid (locked decision drift)
**What goes wrong:** `shadcn init` with `--style default --base-color slate` fails or silently maps elsewhere — the CLI removed `default` (use `new-york`) and dropped `slate` from base colors (now `neutral|stone|zinc|mauve|olive|mist|taupe`).
**How to avoid:** Init with `new-york` + a **neutral-family** base color (recommend `neutral` or `zinc` to match the intended grey). Keep `cssVariables: true`. Document the substitution.
**Warning signs:** CLI prompt doesn't list `slate`/`default`; `components.json` has `style: "new-york"`.

### Pitfall 3: `getSession()` for authorization in server code
**What goes wrong:** `getSession()` reads storage without revalidating the token → a forged/expired token can pass a gate.
**How to avoid:** Use `getUser()` (network-validated) in middleware and any server gate. [CITED: supabase.com/docs/guides/auth/server-side/nextjs]

### Pitfall 4: Transaction-pooler prepared-statement error in migrations/queries
**What goes wrong:** Using the 6543 transaction pooler without `prepare:false` throws on prepared statements.
**How to avoid:** Session pooler (5432) for migrations; if 6543 is used anywhere, set `postgres(url, { prepare: false })`.

### Pitfall 5: `exchangeCodeForSession` not writing cookies (v2.91.0)
**What goes wrong:** Deferred `SIGNED_IN` event means the callback finishes before cookies are written → user appears logged out after Google login.
**How to avoid:** Verify the `@supabase/supabase-js` version behavior; add a post-callback smoke test that the session cookie exists. [CITED: github.com/supabase/supabase-js/issues/2037]

### Pitfall 6: A table shipped without RLS (Pitfall 7 in PITFALLS.md)
**What goes wrong:** A new/empty table (e.g. `insights`, `milestones`) gets created but no RLS policy → leak via anon key, or default-deny lockout.
**How to avoid:** The `0001_rls_policies` migration enables RLS + adds a policy for **every** table; the CI RLS assertion (below) fails if any `public` table has RLS off.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `@supabase/auth-helpers-nextjs` | `@supabase/ssr` | 2024 | Use `createServerClient`/`createBrowserClient` + getAll/setAll cookies |
| Supabase `anon` / `service_role` JWT keys | `sb_publishable_…` / `sb_secret_…` keys | 2025 (new projects default to new keys; legacy removed late 2026) | Verify which key style this project has; secret keys include a browser-detection 401 guard |
| shadcn `default` style, `slate` base color | `new-york` style; base colors `neutral/stone/zinc/mauve/olive/mist/taupe` | 2025 | Substitute on init (A1/A2) |
| Tailwind v3 `tailwind.config.js` | Tailwind v4 CSS-first `@import "tailwindcss"`, blank config in components.json | 2024–25 | No `tailwind.config.js` by default; `@theme` in CSS |
| `@tremor/react` npm package | Tremor Raw copy-paste (Tailwind v4 + Recharts) | ~2024 | No npm dep; copy components, pull `clsx`/`tailwind-merge`/`tailwind-variants`/`recharts` |

**Deprecated/outdated:**
- `@supabase/auth-helpers-nextjs` — replaced by `@supabase/ssr`.
- shadcn `default` style — replaced by `new-york`.
- `@tremor/react@3.18.7` on Tailwind v4/React 19 — frozen; use Tremor Raw.

## Validation Architecture

> nyquist_validation is enabled — this section drives VALIDATION.md.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None present yet (greenfield) — **Wave 0 gap**. Recommend **Vitest** for unit/integration + a few SQL assertions run via `psql`/`postgres-js`; optionally **Playwright** for the one end-to-end auth-gate check. |
| Config file | none — create `vitest.config.ts` in Wave 0 |
| Quick run command | `pnpm vitest run` |
| Full suite command | `pnpm lint && pnpm build && pnpm vitest run && pnpm test:rls` |

### Phase Requirements → Test Map
| Req | Behavior to prove | Test type | Cheapest reliable assertion | Exists? |
|-----|-------------------|-----------|-----------------------------|---------|
| FND-01 | Allowlisted Google login reaches a protected page; non-allowlisted is blocked/signed out | e2e (Playwright) or manual | Manual check in MVP (real Google SCA is hard to automate); add a unit test of `isAllowed()` + a middleware unit test that a non-allowlisted user is redirected | ❌ Wave 0 |
| FND-02a | Every `public` table has RLS enabled | SQL assertion (CI) | `select count(*) from pg_tables where schemaname='public' and rowsecurity=false` **must be 0** | ❌ Wave 0 |
| FND-02b | Non-allowlisted identity → zero rows | SQL/integration | Query each table with a JWT whose email ∉ allowlist (or `set request.jwt.claims`) → assert 0 rows; allowlisted JWT → rows | ❌ Wave 0 |
| FND-02c | All app routes require auth | middleware unit / e2e | Unauthenticated request to a protected path → 307 redirect to `/login` | ❌ Wave 0 |
| FND-03 | `service_role` absent from client bundle | CI grep/bundle scan | `grep -r SUPABASE_SERVICE_ROLE_KEY .next/static` returns nothing; ESLint guard passes; `server-only` build succeeds | ❌ Wave 0 |
| FND-04a | Schema push succeeded (tables exist) | SQL assertion | `select to_regclass('public.transactions')` (and each table) is not null | ❌ Wave 0 |
| FND-04b | Calendar dimension seeded for 2024–2035 | SQL assertion | `select count(*) from dim_calendar` ≈ **4383** (days) **and** `select count(distinct period_key)` = **144** (12 yrs × 12 mo); min/max `period_key` = 202401/203512 | ❌ Wave 0 |
| FND-04c | Members + taxonomy seeded | SQL assertion | `select count(*) from members` = 2; categories include the 3 groups with parents | ❌ Wave 0 |
| FND-05 | App deployed & reachable on Vercel | manual / smoke | `curl -I <vercel-url>` → 200/redirect; `/login` renders | ❌ Wave 0 |
| FND-06 | Tremor Raw, not `@tremor/react` | static assertion | `grep '@tremor/react' package.json` returns nothing; a copied Tremor Raw chart renders | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm lint` + `pnpm vitest run` (fast).
- **Per wave merge:** full suite incl. `pnpm build` + bundle grep + SQL/RLS assertions.
- **Phase gate:** full suite green + the **manual** allowlisted-login e2e walkthrough (real Google) before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `vitest.config.ts` + Vitest install — no test infra exists.
- [ ] `test/rls.assert.sql` (or a postgres-js script) — RLS-on-every-table + zero-rows-for-non-allowlisted + seed counts.
- [ ] `test/middleware.test.ts` — unauthenticated redirect + non-allowlisted sign-out.
- [ ] `test/allowlist.test.ts` — `isAllowed()` parsing of `ALLOWED_EMAILS`.
- [ ] CI workflow `.github/workflows/ci.yml` — lint + build + bundle grep + SQL assertions.
- [ ] (Optional) Playwright for the one auth-gate e2e; otherwise document the manual walkthrough.

## Security Domain

> security_enforcement enabled (default). This phase **establishes** the security boundary, so it is central.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Supabase Auth (Google OAuth, PKCE); no passwords stored locally |
| V3 Session Management | yes | `@supabase/ssr` httpOnly cookie sessions; middleware refresh via `getUser()` |
| V4 Access Control | yes | RLS allowlist on every table + middleware route protection (defense in depth) |
| V5 Input Validation | partial | `zod` for env/inputs (light in Phase 0; heavier Phase 1 on bank payloads) |
| V6 Cryptography | yes (don't hand-roll) | Supabase manages JWT signing; never construct/verify tokens manually; `service_role` server-only |
| V7 Error/Logging | yes | Never log the `service_role` key or full session tokens; redact in CI logs |

### Known Threat Patterns for this stack
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| `service_role` key leaked to browser | Information Disclosure / Elevation | `server-only` + ESLint guard + CI bundle grep; never `NEXT_PUBLIC_*` (FND-03) |
| RLS disabled/permissive on a table | Information Disclosure | RLS on every table + CI assertion `rowsecurity=true` for all `public` tables |
| Allowlist enforced only in app code | Elevation of Privilege | Enforce allowlist in the RLS policy **and** middleware |
| Forged/expired session passes a gate | Spoofing | `getUser()` (network-validated) not `getSession()` for authz |
| Open redirect via OAuth `redirectTo` | Tampering | Whitelist redirect URLs in Supabase + Google Console; validate `origin` |
| Secrets committed to git | Information Disclosure | `.env.local` git-ignored; Vercel/GitHub encrypted secrets only |

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | scaffold/build | ✓ (assumed) | ≥20 required (D-02) | — |
| pnpm | package mgmt (D-02) | likely | latest | npm (not preferred) |
| Supabase project | Auth/DB/RLS | ⚠ must be created | — | none — blocking; create project + Google OAuth client (manual, D-14) |
| Google Cloud OAuth client | Google sign-in | ⚠ must be created | — | none — blocking for FND-01 |
| `DATABASE_URL` (Postgres conn string) | Drizzle migrations | ⚠ from Supabase dashboard | Session pooler 5432 | Transaction pooler 6543 + `prepare:false` |
| Vercel account + GitHub repo | deploy (FND-05) | ⚠ must be linked | Hobby | none — blocking for FND-05 |

**Missing dependencies with no fallback (planner must make explicit tasks):**
- Supabase project creation + Google OAuth provider config (dashboard).
- Google Cloud OAuth client (authorized redirect URIs: Supabase callback + Vercel URL + localhost).
- Vercel project linked to the GitHub repo with all env vars set.

**Note (verified):** This environment is the researcher's sandbox; the above availability is inferred. The planner should add a "provision external services" task with the dashboard checklist rather than assume they exist.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | shadcn `default` style is removed; only `new-york` is valid | Pitfall 2 / Stack | Init fails or produces unexpected style; planner must substitute `new-york`. Verified against shadcn docs — LOW risk. |
| A2 | shadcn base color `slate` is no longer offered (now `neutral/stone/zinc/mauve/olive/mist/taupe`); recommend `neutral`/`zinc` | Pitfall 2 | Visual tone differs slightly from "slate"; intent (neutral grey) preserved. Verified against components.json docs — LOW risk. |
| A3 | New Supabase projects issue `sb_publishable_…`/`sb_secret_…` keys instead of `anon`/`service_role`; the locked env names may need to map to new keys | User Constraints / State of the Art | If this project's Supabase instance still uses legacy keys, the locked names work as-is; if new keys, the planner must map `NEXT_PUBLIC_SUPABASE_ANON_KEY`→publishable and `SUPABASE_SERVICE_ROLE_KEY`→secret. Verified against Supabase docs — MEDIUM (depends on when the project was created). |
| A4 | Recharts current major is 3.x (STACK.md cited 2.x); Tremor Raw current blocks target the installed Recharts | Stack | A version mismatch between a copied Tremor Raw block and installed Recharts could need a small adjustment. Confirm at copy time in Phase 2. LOW for Phase 0 (no charts rendered yet). |
| A5 | Hardcoding the 2 emails in the RLS policy (vs an allowlist table) is the right Phase-0 choice | Pattern 3 | If the list grows, policies need editing; acceptable for 2 trusted users (locked scope). LOW. |
| A6 | A direct `DATABASE_URL` (beyond the locked 4 env vars) is required for Drizzle | User Constraints / Seam 1 | Without it Drizzle can't migrate; trivially obtained from the Supabase dashboard. LOW. |
| A7 | The exact per-table field shapes follow PROJECT.md/master spec (not fully enumerated here) | Schema section | Minor column differences; the planner/discuss-phase should confirm field lists against the master spec before writing `schema.ts`. MEDIUM. |

## Open Questions

1. **Which Supabase key style does the (to-be-created) project use?**
   - What we know: new projects (2025+) default to `sb_publishable_`/`sb_secret_`; legacy `anon`/`service_role` still work until late 2026.
   - What's unclear: when this project's Supabase instance is/was created.
   - Recommendation: create the project, read the dashboard's API keys page, map env vars accordingly (A3). Keep the locked env-var *names* as aliases to whichever key value is issued.

2. **Exact column shapes for the 12 tables.**
   - What we know: table list + key columns (D-09) and the enums.
   - What's unclear: full field lists per table (the master spec in PROJECT.md governs).
   - Recommendation: planner enumerates each table's columns from the master data model before authoring `schema.ts` (A7).

3. **Allowlist table vs hardcoded emails in the RLS policy.**
   - What we know: 2 trusted users, locked scope, both see everything.
   - Recommendation: hardcode in the policy for Phase 0; revisit only if the list grows (A5).

## Sources

### Primary (HIGH confidence)
- Supabase — Server-Side Auth / Next.js (`@supabase/ssr`, getUser vs getSession, middleware): https://supabase.com/docs/guides/auth/server-side/nextjs
- Supabase — Login with Google (OAuth, exchangeCodeForSession): https://supabase.com/docs/guides/auth/social-login/auth-google
- Supabase — API keys (publishable/secret vs legacy anon/service_role): https://supabase.com/docs/guides/getting-started/api-keys , .../migrating-to-new-api-keys
- Supabase — Connect to Postgres (Session 5432 / Transaction 6543 pooler, IPv4): https://supabase.com/docs/guides/database/connecting-to-postgres
- Supabase — Row Level Security (allowlist via `auth.jwt()->>'email'`, `(select …)` perf): https://supabase.com/docs/guides/database/postgres/row-level-security
- Drizzle — Supabase get-started (postgres-js, prepare:false, drizzle.config, push vs migrate): https://orm.drizzle.team/docs/get-started/supabase-new
- Drizzle — RLS (pgPolicy, supabase roles, authUid): https://orm.drizzle.team/docs/rls
- Drizzle — generate `--custom` (hand-written SQL migrations, ordering): https://orm.drizzle.team/docs/drizzle-kit-generate
- shadcn/ui — components.json (valid baseColor values; `new-york` only; cssVariables): https://ui.shadcn.com/docs/components-json , https://ui.shadcn.com/docs/tailwind-v4
- ESLint — no-restricted-imports (patterns/group/message): https://eslint.org/docs/latest/rules/no-restricted-imports
- npm registry — all package versions verified 2026-06-21

### Secondary (MEDIUM confidence)
- supabase-js v2.91.0 exchangeCodeForSession cookie-write breaking change: https://github.com/supabase/supabase-js/issues/2037
- Project research: `.planning/research/STACK.md`, `ARCHITECTURE.md`, `PITFALLS.md` (locked stack, three-plane model, RLS/service_role pitfalls)

### Tertiary (LOW confidence)
- Community guides (shadcn + Tailwind v4 + Next 15 setup walkthroughs) — used only to corroborate official docs.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every version verified against npm; clients/patterns from official docs.
- Architecture (Drizzle↔RLS↔ssr split): HIGH — the RLS-bypass-by-Drizzle reasoning is confirmed by Supabase/Drizzle role docs; recommendation is unambiguous.
- Auth + allowlist: HIGH — official Supabase SSR + Google docs; one MEDIUM caveat (v2.91.0 cookie timing).
- service_role CI guard: HIGH — `server-only` + ESLint + bundle grep are all standard and composable.
- shadcn/Tremor specifics: HIGH (shadcn verified against docs; Tremor Raw mechanics from STACK.md + Tremor docs — exact per-component deps confirmed at copy time, A4).

**Research date:** 2026-06-21
**Valid until:** ~2026-07-21 (30 days; Supabase key migration and Next 16 adoption are the fastest-moving items — re-verify key naming and the supabase-js cookie fix before execution).
