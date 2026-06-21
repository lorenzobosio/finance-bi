# Stack Research

**Domain:** Personal-finance BI web app with open-banking (PSD2/AISP) ingestion — a couple's "household-as-a-business" dashboard
**Researched:** 2026-06-21
**Confidence:** HIGH (versions verified against official docs / npm / Anthropic skill, June 2026)

> Scope note: The stack is **already locked** (see `.planning/PROJECT.md` → Constraints). This document does **not** re-litigate those choices — it makes them implementation-ready: current stable versions, the canonical companion libraries to pair with each locked piece, and the sharp edges that need a specific decision. Where a locked choice has a "today's reality" twist (most notably Tremor), it is flagged explicitly.

---

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
| **Recharts** | `2.x` | Custom/bespoke charts (locked) | The composable primitive everything else sits on. Tremor's charts are themselves built on Recharts, so the two are naturally compatible. (HIGH) |
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

```bash
# Core app (run create-next-app first; choose App Router + TS + Tailwind)
npm install @supabase/supabase-js @supabase/ssr

# Charting (Recharts is the npm dep; Tremor via copy-paste "Tremor Raw" blocks)
npm install recharts

# Validation + dates
npm install zod date-fns

# PWA (Phase 4)
npm install @serwist/next
npm install -D serwist

# GitHub Action deps (separate package.json in the action, or a tsx script)
npm install jose @supabase/supabase-js @anthropic-ai/sdk
```

---

## Enable Banking — Auth, Consent Lifecycle & the GitHub Actions Pattern

This is the highest-uncertainty area, so it is spelled out concretely. (Confidence: HIGH on auth/endpoints/Restricted-Production; MEDIUM on the exact `valid_until` ceiling for Revolut specifically — confirm at setup.)

### 1. Registration & keys
1. Sign up at `enablebanking.com`, open the Control Panel → register an **application as Production** (not sandbox).
2. Registration generates a **private RSA key** (`.pem`, named with the application id). Store it as a **GitHub Actions secret** — it never touches the client or Vercel.
3. The application id becomes the JWT `kid`.

### 2. Auth model (JWT, RS256)
Every API request carries `Authorization: Bearer <jwt>`. The JWT is signed locally with the private key on each run:
- **Header:** `{ "typ": "JWT", "alg": "RS256", "kid": "<application id>" }`
- **Claims:** `iss: "enablebanking.com"`, `aud: "api.enablebanking.com"`, `iat: <now>`, `exp: <iat + 3600>` (max TTL allowed is 86400s / 24h — use 1h).
- No OAuth client-secret exchange for the app itself; the JWT *is* the app credential. Use `jose` to sign.

### 3. Consent / SCA flow (one-time interactive, then headless pulls)
1. `GET /aspsps?country=DE` → confirm Revolut is exposed (and **which** Revolut accounts — the investment pocket may not appear under PSD2).
2. `POST /auth` with `access.valid_until` (ISO 8601 consent expiry), `aspsp.{name,country}`, `psu_type: "personal"`, `state` (UUID), `redirect_url` (whitelisted) → returns a bank redirect URL.
3. User completes **SCA** at Revolut; bank redirects back with a `code`.
4. `POST /sessions` with the `code` → returns `session_id` + an `accounts[]` list of account UIDs. **Persist these.**
5. Headless daily pulls: `GET /accounts/{uid}/transactions` and `GET /accounts/{uid}/balances`.

> Steps 1–4 are interactive (done once via a local helper / one-off page). The GitHub Action only does step 5 + JWT signing.

### 4. 90-day consent lifecycle (the operational reality)
- Under PSD2 RTS Art. 10, **AIS consent must be re-confirmed periodically** — historically 90 days; EU refresh tokens are now commonly issued for **180 days**, but the safe design assumption is a **90-day reconnect cadence**.
- **Transactions older than 90 days are only reachable in the first ~5 minutes after authorization** — which is fine because the MVP is **go-forward only** (no historical backfill).
- Track expiry in `connections.expires_at`; surface a **reconnect prompt** on the Config page (the Phase 7 reminder builds on this). When consent lapses, the daily pull will 401/403 — handle gracefully and flag, don't crash the cron.

### 5. GitHub Actions ingestion pattern (pull-only, no webhooks)
```yaml
# .github/workflows/ingest.yml
on:
  schedule: [{ cron: "0 5 * * *" }]   # daily; also keeps Supabase free tier warm
  workflow_dispatch: {}
jobs:
  ingest:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npx tsx scripts/ingest.ts
        env:
          ENABLE_BANKING_APP_ID: ${{ secrets.ENABLE_BANKING_APP_ID }}
          ENABLE_BANKING_PRIVATE_KEY: ${{ secrets.ENABLE_BANKING_PRIVATE_KEY }}
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
```
The `ingest.ts` script: sign JWT (`jose`) → for each stored account UID, `GET …/transactions` → compute `dedupe_hash` (account + date + amount + normalized description + bank id) → **upsert** into Postgres via `@supabase/supabase-js` initialized with the **`service_role`** key (server-side only). Idempotent by design.

---

## Supabase — RLS Allowlist, service_role, Google OAuth (concrete)

### 2-email allowlist via RLS (enable on EVERY table)
```sql
alter table public.transactions enable row level security;

create policy "allowlist_read" on public.transactions
  for select to authenticated
  using ((select auth.jwt() ->> 'email') = any (array['lorenzo@example.com','fernanda@example.com']));
-- repeat for insert/update/delete as needed; apply the same predicate to every table.
```
- Wrap `auth.jwt()` in `(select …)` for the Postgres planner (initplan caching) — Supabase's documented performance pattern.
- Cost center is an **analytical label, not an access boundary** (per PROJECT.md): both users see all rows; RLS only gates "is this one of the 2 allowed emails."

### service_role: strictly server-side
- The `service_role` key **bypasses RLS**. It must only ever live in: the **GitHub Action** (ingestion + AI) and, if needed, **Next Route Handlers** (server) — **never** in a client component, `NEXT_PUBLIC_*` env, or the browser bundle.
- In the browser/client components use only the **anon** key via `@supabase/ssr`; RLS + the user's JWT do the enforcement.

### Google OAuth
- Enable the Google provider in Supabase Auth; register an OAuth client in Google Cloud Console; set Supabase callback URL + the Vercel site URL as authorized redirect/origins.
- Use `@supabase/ssr` for the cookie-based session in App Router (server client in middleware to refresh, browser client for `signInWithOAuth`). The allowlist RLS makes Google "anyone can log in" safe — non-allowlisted emails authenticate but see zero rows.

---

## Claude / AI (Phase 5) — metered credits, cheapest model

- **Model:** `claude-haiku-4-5` — cheapest current Haiku, **$1 / $5 per MTok** (input/output), 200K context. Use it for the tiny daily digest.
- **Cost model:** running `claude -p`, the Agent SDK, or `@anthropic-ai/sdk` from a GitHub Action draws from **metered API credits** (an `ANTHROPIC_API_KEY` billing pool), *not* the interactive Claude subscription. Keep prompts tiny, manual-first (PROJECT.md decision).
- **Pattern:** Action reads a small daily aggregate from Postgres → one `messages.create` (Haiku, small `max_tokens`) → write the text to the `insights` table via `service_role`. No streaming needed.
- Do NOT default to Opus/Sonnet for this job — the digest is a cost-sensitive, low-stakes summary; Haiku is the right tier.

---

## PWA / Serwist (Phase 4)

- `@serwist/next` `9.5.x` + `serwist` `9.5.x` (dev dep). Wrap config with `withSerwistInit({ swSrc: "app/sw.ts", swDest: "public/sw.js", ... })`; SW entry uses `defaultCache` from `@serwist/next/worker`.
- Mobile-first install target for Fernanda. "Offline-tolerant" = precache shell + offline fallback route; the data is server-rendered/fetched, so offline is best-effort, not full offline DB. Defer entirely to Phase 4.

---

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

**If the team wants real Tremor components without copy-paste:**
- Then you must accept Tailwind v3 + React 18 across the app (`@tremor/react@3.18.7`).
- Because the npm package has not shipped v4/React-19 support and its peer deps will fight the rest of the stack. (Not recommended.)

**If Revolut's investment pocket is exposed via Enable Banking (confirm at setup):**
- You may capture live positions earlier.
- Because PSD2 usually excludes investment accounts — but if it appears in `GET /aspsps`/`/sessions`, it could feed Phase 6 sooner. Default assumption: it is NOT exposed (PROJECT.md aligns).

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| Next.js 15.x | React 19, Tailwind v4 | The pinned MVP baseline; all libs below proven here. |
| `@serwist/next` 9.5.x | `serwist` 9.5.x, Next 14/15 | Keep both serwist packages on the same 9.5.x minor. |
| `@tremor/react` 3.18.7 | Tailwind **v3**, React 18 only | Why we prefer Tremor Raw instead. |
| Tremor Raw blocks | Tailwind v4, React 19, Recharts 2.x | No npm dep; plain Tailwind utility classes. |
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

---
*Stack research for: personal-finance BI web app with PSD2/AISP ingestion*
*Researched: 2026-06-21*
