<!-- GSD:project-start source:PROJECT.md -->

## Project

**Finance BI — Lorenzo & Fernanda**

A personal business-intelligence web app for a couple in Berlin who run their household finances **like a business**: salaries are *revenue*, expenses are *cost centers* (Lorenzo / Fernanda / Shared) each with individual budgets, and a fixed **€4,000/month pay-yourself-first contribution** drives the north-star goal of **€100,000 invested**. Bank data arrives automatically once a day via open banking (Enable Banking), is categorized into a fixed, comparable taxonomy, and is surfaced as KPI dashboards — desktop for Lorenzo (technical), mobile-first PWA for Fernanda (non-technical).

The product must answer four questions in **under a minute**: how far to €100k, did we hit €4k this month, did either person blow their budget, and what's the margin (revenue − investment − costs).

**Core Value:** **Show, at a glance and with trustworthy automatic data, exactly how far the couple is from €100k invested — and whether this month's money behaved like a healthy business.** Everything else can degrade; this single answer must always be correct and comparable across months.

### Constraints

- **Tech stack (fixed)**: Next.js (App Router) + TypeScript + Tailwind + Tremor (charts) + Recharts (custom) — chosen, not open for debate
- **Auth + DB (fixed)**: Supabase (Postgres + Google Auth + RLS on all tables) — allowlist of 2 emails
- **PWA (fixed)**: Serwist (`@serwist/next`)
- **Deploy (fixed)**: Vercel Hobby (free), free subdomain
- **Ingestion (fixed)**: Enable Banking (AISP) + GitHub Actions daily cron; pull-only (PSD2, no webhooks)
- **AI (fixed)**: Claude — daily digest + weekly report writing to an `insights` table; manual-first to avoid metered-credit spend
- **Language**: TypeScript everywhere; **all documentation in English**
- **Currency**: EUR only in MVP; FX/multicurrency deferred to Phase 6
- **Security**: secrets only in env/secrets; `service_role` never reaches the client; all data behind login
- **Process**: "done before perfect" — each phase delivers value on its own; one phase at a time
- **Phase structure (intended)**: 0 Foundation · 1 Ingestion (Enable Banking) · 2 Core BI + house-as-business · 3 €100k Goal · 4 PWA · 5 AI · 6 ETF Valuation + multicurrency · 7 Reminders

<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->

## Technology Stack

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| **Next.js (App Router)** | `15.x` (pin) — `16.x` is current stable | Full-stack React framework: UI + Route Handlers (server) for the API surface and Supabase server clients | Locked. App Router + Route Handlers give a clean server boundary to keep `service_role` off the client. **Recommendation: pin to Next 15 (LTS-feel, every dependency below is proven on it).** Next 16 is GA (16.2.x) but adopting it on day 0 risks churn for zero MVP benefit. (HIGH) |
| **React** | `19.x` | UI runtime | Stable, the default for Next 15/16. (HIGH) |
| **TypeScript** | `5.x` (≥5.5) | Types everywhere (locked) | Strict mode on; share generated Supabase DB types between Route Handlers, the GitHub Action, and the UI. (HIGH) |
| **Tailwind CSS** | `v4.x` | Styling (locked) | v4 is stable and the default in Tremor's own current templates and Next 15/16 scaffolds. Note the v4 migration (`@import "tailwindcss"`, CSS-first config, no `tailwind.config.js` by default). (HIGH) |
| **Supabase** | Postgres 15+, `@supabase/supabase-js` `2.x`, `@supabase/ssr` `0.x` | Postgres + Google Auth + RLS (locked) | Use `@supabase/ssr` (the cookie-based server/client helper) — **not** the deprecated `@supabase/auth-helpers-nextjs`. RLS on every table enforces the 2-email allowlist. (HIGH) |
| **Enable Banking API** | REST, JWT (RS256) auth | AISP open-banking ingestion (locked) | Restricted Production mode connects your *own* Revolut accounts for free, no signed contract. Called from a daily GitHub Action — see the dedicated section below. (HIGH) |
| **Vercel Hobby** | Free tier | Deploy target (locked) | Hosts the Next app on a free subdomain. **Do not run ingestion on Vercel cron** (Hobby cron is limited/unsuitable and would need `service_role` in the Vercel runtime) — ingestion lives in GitHub Actions. (HIGH) |
| **Anthropic Claude** | `@anthropic-ai/sdk` `0.x`, model `claude-haiku-4-5` | AI daily digest → `insights` table (locked, Phase 5) | `claude-haiku-4-5` is the cheapest current Haiku at **$1 / $5 per MTok** (in/out). Runs from a GitHub Action and draws **metered API credits** (not the interactive subscription) — keep prompts tiny, manual-first. (HIGH) |

### Charting (locked: Tremor + Recharts) — READ THIS

| Technology | Version | Purpose | Why / Sharp edge |
|------------|---------|---------|------------------|
| **Recharts** | `3.x` (pin `3.8.1`) | Custom/bespoke charts (locked) | The composable primitive everything else sits on. Tremor Raw **and** shadcn's official charts are both built on Recharts. **Phase 0 installed `^3.8.1`; standardized on Recharts 3.x (shadcn charts are Recharts-3-native, PR #8486) — corrected from the planning-time "2.x" on 2026-06-23 (Phase-2 UI-SPEC). Recharts-3 paste rules: use `var(--chart-1)` not `hsl(var(--chart-1))`; give `ChartContainer` a height.** (HIGH) |
| **Tremor** | see note | KPI cards + standard dashboard charts (locked) | **The npm package `@tremor/react` is effectively frozen — last published `3.18.7` ~a year ago and not updated for React 19 / Tailwind v4.** Tremor's *active* product is **"Tremor Raw"** (`tremor.so`): copy-paste components using **plain Tailwind v4 + Recharts**, no npm dependency, no custom color tokens. **Recommendation: satisfy the "Tremor" constraint via Tremor Raw copy-paste blocks**, which keeps you on Tailwind v4 + React 19 and avoids a peer-dependency dead end. If the team insists on `@tremor/react`, it forces Tailwind **v3** and React 18 — a hard pin that conflicts with the rest of this stack. (HIGH — this is the single most important stack nuance.) |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@supabase/ssr` | `0.6.x` | Cookie-based Supabase client for App Router (server + browser) | Always — replaces deprecated auth-helpers. Server client in Route Handlers + middleware; browser client in client components. |
| `@supabase/supabase-js` | `2.x` | Core Supabase client | Used by `@supabase/ssr`; also the client the GitHub Action uses with the `service_role` key. |
| `jose` | `5.x` / `6.x` | Sign the RS256 JWT for Enable Banking | In the GitHub Action only. Pure-ESM, zero-dep, supports `RS256` and custom `kid` header — cleaner than `jsonwebtoken` for this. |
| `@serwist/next` + `serwist` | `9.5.x` (both) | PWA / service worker (locked, Phase 4) | `npm i @serwist/next && npm i -D serwist`. Works with Next App Router via `withSerwistInit` in `next.config`; SW entry at `app/sw.ts`. Defer to Phase 4. |
| `@anthropic-ai/sdk` | `0.x` (latest) | Claude API client (Phase 5) | In the AI GitHub Action only. `client.messages.create({ model: "claude-haiku-4-5", ... })`. |
| `zod` | `3.x` / `4.x` | Validate Enable Banking responses + Route Handler inputs | Recommended companion: bank payloads are external/untrusted; validate before writing to Postgres. |
| `date-fns` | `3.x` | Month-grain bucketing, `valid_until` math, MoM/YoY periods | Lightweight; the project's comparability/calendar-dimension logic needs reliable date handling. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Supabase CLI | Local migrations, generate TS types | `supabase gen types typescript --linked > src/lib/database.types.ts` — share types across UI, Route Handlers, and the Action. |
| GitHub Actions | Daily ingestion cron + AI digest cron | `schedule: cron` for daily pull. Doubles as the Supabase free-tier keep-alive. Secrets: Enable Banking app id + private key, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`. |
| ESLint + Prettier | Lint/format | `next lint` (Next 15) — note Next 16 changes the lint story; another reason to pin 15 for MVP. |

## Installation

# Core app (run create-next-app first; choose App Router + TS + Tailwind)

# Charting (Recharts is the npm dep; Tremor via copy-paste "Tremor Raw" blocks)

# Validation + dates

# PWA (Phase 4)

# GitHub Action deps (separate package.json in the action, or a tsx script)

## Enable Banking — Auth, Consent Lifecycle & the GitHub Actions Pattern

### 1. Registration & keys

### 2. Auth model (JWT, RS256)

- **Header:** `{ "typ": "JWT", "alg": "RS256", "kid": "<application id>" }`
- **Claims:** `iss: "enablebanking.com"`, `aud: "api.enablebanking.com"`, `iat: <now>`, `exp: <iat + 3600>` (max TTL allowed is 86400s / 24h — use 1h).
- No OAuth client-secret exchange for the app itself; the JWT *is* the app credential. Use `jose` to sign.

### 3. Consent / SCA flow (one-time interactive, then headless pulls)

### 4. 90-day consent lifecycle (the operational reality)

- Under PSD2 RTS Art. 10, **AIS consent must be re-confirmed periodically** — historically 90 days; EU refresh tokens are now commonly issued for **180 days**, but the safe design assumption is a **90-day reconnect cadence**.
- **Transactions older than 90 days are only reachable in the first ~5 minutes after authorization** — which is fine because the MVP is **go-forward only** (no historical backfill).
- Track expiry in `connections.expires_at`; surface a **reconnect prompt** on the Config page (the Phase 7 reminder builds on this). When consent lapses, the daily pull will 401/403 — handle gracefully and flag, don't crash the cron.

### 5. GitHub Actions ingestion pattern (pull-only, no webhooks)

# .github/workflows/ingest.yml

## Supabase — RLS Allowlist, service_role, Google OAuth (concrete)

### 2-email allowlist via RLS (enable on EVERY table)

- Wrap `auth.jwt()` in `(select …)` for the Postgres planner (initplan caching) — Supabase's documented performance pattern.
- Cost center is an **analytical label, not an access boundary** (per PROJECT.md): both users see all rows; RLS only gates "is this one of the 2 allowed emails."

### service_role: strictly server-side

- The `service_role` key **bypasses RLS**. It must only ever live in: the **GitHub Action** (ingestion + AI) and, if needed, **Next Route Handlers** (server) — **never** in a client component, `NEXT_PUBLIC_*` env, or the browser bundle.
- In the browser/client components use only the **anon** key via `@supabase/ssr`; RLS + the user's JWT do the enforcement.

### Google OAuth

- Enable the Google provider in Supabase Auth; register an OAuth client in Google Cloud Console; set Supabase callback URL + the Vercel site URL as authorized redirect/origins.
- Use `@supabase/ssr` for the cookie-based session in App Router (server client in middleware to refresh, browser client for `signInWithOAuth`). The allowlist RLS makes Google "anyone can log in" safe — non-allowlisted emails authenticate but see zero rows.

## Claude / AI (Phase 5) — metered credits, cheapest model

- **Model:** `claude-haiku-4-5` — cheapest current Haiku, **$1 / $5 per MTok** (input/output), 200K context. Use it for the tiny daily digest.
- **Cost model:** running `claude -p`, the Agent SDK, or `@anthropic-ai/sdk` from a GitHub Action draws from **metered API credits** (an `ANTHROPIC_API_KEY` billing pool), *not* the interactive Claude subscription. Keep prompts tiny, manual-first (PROJECT.md decision).
- **Pattern:** Action reads a small daily aggregate from Postgres → one `messages.create` (Haiku, small `max_tokens`) → write the text to the `insights` table via `service_role`. No streaming needed.
- Do NOT default to Opus/Sonnet for this job — the digest is a cost-sensitive, low-stakes summary; Haiku is the right tier.

## PWA / Serwist (Phase 4)

- `@serwist/next` `9.5.x` + `serwist` `9.5.x` (dev dep). Wrap config with `withSerwistInit({ swSrc: "app/sw.ts", swDest: "public/sw.js", ... })`; SW entry uses `defaultCache` from `@serwist/next/worker`.
- Mobile-first install target for Fernanda. "Offline-tolerant" = precache shell + offline fallback route; the data is server-rendered/fetched, so offline is best-effort, not full offline DB. Defer entirely to Phase 4.

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Tremor Raw (copy-paste, Tailwind v4 + Recharts) | `@tremor/react` npm package | Only if you accept pinning Tailwind **v3** + React 18 for the whole app — not advised here. |
| `@supabase/ssr` | `@supabase/auth-helpers-nextjs` | Never for new code — auth-helpers is deprecated/superseded by `@supabase/ssr`. |
| GitHub Actions cron (ingestion) | Vercel Cron / webhooks | Never under this design: PSD2 is pull-only (no webhooks), and Vercel Hobby cron is limited and would expose `service_role` in the Vercel runtime. |
| `jose` (RS256 signing) | `jsonwebtoken` | `jsonwebtoken` works but `jose` is ESM-first, lighter, and clearer for setting the `kid` header. |
| Next.js 15 (pinned) | Next.js 16 (current) | Adopt 16 post-MVP once the toolchain (lint, plugins) settles; no MVP feature requires it. |
| `claude-haiku-4-5` | `claude-sonnet-4-6` | Only if digest quality proves insufficient — unlikely for a tiny structured summary; revisit in Phase 5. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `service_role` key in any client component / `NEXT_PUBLIC_*` / browser bundle | Bypasses RLS → total data exposure | anon key + RLS in browser; `service_role` only in GitHub Action / Route Handlers |
| Webhook-based / real-time bank ingestion | PSD2 AISP is **pull-only**; no webhooks exist for this flow | Daily GitHub Actions cron pull |
| `@supabase/auth-helpers-nextjs` | Deprecated | `@supabase/ssr` |
| `@tremor/react` on Tailwind v4 / React 19 | Package is frozen at 3.18.7, peer-deps target Tailwind v3 / React 18 | Tremor Raw copy-paste blocks (plain Tailwind v4 + Recharts) |
| Vercel Cron for ingestion (Hobby) | Limited frequency/runtime; would need `service_role` in Vercel | GitHub Actions cron |
| Historical backfill via API | Transactions >90 days only reachable in first ~5 min post-auth | Go-forward only (matches PROJECT.md) |
| Opus/Sonnet for the daily digest | Overkill, ~5–25× the cost of Haiku | `claude-haiku-4-5` |

## Stack Patterns by Variant

- Then you must accept Tailwind v3 + React 18 across the app (`@tremor/react@3.18.7`).
- Because the npm package has not shipped v4/React-19 support and its peer deps will fight the rest of the stack. (Not recommended.)
- You may capture live positions earlier.
- Because PSD2 usually excludes investment accounts — but if it appears in `GET /aspsps`/`/sessions`, it could feed Phase 6 sooner. Default assumption: it is NOT exposed (PROJECT.md aligns).

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| Next.js 15.x | React 19, Tailwind v4 | The pinned MVP baseline; all libs below proven here. |
| `@serwist/next` 9.5.x | `serwist` 9.5.x, Next 14/15 | Keep both serwist packages on the same 9.5.x minor. |
| `@tremor/react` 3.18.7 | Tailwind **v3**, React 18 only | Why we prefer Tremor Raw instead. |
| Tremor Raw blocks | Tailwind v4, React 19, Recharts 3.x | No npm dep; plain Tailwind utility classes. shadcn official charts are also Recharts 3 (PR #8486). |
| `@supabase/ssr` 0.6.x | `@supabase/supabase-js` 2.x, Next App Router | Cookie-based; pair in middleware + server/browser clients. |
| `@anthropic-ai/sdk` 0.x | `claude-haiku-4-5` | Pin the model id string exactly; no date suffix. |

## Sources

- Enable Banking Docs — Quick Start (JWT RS256, `kid`/`aud`/`iat`/`exp`, `/auth` → `/sessions` → `/accounts/{id}/transactions|balances`): https://enablebanking.com/docs/api/quick-start/ — HIGH
- Enable Banking Docs — Linked accounts / Restricted Production (link own accounts free, restricted to linked accounts): https://enablebanking.com/docs/api/linked-accounts/ — HIGH
- Enable Banking Docs — API reference: https://enablebanking.com/docs/api/reference/ — HIGH
- PSD2 90-day / 180-day re-auth + ">90 days only in first minutes": Yapily, GoCardless, Revolut Open Banking docs — HIGH (general PSD2), MEDIUM (exact Revolut ceiling — confirm at setup)
- Supabase — Row Level Security (allowlist via `auth.jwt()->>'email'`, service_role bypasses RLS / server-only): https://supabase.com/docs/guides/database/postgres/row-level-security — HIGH
- Serwist — `@serwist/next` getting started + npm (v9.5.x, `withSerwistInit`, `app/sw.ts`): https://serwist.pages.dev/docs/next/getting-started , https://www.npmjs.com/package/@serwist/next — HIGH
- Tremor — npm `@tremor/react` (3.18.7, ~1yr old) vs Tremor Raw (copy-paste, Tailwind v4 + Recharts): https://www.npmjs.com/package/@tremor/react , https://www.tremor.so/ — HIGH
- Next.js — version 15 stable / React 19 / Tailwind v4 (and 16.x current): https://nextjs.org/blog/next-15 — HIGH
- Anthropic Claude model catalog & pricing (`claude-haiku-4-5` $1/$5 per MTok; metered API credits) — via claude-api skill, June 2026 — HIGH

<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->

## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->

## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->

## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->

## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:

- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->

## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
