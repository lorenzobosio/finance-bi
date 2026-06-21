# Finance BI — Lorenzo & Fernanda

## What This Is

A personal business-intelligence web app for a couple in Berlin who run their household finances **like a business**: salaries are *revenue*, expenses are *cost centers* (Lorenzo / Fernanda / Shared) each with individual budgets, and a fixed **€4,000/month pay-yourself-first contribution** drives the north-star goal of **€100,000 invested**. Bank data arrives automatically once a day via open banking (Enable Banking), is categorized into a fixed, comparable taxonomy, and is surfaced as KPI dashboards — desktop for Lorenzo (technical), mobile-first PWA for Fernanda (non-technical).

The product must answer four questions in **under a minute**: how far to €100k, did we hit €4k this month, did either person blow their budget, and what's the margin (revenue − investment − costs).

## Core Value

**Show, at a glance and with trustworthy automatic data, exactly how far the couple is from €100k invested — and whether this month's money behaved like a healthy business.** Everything else can degrade; this single answer must always be correct and comparable across months.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

(None yet — greenfield; ship to validate)

### Active

<!-- Current scope. MVP = Phases 0–3. Phases 4–7 are committed but post-MVP. -->

**MVP (Phases 0–3):**

- [ ] Google login restricted to a 2-email allowlist; RLS enabled on every table; all routes protected
- [ ] Daily, idempotent ingestion of the 3 Revolut accounts via Enable Banking (GitHub Actions cron, `dedupe_hash`, no duplicate transactions)
- [ ] Transactions categorized and assigned to a cost center via versioned `rules` (fixed taxonomy for MoM/YoY comparability)
- [ ] Home dashboard (mobile-first): €100k hero + current-month KPIs
- [ ] €100k Goal page (gamified): total invested, % to goal, next milestone (10k/25k/50k/75k/100k), ETA, €4k streak
- [ ] Spending views: by category, account, and person
- [ ] Cost Centers (Lorenzo / Fernanda / Shared) with individual budgets — budgeted vs actual
- [ ] P&L view: revenue vs investment vs costs, result and margin (% of revenue)
- [ ] €4k contribution detected (`flow_type=investimento`, internal transfer) and reflected in €100k progress
- [ ] Month-over-month comparability across all of the above
- [ ] Config page: accounts, connections (90-day reconnect), categories, rules, budgets, allowlist
- [ ] Transactions page: table, re-categorize, create rule, assign cost center

**Committed, post-MVP:**

- [ ] PWA via Serwist — installable, offline-tolerant, mobile-first for Fernanda *(Phase 4)*
- [ ] AI insights — manual-first daily digest + weekly report written to `insights` *(Phase 5)*
- [ ] ETF valuation + multicurrency — prices API, `fx_rates`, `holdings`, live market value / P-L / allocation *(Phase 6)*
- [ ] Reminders / notifications — 90-day reconnect, budget alerts *(Phase 7, after AI)*

### Out of Scope

<!-- Explicit boundaries with reasoning to prevent re-adding. -->

- CSV / manual import — automatic open-banking ingestion from the MVP; no CSV path planned
- Revolut's own API — not accessible to an individual (requires TPP status); Enable Banking used instead
- Banks beyond the 3 Revolut accounts (e.g. N26 DE) — deferred until the Revolut flow is proven
- Live ETF market value / multicurrency in MVP — investment positions usually sit outside PSD2; deferred to Phase 6
- Automated AI in MVP — automated Claude jobs burn metered credits; AI starts manual (Phase 5)
- Reminders / notifications in MVP — deferred to Phase 7 (after AI)
- Historical backfill — go-forward only; YoY becomes meaningful after ~12 months of data
- Per-user data isolation by cost center — both users see everything; cost center is an analytical label, not an access wall (RLS only enforces the 2-email allowlist)

## Context

- **Two distinct users.** Lorenzo: technical, desktop, owns config and (later) runs AI. Fernanda: non-technical, uses a mobile PWA — her screens must be mobile-first and simple. Both see all data.
- **Couple living in Berlin**, EUR finances. The single ETF being accumulated is Invesco FTSE All-World (ISIN IE000716YHJ7), held at Revolut.
- **Comparability is a first principle:** fixed category taxonomy + versioned `rules` + monthly grain enable MoM/YoY. A calendar dimension supports period comparison.
- **Correctness rules:** internal transfers and the €4k contribution are **not** costs; the €4k is `flow_type=investimento`. Dedupe key = account + date + amount + normalized description + bank id.
- **Open-banking realities (PSD2):** pull-only, once per day (no webhooks). Consent expires every 90 days (SCA) — tracked via `connections.expires_at`, requires periodic reconnect. Confirm at Enable Banking setup which Revolut accounts are actually exposed (investment pocket may not be).
- **Cost realities:** automated Claude jobs (`claude -p`, Agent SDK, GitHub Actions) draw from a metered credit pool, not the interactive subscription → keep AI manual first, prompts tiny, Haiku for the daily digest. The daily ingestion cron doubles as a keep-alive so the Supabase free tier doesn't pause after ~7 days idle.
- **Roadmap intent:** the user has an explicit 7-phase structure (see Constraints). The roadmapper should mirror it closely, refining only intra-phase plan breakdown.

## Constraints

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

## Key Decisions

<!-- Decisions that constrain future work. Add throughout project lifecycle. -->

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Enable Banking (AISP) instead of Revolut's own API | Revolut API requires TPP status (not available to an individual); Enable Banking Restricted Production connects own accounts free and covers Revolut + N26 DE | — Pending |
| Supabase Auth (Google) + 2-email allowlist, RLS on all tables | Simplest secure auth for a 2-person private app; allowlist + RLS keep all data behind login | — Pending |
| EUR only in MVP; FX deferred to Phase 6 | All accounts are EUR; conversion only matters for the USD-priced ETF valuation | — Pending |
| AI starts manual, automates in Phase 5 | Automated Claude jobs draw metered credits; interactive local use is covered by subscription | — Pending |
| No CSV — automatic open-banking ingestion from MVP | Manual import is a maintenance burden and breaks comparability/idempotency | — Pending |
| Go-forward only, no historical backfill | Open banking exposes limited history; YoY becomes meaningful after ~12 months | — Pending |
| Cost center is an analytical label, not an access boundary | Both users see everything; only the 2-email allowlist is enforced via RLS | — Pending |
| €100k = sum of contributions (cost basis) in MVP | Investment market value usually sits outside PSD2; live valuation deferred to Phase 6 | — Pending |
| Daily pull cron doubles as Supabase keep-alive | Free tier pauses after ~7 days idle; the ingestion job keeps it warm | — Pending |
| Home AI "phrase of the day" hidden until Phase 5 | AI is manual-first and deferred; keep the MVP lean | — Pending |
| Roadmap mirrors the explicit 7-phase structure | User has a deliberate, internally-consistent phase plan | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-06-21 after initialization*
