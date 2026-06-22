# Roadmap: Finance BI — Lorenzo & Fernanda

## Overview

A couple in Berlin runs their household finances like a business: salaries are revenue, expenses are cost centers (Lorenzo / Fernanda / Shared) with individual budgets, and a fixed €4,000/month pay-yourself-first contribution drives the north-star goal of €100,000 invested. The journey starts with a secure foundation (Google auth, RLS, schema, calendar dimension), then builds trustworthy automatic ingestion from Enable Banking (idempotent, freshness-aware), then the house-as-business BI layer (P&L, cost centers, spending, MoM comparability), then the gamified €100k goal — that is the shippable MVP (Phases 0–3). Post-MVP, the app becomes an installable PWA for Fernanda, gains manual-first AI insights, swaps cost-basis for live ETF market value, and finally adds proactive reminders.

**MVP boundary:** Phases 0–3 (FND / ING / CAT-subset / BI / GOAL) constitute the shippable MVP. Phases 4–7 (PWA / AI / ETF / REM) are committed but post-MVP.

## Phases

**Phase Numbering:**

- Integer phases (0, 1, 2…): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 0: Foundation** - Secure scaffold: Next.js 15 + Tailwind v4 + Tremor Raw on Vercel; Google auth (2-email allowlist) + RLS on every table; base schema + seeded calendar dimension (completed 2026-06-21)
- [x] **Phase 1: Ingestion (Enable Banking)** - Daily, idempotent pull of the Revolut accounts with freshness/reconnect visibility; the €4k investimento contract (completed 2026-06-22)
- [ ] **Phase 2: Core BI + house-as-business** - Versioned rules engine + P&L, cost-center budgets, spending views, MoM comparability, Home KPIs, config, balance snapshots
- [ ] **Phase 3: €100k Goal** - Gamified goal page: total invested, % to goal, milestones, ETA, €4k streak, Home hero; swappable goal-total abstraction
- [ ] **Phase 4: PWA** - Installable Serwist PWA, NetworkFirst on financial routes, service-worker update prompt
- [ ] **Phase 5: AI Insights** - Manual-first Haiku daily digest + weekly report into `insights`; Home "phrase of the day"; pre-aggregated inputs only
- [ ] **Phase 6: ETF Valuation + Multicurrency** - Holdings/prices for the ETF, live market value / P-L / allocation, EUR/USD FX, swap goal denominator
- [ ] **Phase 7: Reminders** - Reconnect reminder before consent expiry, budget-overspend alerts, ingestion dead-man's-switch

## Phase Details

### Phase 0: Foundation

**Goal**: A secure, deployed app shell exists with auth, RLS, the service_role boundary, and the dimensional schema in place — so all later data lands behind login and is month-comparable from day one.
**Mode:** mvp
**Depends on**: Nothing (first phase)
**Requirements**: FND-01, FND-02, FND-03, FND-04, FND-05, FND-06
**Success Criteria** (what must be TRUE):

  1. The scaffold (Next.js 15 + Tailwind v4 + Tremor Raw + `@supabase/ssr`) is deployed and reachable on Vercel, and charts render via Tremor Raw (not the frozen `@tremor/react` package)
  2. A user with an allowlisted Google email can sign in; any other email is rejected; every app route requires authentication
  3. RLS is enabled on every table enforcing the 2-email allowlist (verifiable: an unauthorized identity SELECTs zero rows)
  4. A CI check fails the build if `service_role` appears in the client bundle, and passes when it is isolated to server-only code
  5. The base Postgres schema exists with a seeded calendar dimension (`period_key` = YYYYMM) covering past and future months for MoM/YoY joins

**Plans**: 5/4 plans complete
**Wave 1**

- [x] 00-01-PLAN.md — Scaffold (Next 15 + Tailwind v4 + shadcn) + Tremor Raw deps + Vitest Wave-0 test harness + external-service provisioning (FND-05, FND-06)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 00-02-PLAN.md — Full v1 Drizzle schema + RLS-on-every-table + seed (members/taxonomy/dim_calendar 2024-2035) + [BLOCKING] live migration push (FND-02, FND-04)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 00-03-PLAN.md — Google auth gate: @supabase/ssr clients, allowlist, middleware route protection, /auth/callback, protected page with one real RLS-bound read (FND-01, FND-02)

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 00-04-PLAN.md — service_role chokepoint (server-only) + ESLint guard + CI (lint/build/bundle-grep/SQL assertions) + Vercel deploy (FND-03, FND-05)

**Wave 5** *(hardening — public-repo prep)*

- [x] 00-05 — Allowlist hardening: replace hardcoded RLS emails with env-seeded `app_allowlist` table + SECURITY DEFINER `is_email_allowed()`; remove all email literals from committed source/migrations/docs; source-cleanliness guard test; live DB re-applied and verified table-driven

### Phase 1: Ingestion (Enable Banking)

**Goal**: Trustworthy transaction and balance data flows in automatically once a day, deduplicated and correctly typed, with staleness and reconnect states loudly visible — and the €4k investment contribution is correctly classified at the source.
**Mode:** mvp
**Depends on**: Phase 0
**Requirements**: ING-01, ING-02, ING-03, ING-04, ING-05, ING-06, CAT-03, CAT-01, CAT-02, CAT-07
**Success Criteria** (what must be TRUE):

  1. The Revolut accounts are connected via Enable Banking, with a documented enumeration (discovery spike) of exactly which accounts/pockets PSD2 exposes and the real consent-window duration
  2. A daily GitHub Actions cron pulls transactions and balances; running the same window twice adds zero duplicate rows (`dedupe_hash` + DB UNIQUE constraint verified)
  3. Each run records an `import_batches` audit row and performs a guaranteed DB write even on zero-transaction days (Supabase keep-alive); a 403 / re-auth response surfaces as a loud "reconnect needed" state
  4. Every dashboard shows a "data as of {date}" freshness banner, and stale or disconnected data is visibly flagged; `connections.expires_at` is stored from the real API response (never hardcoded)
  5. The €4k contribution is classified `flow_type=investimento`, its credit leg is never counted as revenue, and it is excluded from both costs and revenue in every aggregation

**Plans**: 5/5 plans complete

**Wave 1**

- [x] 01-01-PLAN.md — Wave-0 TDD test scaffolds (jwt/dedupe/normalize/rules + integration stubs) + the discovery spike (ING-01): run pnpm eb:connect once, enumerate exposed accounts + real consent window, capture fixtures (resolves A2/A6/valid_until) (ING-01)

**Wave 2** *(blocked on Wave 1)*

- [x] 01-02-PLAN.md — Schema migration: ingestion columns + extensible cost_centers lookup (D-24) + import_batches table (RLS) + extend test:rls; [BLOCKING] live Supabase migration push (ING-03, ING-04, CAT-01, CAT-07)

**Wave 3** *(blocked on Wave 2)*

- [x] 01-03-PLAN.md — Connect slice: EB RS256 JWT (jose) + zod-validated typed client + pnpm eb:connect persists connections/accounts/heartbeat (expires_at from the real valid_until) (ING-01, ING-02, ING-05)

**Wave 4** *(blocked on Wave 3)*

- [x] 01-04-PLAN.md — Normalize + dedupe + versioned rules engine (classify-on-ingest) + headless scripts/ingest.ts: incremental idempotent pull, balances snapshot, ON CONFLICT DO NOTHING, heartbeat, 403 fail-soft (ING-02, ING-03, ING-04, ING-05, CAT-02, CAT-03, CAT-07)

**Wave 5** *(blocked on Wave 4)*

- [x] 01-05-PLAN.md — Daily GitHub Actions cron + the freshness ("data as of") and reconnect status banners per the UI-SPEC, read under RLS (ING-02, ING-05, ING-06)

### Phase 2: Core BI + house-as-business

**Goal**: The household-as-a-business derivation and UI layer exists: a fully versioned rules engine assigns category/cost-center/flow_type, and calendar-joined SQL views power P&L, cost-center budgets, spending breakdowns, balance trends, and the Home KPIs — all month-over-month comparable.
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: CAT-04, CAT-05, CAT-06, BI-01, BI-02, BI-03, BI-04, BI-05, BI-06, BI-07
<!-- CAT-01, CAT-02, CAT-07 moved to Phase 1 (classify-on-ingest) per the user's saved Phase-1 plan, 2026-06-22 -->>
**Success Criteria** (what must be TRUE):

  1. A versioned rules engine assigns `category`, `cost_center`, and `flow_type` by priority on ingest over a fixed taxonomy (`group` = essential | desire | investment); each account has a default cost center applied automatically with per-transaction override
  2. Internal movements between the couple's own accounts (including the €4k pocket contribution) are classified `flow_type=transferência`/`investimento` by paired-leg detection (with manual override) and are excluded from both costs and revenue in every aggregation — verifiable in the P&L
  3. The user can view a transactions table and re-categorize a transaction, create a rule from it, and assign its cost center; re-applying rules is an explicit action and raw history is never silently rewritten
  4. The P&L view shows revenue vs investment vs costs with result and margin (% of revenue); cost centers (Lorenzo / Fernanda / Shared) show budgeted vs actual; spending breaks down by category, account, and person
  5. All views are month-over-month comparable via the calendar dimension (empty months render €0; current partial month flagged provisional; YoY shows "insufficient history" until ~12 months); the Home dashboard surfaces the 4 headline KPIs; Config manages categories, rules, and budgets; daily balance snapshots are stored in `balances` for cash-position / net-worth trend

**Plans**: TBD
**UI hint**: yes

### Phase 3: €100k Goal

**Goal**: The north-star KPI is live: a gamified €100k Goal page shows total invested, % to goal, milestones, ETA, and the €4k streak, with a Home hero element — and the goal total is computed via a swappable abstraction so Phase 6 can substitute market value without breaking the page.
**Mode:** mvp
**Depends on**: Phase 2
**Requirements**: GOAL-01, GOAL-02, GOAL-03, GOAL-04, GOAL-05, GOAL-06
**Success Criteria** (what must be TRUE):

  1. The €100k Goal page shows total invested (cost basis) and % to goal, computed via a swappable `getGoalTotal()` abstraction that Phase 6 can swap to market value non-breakingly
  2. Milestones (10k / 25k / 50k / 75k / 100k) are displayed with `achieved_at` recorded when reached
  3. ETA to €100k is computed and shown from the contribution run-rate
  4. The €4k monthly adherence streak is tracked and displayed
  5. The Home dashboard shows the €100k hero element answering "how far to €100k" at a glance

**Plans**: TBD
**UI hint**: yes

### Phase 4: PWA

**Goal**: The app is installable and mobile-first for Fernanda, with financial figures never served stale and a clear path to receive new versions.
**Mode:** mvp
**Depends on**: Phase 3
**Requirements**: PWA-01, PWA-02, PWA-03
**Success Criteria** (what must be TRUE):

  1. The app is installable as a PWA via Serwist, optimized mobile-first for Fernanda
  2. All financial routes use a `NetworkFirst` caching strategy so money figures are never served stale
  3. A service-worker update prompt informs the user when a new version is available

**Plans**: TBD
**UI hint**: yes

### Phase 5: AI Insights

**Goal**: Manual-first AI turns pre-aggregated KPIs into short written insights stored in `insights` and surfaced as Home's "phrase of the day" — without ever sending raw transactions or burning unbounded metered credits.
**Mode:** mvp
**Depends on**: Phase 4
**Requirements**: AI-01, AI-02, AI-03, AI-04
**Success Criteria** (what must be TRUE):

  1. A manually-triggered daily digest runs via `claude-haiku-4-5` and writes to the `insights` table within a bounded prompt (hard token cap; token usage logged)
  2. A weekly report is generated and written to `insights`
  3. The Home dashboard reveals the latest insight as the "phrase of the day" (hidden until this phase ships)
  4. AI inputs are pre-aggregated KPIs only — the raw transaction table is never sent to the model

**Plans**: TBD
**UI hint**: yes

### Phase 6: ETF Valuation + Multicurrency

**Goal**: The €100k goal becomes live-valued: holdings and prices track the accumulating ETF, the Goal/Investments page shows market value, unrealized P/L and allocation, EUR/USD FX is supported, and the goal denominator swaps from cost-basis to market value via the Phase 3 abstraction.
**Mode:** mvp
**Depends on**: Phase 3, Phase 5
**Requirements**: ETF-01, ETF-02, ETF-03, ETF-04
**Success Criteria** (what must be TRUE):

  1. `holdings` and `prices` track the Invesco FTSE All-World position (ISIN IE000716YHJ7)
  2. Live market value, unrealized P/L, and allocation are shown on the Investments/Goal page
  3. `fx_rates` enable EUR/USD multicurrency conversion
  4. The €100k denominator is swapped from cost-basis to live market value via the Phase 3 abstraction, without breaking the Goal page

**Plans**: TBD
**UI hint**: yes

### Phase 7: Reminders

**Goal**: Proactive notifications close the operational loop: the couple is reminded to reconnect before consent expiry, alerted when a cost center overspends, and warned if ingestion silently stops.
**Mode:** mvp
**Depends on**: Phase 4, Phase 5
**Requirements**: REM-01, REM-02, REM-03
**Success Criteria** (what must be TRUE):

  1. A reconnect reminder fires before `connections.expires_at` (consent expiry)
  2. Budget-overspend alerts notify when a cost center exceeds its budget
  3. A dead-man's-switch alerts if ingestion has not succeeded in >24–48h

**Plans**: TBD

## Ops Backlog (not blocking phases)

Deferred operational / repo-hardening items, to pick up later:

- [ ] **Branch protection — require PRs + green CI to merge `main`** (deferred per user, 2026-06-22). Today `main` blocks force-pushes + deletions. Upgrade to "require a pull request + passing CI (CodeQL + the lint/build/bundle-grep/RLS workflow) before merge." This shifts to a feature-branch → PR → merge flow; flip GSD `branching_strategy` to per-phase and use `/gsd-ship` PRs.

## Progress

**Execution Order:**
Phases execute in numeric order: 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 0. Foundation | 5/4 | Complete   | 2026-06-21 |
| 1. Ingestion (Enable Banking) | 5/5 | Complete   | 2026-06-22 |
| 2. Core BI + house-as-business | 0/TBD | Not started | - |
| 3. €100k Goal | 0/TBD | Not started | - |
| 4. PWA | 0/TBD | Not started | - |
| 5. AI Insights | 0/TBD | Not started | - |
| 6. ETF Valuation + Multicurrency | 0/TBD | Not started | - |
| 7. Reminders | 0/TBD | Not started | - |
