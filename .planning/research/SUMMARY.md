# Project Research Summary

**Project:** Finance BI — Lorenzo & Fernanda
**Domain:** Personal-finance BI web app with PSD2/AISP open-banking ingestion; "household-as-a-business" dashboard
**Researched:** 2026-06-21
**Confidence:** HIGH

## Executive Summary

This is a read-mostly analytical application built on top of a pull-only open-banking feed. The architecture is cleanly split into three non-negotiable planes: a write plane (GitHub Actions ingestion cron running with `service_role` privileges), a derivation plane (Supabase Postgres views + calendar dimension that produce all KPIs as SQL), and a read plane (the Next.js app, which never holds elevated keys and only SELECTs from derived views). The entire product value rests on a single invariant — **comparability**: every KPI figure must be reproducible, month-over-month aligned, and incorruptible by re-runs. That invariant is enforced by immutable raw transactions, a `dedupe_hash` DB UNIQUE constraint, versioned categorization rules, and a calendar dimension — not by app-side logic.

The recommended approach is to build in strict phase dependency order: Foundation (auth + RLS + schema) → Ingestion (Enable Banking + idempotency) → Core BI (P&L, cost centers, spending views) → €100k Goal (gamified, cost-basis) → PWA → AI (manual-first, Haiku) → ETF valuation → Reminders. Each phase delivers standalone value; phases 0–3 constitute the MVP. Three integration seams carry the highest technical risk and must be resolved before the roadmap commits to downstream design: (1) exactly which Revolut accounts Enable Banking exposes under PSD2, (2) the real consent-window duration for Revolut specifically (up to 180 days, not a guaranteed 90), and (3) the cost model for automated Claude jobs (metered API credits separate from the interactive subscription, billing changed June 15 2026).

The key risks are data-correctness risks, not scale risks. The two biggest correctness traps are (a) the €4,000/month ETF contribution leaking into "costs" or being double-counted, corrupting both the P&L margin and the €100k goal progress, and (b) duplicate transactions from an unstable `dedupe_hash`, which silently inflate every KPI. Both must be solved and test-asserted in Phase 1–2; they cannot be retrofitted. A secondary operational risk is silent data staleness: PSD2 consent expiry causes the cron to 403-fail quietly, GitHub Actions cron is not guaranteed to run, and the Supabase free tier pauses after 7 days of real database inactivity. The mitigation — a "data as of" freshness banner, expiry detection, and a guaranteed DB write on every cron run — must ship in Phase 1, not be deferred to the reminder phase.

---

## Key Findings

### Recommended Stack

The stack is locked (see `PROJECT.md` Constraints). Research made each choice implementation-ready and surfaced one critical deviation from the stated constraint.

**The Tremor reality — mandatory decision before Phase 0:**
The `@tremor/react` npm package is frozen at v3.18.7 (approximately one year without updates) and targets Tailwind v3 + React 18. The rest of the locked stack runs Tailwind v4 + React 19, creating an irreconcilable peer-dependency conflict. Tremor's actively maintained product is now **"Tremor Raw"** (at tremor.so): copy-paste component blocks built on plain Tailwind v4 + Recharts with no npm dependency. **Recommendation: satisfy the "Tremor" constraint via Tremor Raw copy-paste blocks.** If the team insists on the npm package, it forces a full downgrade to Tailwind v3 + React 18 — which conflicts with Next.js 15 + React 19 defaults and is not recommended. This is the single most important stack nuance discovered in research.

**Core technologies:**
- **Next.js 15.x (pinned):** Full-stack framework — App Router + Route Handlers for the read plane. Pin to 15, not 16 (16.2.x is current but all ecosystem libs are proven on 15; adopt post-MVP).
- **React 19.x:** Default for Next 15; compatible with Tremor Raw.
- **TypeScript 5.x (≥5.5, strict):** Share generated Supabase DB types across UI, Route Handlers, and the GitHub Action via `supabase gen types`.
- **Tailwind CSS v4.x:** CSS-first config (`@import "tailwindcss"`, no `tailwind.config.js`); compatible with Tremor Raw.
- **Supabase (Postgres 15+, `@supabase/supabase-js` 2.x, `@supabase/ssr` 0.6.x):** Use `@supabase/ssr` (cookie-based, App Router-native) — never the deprecated `@supabase/auth-helpers-nextjs`. RLS on every table; 2-email allowlist enforced in the policy itself.
- **Enable Banking API (REST, JWT RS256):** AISP open-banking; Restricted Production connects own Revolut accounts for free. Auth = self-signed JWT with `kid=application_id` using `jose` (ESM-first, cleaner than `jsonwebtoken` for this).
- **Recharts 2.x:** The charting primitive; Tremor Raw sits on top of it.
- **GitHub Actions (daily cron):** Write plane for ingestion AND the Supabase free-tier keep-alive. `service_role` lives here and in server-only Route Handlers — never in any client path.
- **Vercel Hobby:** Hosts the Next.js read plane. Do not run ingestion here (Hobby cron is limited; would require `service_role` in Vercel runtime).
- **`claude-haiku-4-5` via `@anthropic-ai/sdk`:** Phase 5 AI digest. $1/$5 per MTok input/output. Automated GitHub Action jobs draw from a **separate metered credit pool** (not the interactive subscription) — keep prompts tiny, manual-first.
- **`@serwist/next` 9.5.x + `serwist` 9.5.x:** Phase 4 PWA. `withSerwistInit` in `next.config`; SW at `app/sw.ts`.
- **`zod` 3.x/4.x + `date-fns` 3.x:** Validate untrusted Enable Banking payloads; handle month-grain bucketing and `expires_at` math.

### Expected Features

**Must have (table stakes — MVP, Phases 0–3):**
- Automatic daily bank sync via Enable Banking (no manual entry) — the product's entire value proposition
- Idempotent ingestion with `dedupe_hash` UNIQUE constraint — correctness precondition for every KPI
- Fixed taxonomy + versioned categorization rules with cost-center and `flow_type` assignment
- Transactions table with re-categorize + create-rule capability (rules never catch 100%)
- Spending breakdowns by category, account, person
- Cost-center budgets (Lorenzo / Fernanda / Shared) — budgeted vs actual
- House-as-business P&L view — revenue vs investment vs costs, result + margin %
- Month-over-month comparability across all views (calendar dimension)
- Home dashboard (mobile-first) surfacing the 4 KPIs in under 1 minute
- €100k Goal page — total invested (cost basis), % to goal, milestones, ETA, €4k streak
- €4k contribution detection (`flow_type=investimento`) feeding goal progress exactly once
- Config page — accounts, connections with consent-expiry display, categories, rules, budgets, allowlist
- Google login + 2-email allowlist + RLS on all tables
- "Data as of" freshness banner — must ship in MVP (cheapest staleness defense)

**Should have (differentiators):**
- House-as-business P&L framing (revenue − investimento − costs = margin) — unique reframe that is the project's raison d'être
- Cost centers as first-class analytical labels (per-person accountability, both see everything)
- Gamified €100k goal — 5 milestone markers, % progress, ETA from contribution run-rate, €4k streak counter
- Versioned rules engine with explicit re-apply (not silent rewrite of history)
- Two-audience UX: Lorenzo's config-heavy desktop + Fernanda's PWA (Phase 4)

**Defer to post-MVP:**
- PWA installability / offline-tolerant shell — Phase 4 (enhances, does not gate)
- AI insights — Phase 5, manual-first daily digest → `insights` table via Haiku
- ETF live market value + multicurrency — Phase 6 (positions likely outside PSD2; cost-basis suffices for goal)
- Reminders / push notifications — Phase 7 (requires AI + PWA push; correctly last)

**Confirmed anti-features (do not build):**
- CSV / manual import (breaks idempotency and comparability)
- Historical backfill (go-forward only; YoY meaningful after ~12 months)
- Per-user data isolation by cost center (cost center is analytical, not an access wall)
- Automated AI in MVP (metered credits; manual-first is locked)
- Casino-style gamification (progress bar + 5 milestones + streak counter only)

### Architecture Approach

The governing architecture is three planes that must never blur: a **write plane** (GitHub Actions, `service_role`, ingestion only), a **derivation plane** (Postgres views + calendar dimension that compute all KPIs as SQL, never in TypeScript), and a **read plane** (Next.js App Router, anon/user key, RLS-bound). All financial data flows in one direction: Enable Banking → normalizer → dedupe/upsert → rules engine → raw `transactions` table → SQL views → UI. The app never computes KPIs; it only SELECTs from views. Comparability logic lives in SQL + migrations, where it is versioned and reproducible.

**Major components:**

1. **EB Connector (GitHub Actions)** — signs RS256 JWT, holds `session_id` per connection, pulls `/accounts/{id}/transactions` and `/balances` for the 3 Revolut accounts daily
2. **Normalizer (pure TS, `ingestion/normalize.ts`)** — maps raw Enable Banking payloads to canonical shape (signed EUR amount, `booking_date`, normalized description, bank tx id); deterministic so re-runs are stable
3. **Dedupe + Import Batch (`ingestion/dedupe.ts`)** — computes `dedupe_hash` (account + booking_date + amount.toFixed(2) + normalizedDescription + bankTxId), groups into an `import_batches` row, upserts with `ON CONFLICT (dedupe_hash) DO NOTHING`
4. **Versioned Rules Engine (`ingestion/apply-rules.ts`)** — stamps `category`, `cost_center`, `flow_type`, and `rule_id`/`rule_version` on each transaction; re-apply is explicit, never silent
5. **Calendar Dimension (`supabase/seed/calendar.sql`)** — dense date spine (one row per day, with year/month/quarter/period_key=YYYYMM); left-joined to facts so MoM/YoY never drops empty months
6. **Derived Views** — `v_monthly_pnl`, `v_cost_center_actuals`, `v_goal_progress`, `v_category_spend`, `v_mom_yoy`; the app only SELECTs these
7. **Next.js Read App** — Server Components + Route Handlers under `@supabase/ssr` cookie session; Tremor Raw + Recharts as client islands; all mutations (rules, budgets, re-categorize) via Route Handlers
8. **RLS / Auth Layer** — Supabase Auth (Google), 2-email allowlist enforced in every table's RLS policy; `service_role` isolated to `lib/supabase/service.ts`, imported only by ingestion and audited Route Handlers

### Critical Pitfalls

1. **€4k contribution counted as a cost / double-counted** — The €4k ETF transfer has both legs visible over PSD2. Naive categorization inflates cost centers by €4k/month and can double-count it into both costs and goal progress. Prevention: `flow_type=investimento` as a first-class enum; exclude from all cost/revenue aggregations; feed to goal progress exactly once; suppress the credit leg. This is a Phase 1/2 contract — all downstream KPIs depend on it.

2. **`dedupe_hash` instability — duplicates or dropped transactions** — Banks mutate description strings and flip pending→booked status between pulls. An unstable hash silently duplicates or drops transactions. Prevention: pin to `booking_date`; freeze and version the normalization function; prefer the bank tx id when stable; enforce with a DB UNIQUE constraint. Treat normalization as a migration.

3. **Silent data staleness from PSD2 consent expiry** — Consent expires (90–180 days, Revolut-specific cadence must be confirmed at setup), causing the cron to 403-fail silently. Prevention: store real `expires_at` from the API (never hardcode 90 days); classify 403/re-auth as a loud visible state; show "data as of" freshness banner on every dashboard. Ship this in Phase 1, not Phase 7.

4. **Investment pocket likely NOT exposed via PSD2** — Revolut's ETF/trading pocket commonly sits outside PSD2 AIS scope. Prevention: Phase 1 first task is a discovery spike — enumerate exactly which accounts Enable Banking returns. Build €100k goal on the outgoing €4k contribution leg (cost basis from visible current account), not an investment balance.

5. **GitHub Actions cron unreliable + Supabase free tier pauses after 7 days** — Scheduled Actions are frequently delayed, dropped under load, and auto-disabled on inactive repos. Prevention: off-peak odd-minute schedule; every cron run writes a heartbeat DB row even on zero-transaction days; dead-man's-switch alerting (no successful run in >24–48h).

6. **Claude automated jobs draw a separate metered credit pool (June 15 2026)** — `claude -p`, Agent SDK, and GitHub Actions consume a separate monthly credit pool billed at API rates — not the interactive subscription. Prevention: manual-first; Haiku only; pre-aggregated inputs (never full transaction table); hard token budget per run.

---

## Implications for Roadmap

The 7-phase structure in PROJECT.md is correct and should be mirrored exactly. Research validates the ordering and adds intra-phase emphasis. Phases 0→1→2→3 are a strict dependency chain; phases 4–7 are additive and can slip without breaking the MVP.

### Phase 0: Foundation
**Rationale:** Auth, RLS, and the `service_role` security boundary must be established before any data exists.
**Delivers:** Next.js 15 + Tailwind v4 + Tremor Raw scaffold; Supabase project with Google Auth; 2-email allowlist in RLS policies on all tables; base schema + calendar dimension seeded; `lib/supabase/service.ts` chokepoint; CI checks for RLS-on-every-table and no `service_role` in client bundle.
**Key decision to confirm:** Tremor Raw (copy-paste, Tailwind v4 + Recharts) vs `@tremor/react` (requires Tailwind v3 + React 18 downgrade). Research recommendation is unambiguous: **Tremor Raw**.
**Avoids:** RLS misconfiguration (Pitfall 7), service_role leak (Pitfall 8).

### Phase 1: Ingestion (Enable Banking)
**Rationale:** No data, no product. Ingestion is the spine; every downstream phase depends on trustworthy, deduplicated, correctly typed transaction rows.
**Delivers:** Enable Banking connector (JWT RS256 via `jose`, session management, `connections.expires_at` from real API response); normalizer; `dedupe_hash` with DB UNIQUE constraint; `import_batches` audit log; versioned rules engine stub (`flow_type=investimento` for the €4k); daily GitHub Actions cron at an off-peak minute; guaranteed DB heartbeat write on every cron run; "data as of" freshness banner + 403/re-auth classified as visible state; `expires_at` displayed on Config.
**First task (discovery spike):** Enumerate exactly which Revolut accounts/pockets Enable Banking exposes. Document the result. Confirm the real consent-window duration. Gate Phase 3 and Phase 6 design on this finding.
**Phase 1 contracts (tested before Phase 2):** Double re-pull produces zero new rows. €4k transfer is `flow_type=investimento` and appears in neither costs nor revenue. `expires_at` stored from API response, not hardcoded. Every cron run advances Supabase "last active" timestamp.
**Avoids:** Pitfalls 1, 2, 3, 4, 5, 10, 11.
**Research flag:** NEEDS live API validation at setup — which accounts appear, exact `expires_at` format, pending→booked lifecycle.

### Phase 2: Core BI + House-as-Business
**Rationale:** With trustworthy data flowing, the derivation layer and UI can be built. All KPI views share the same dimensional model.
**Delivers:** Calendar-joined SQL views (`v_monthly_pnl`, `v_cost_center_actuals`, `v_category_spend`, `v_mom_yoy`); P&L view; cost-center budgets; spending views; transactions page with re-categorize + create-rule; versioned rules engine fully operational; MoM comparability (empty months as €0); home dashboard skeleton; Config for categories, rules, budgets.
**Key correctness assertion:** `flow_type=investimento` excluded from cost/revenue in every aggregation. Partial current month marked provisional. YoY shows "insufficient history" until ~12 months.
**Avoids:** Pitfall 1 (€4k cost leak), Pitfall 6 (broken MoM/YoY), Architecture anti-patterns 1 and 4.

### Phase 3: €100k Goal
**Rationale:** The north-star KPI. Depends on `flow_type=investimento` being correct (Phase 2 contract). Must be designed so Phase 6 can swap cost-basis for live market value non-breakingly.
**Delivers:** `v_goal_progress` view; €100k Goal page with progress bar, 5 milestones, % to goal, ETA, €4k streak; Home dashboard €100k hero. Goal total = cost basis in MVP via an abstraction layer (`getGoalTotal()`) that Phase 6 can swap.
**Avoids:** double-counting €4k into both costs and goal progress (Pitfall 1).

### Phase 4: PWA
**Rationale:** Fernanda's primary access is mobile; installability is committed but does not gate any data or feature.
**Delivers:** Serwist (`@serwist/next` 9.5.x) PWA shell; installable; `NetworkFirst` on all financial API routes; precache only static assets; SW update prompt.
**Avoids:** Serwist serving stale financial data (Pitfall 12). `NetworkFirst` is mandatory for financial routes.

### Phase 5: AI Insights
**Rationale:** Enough go-forward data accumulated (≥2–3 months) to make insights non-trivial. Manual-first to validate value before spending metered credits.
**Delivers:** GitHub Action reading pre-aggregated KPIs → `claude-haiku-4-5` `messages.create` → `insights` table; bounded prompt (hard token cap); token-usage logging; manual trigger initially. Home "phrase of the day" reveals the latest insight.
**Critical constraint:** Separate metered credit pool (June 15 2026 change). Never send raw transaction table. Haiku exclusively.
**Avoids:** Claude metered-credit blowout (Pitfall 9).

### Phase 6: ETF Valuation + Multicurrency
**Rationale:** Phase 3 abstraction layer allows swapping cost-basis for live market value. Requires a prices API outside PSD2.
**Delivers:** `holdings` and `fx_rates` tables; prices API for Invesco FTSE All-World (ISIN IE000716YHJ7); live market value, unrealized P/L, allocation on Goal page; EUR/USD FX. Gated on the account-exposure discovery from Phase 1.
**Research flag:** NEEDS research during planning — ETF prices API options (ISIN lookup, free tier, rate limits), USD→EUR FX source.

### Phase 7: Reminders
**Rationale:** Correctly last — depends on Phase 4 PWA push and Phase 5 AI. Detection (freshness banner + 403 classification + `expires_at`) ships in Phase 1; Phase 7 adds proactive notifications.
**Delivers:** 90-day reconnect reminder (push before `expires_at`); budget-overspend alerts; dead-man's-switch enrichment.

### Phase Ordering Rationale

- Phases 0→1→2→3 are a strict dependency chain: auth gates data, data gates derivation, derivation gates KPIs.
- Phase 1 carries the most external unknowns and must include a discovery spike as its first task — findings gate later phase designs.
- Phases 4–7 are additive; none gates the MVP.
- Phase 4 (PWA) before Phase 5 (AI) because Fernanda's daily usage pattern is established before adding AI content for her to read.
- Phase 6 (ETF valuation) is post-AI because it requires an external prices API and the Phase 3 abstraction layer isolates the upgrade.
- Phase 7 (Reminders) is last by construction: push notifications require PWA (Phase 4) and benefit from AI context (Phase 5).

### Research Flags

**Phases needing deeper research during planning:**
- **Phase 1:** Enable Banking live behavior with Revolut — which accounts appear, exact `expires_at` format and range, pending-vs-booked lifecycle, 429 rate limits. Run the discovery spike before finalizing the Phase 1 plan; no docs substitute for a live test call.
- **Phase 6:** ETF prices API options (ISIN IE000716YHJ7, free tier), USD→EUR FX source, holdings data model.

**Phases with standard, well-documented patterns (skip research-phase):**
- **Phase 0:** Next.js 15 + Supabase + Google Auth + RLS is extensively documented.
- **Phase 2:** SQL views + calendar dimension + Postgres aggregations are standard BI patterns.
- **Phase 3:** Recharts progress bars + milestone markers + ETA projection are well-documented.
- **Phase 4:** `@serwist/next` 9.5.x patterns are documented; `NetworkFirst` for financial data is a known best practice.
- **Phase 5:** `@anthropic-ai/sdk` `messages.create` with Haiku is straightforward; the constraint is prompt discipline, not API complexity.
- **Phase 7:** PWA push + Supabase-triggered notifications are standard patterns.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Versions verified against official docs and npm; Tremor Raw reality confirmed against npm publish date and tremor.so; Anthropic pricing verified via claude-api skill (June 2026). One confirmed deviation from stated constraint: `@tremor/react` → Tremor Raw. |
| Features | HIGH (product-specific) / MEDIUM (market) | Product-specific features anchored in PROJECT.md (HIGH). Market analogues corroborated across YNAB/Monarch/Copilot/Honeydue/Actual (MEDIUM). |
| Architecture | HIGH | Stack is locked; patterns verified against Supabase + Enable Banking + PSD2 docs. Three-plane architecture is the standard pattern for this class of app. |
| Pitfalls | HIGH (financial-correctness + security) / MEDIUM (Enable Banking specifics) | Financial-correctness and RLS pitfalls grounded in locked decisions and verified vendor docs. Enable Banking / Revolut-specific consent cadence and account exposure are MEDIUM — must be confirmed at setup. |

**Overall confidence:** HIGH

### Gaps to Address

- **Real Revolut consent-window duration:** EU AIS consent can be up to 180 days (not a guaranteed 90). The actual `expires_at` for Revolut via Enable Banking Restricted Production is account-specific. Store and display whatever the API returns; confirm at Phase 1 setup.
- **Which Revolut accounts/pockets Enable Banking exposes:** Investment/trading pocket likely absent from PSD2 AIS scope. Must be enumerated in Phase 1 discovery spike. Gate Phase 6 ETF valuation design on this finding.
- **Tremor Raw component selection:** Specific component blocks (KPI cards, area charts, bar charts) should be confirmed against tremor.so during Phase 0 scaffolding.
- **Enable Banking rate limits (429):** Specific thresholds not documented. Implement exponential backoff; confirm at setup.

---

## Sources

### Primary (HIGH confidence)
- Enable Banking Docs — Quick Start, Linked Accounts, API reference: https://enablebanking.com/docs/api/quick-start/ , https://enablebanking.com/docs/api/linked-accounts/ , https://enablebanking.com/docs/api/reference/
- Supabase Docs — Row Level Security, `@supabase/ssr`, free-tier pause: https://supabase.com/docs/guides/database/postgres/row-level-security
- Anthropic claude-api skill (June 2026) — `claude-haiku-4-5` pricing, separate metered credit pool for programmatic use (changed June 15 2026)
- Serwist — `@serwist/next` getting started, `NetworkFirst` for dynamic data: https://serwist.pages.dev/docs/next/getting-started
- Next.js 15 stable / React 19 / Tailwind v4: https://nextjs.org/blog/next-15
- `.planning/PROJECT.md` — locked decisions, phase structure, KPIs, out-of-scope (authoritative for product-specific calls)

### Secondary (MEDIUM confidence)
- Revolut Open Banking Docs — AIS consent / 180-day EU refresh-token window: https://developer.revolut.com/docs/open-banking/open-banking-api
- TrueLayer / Yapily — PSD2 SCA re-auth changes: https://truelayer.com/blog/compliance-and-regulation/explaining-changes-to-the-90-day-rule-for-open-banking-access/
- GitHub Actions scheduled-workflow unreliability: https://github.com/orgs/community/discussions/156282
- Tremor — npm `@tremor/react` (3.18.7, ~1yr old) vs Tremor Raw: https://www.npmjs.com/package/@tremor/react , https://www.tremor.so/
- YNAB, Monarch, Copilot, Honeydue, Actual Budget — PFM feature comparison

### Tertiary (LOW confidence — validate during implementation)
- Enable Banking rate limits (429 thresholds) — not explicitly documented; confirm at setup
- Supabase free-tier keep-alive via DB write (community pattern): https://github.com/travisvn/supabase-pause-prevention
- Claude Code billing change June 15 2026: https://tygartmedia.com/claude-code-billing-credit-pool-2026/

---
*Research completed: 2026-06-21*
*Ready for roadmap: yes*
