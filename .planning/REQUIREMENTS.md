# Requirements: Finance BI — Lorenzo & Fernanda

**Defined:** 2026-06-21
**Core Value:** Show, at a glance and with trustworthy automatic data, exactly how far the couple is from €100k invested — and whether this month's money behaved like a healthy business.

> **Scope note.** The roadmap covers all 8 phases (0–7). The **shippable MVP** is the **FND / ING / CAT / BI / GOAL** categories (phases 0–3). **PWA / AI / ETF / REM** (phases 4–7) are committed but post-MVP. All categories below are v1 (in this roadmap); genuinely-future items are in v2; explicit exclusions are in Out of Scope.

## v1 Requirements

Requirements for the initial roadmap. Each maps to exactly one phase.

### Foundation (FND) — Phase 0

- [ ] **FND-01**: User can sign in with Google, restricted to a 2-email allowlist (all other emails rejected)
- [ ] **FND-02**: Every table has RLS enabled enforcing the allowlist; all app routes require authentication
- [ ] **FND-03**: `service_role` key is isolated to server-only code (ingestion + audited route handlers) and never ships in the client bundle (CI-asserted)
- [ ] **FND-04**: Base Postgres schema exists with a seeded calendar dimension (`period_key` = YYYYMM) supporting MoM/YoY
- [ ] **FND-05**: App scaffold (Next.js 15 + Tailwind v4 + Tremor Raw + `@supabase/ssr`) is deployed and reachable on Vercel
- [ ] **FND-06**: Charting adopts Tremor Raw (Tailwind v4 + Recharts), not the frozen `@tremor/react` package

### Ingestion (ING) — Phase 1

- [ ] **ING-01**: The 3 Revolut accounts are connected via Enable Banking (Restricted Production), with a documented enumeration of which accounts/pockets PSD2 actually exposes (discovery spike)
- [ ] **ING-02**: A daily GitHub Actions cron pulls transactions and balances for connected accounts (pull-only; JWT RS256 via `jose`; `service_role` from CI secret)
- [ ] **ING-03**: Ingestion is idempotent — `dedupe_hash` + a DB UNIQUE constraint guarantee a re-pull of the same window adds zero duplicate rows
- [ ] **ING-04**: Each run is grouped into an `import_batches` audit row and performs a guaranteed DB write every run (doubles as the Supabase keep-alive, even on zero-transaction days)
- [ ] **ING-05**: `connections.expires_at` is stored from the real API response; a 403 / re-auth-required response is classified as a loud, visible "reconnect needed" state
- [ ] **ING-06**: Every dashboard shows a "data as of {date}" freshness banner; stale or disconnected data is visibly flagged

### Categorization (CAT) — Phases 1–2

- [ ] **CAT-01**: A fixed category taxonomy exists (`group` = essential | desire | investment, with `parent_id`)
- [ ] **CAT-02**: A versioned `rules` engine assigns `category`, `cost_center`, and `flow_type` by priority on ingest
- [ ] **CAT-03**: The €4k contribution is classified `flow_type=investimento` (internal transfer) and excluded from both costs and revenue in every aggregation; its credit leg is never counted as revenue
- [ ] **CAT-04**: User can view a transactions table and re-categorize a transaction, create a rule from it, and assign its cost center
- [ ] **CAT-05**: Re-applying rules is an explicit action; raw transaction history is never silently rewritten
- [ ] **CAT-06**: All internal movements between the couple's own accounts (personal↔joint, top-ups, and the investment-pocket contribution) are classified `flow_type=transferência` and excluded from both costs and revenue. Detection pairs the two legs (outflow in one account = inflow in another, same amount/date) with manual override available. (Generalizes CAT-03, which is the investment-specific case.)
- [ ] **CAT-07**: Each account has a default cost center (Lorenzo's personal → Lorenzo, Fernanda's personal → Fernanda, joint → Shared) applied automatically on ingest, with per-transaction override

### Core BI (BI) — Phase 2

- [ ] **BI-01**: P&L view shows revenue vs investment vs costs, plus result and margin (% of revenue)
- [ ] **BI-02**: Cost Centers (Lorenzo / Fernanda / Shared) show individual budgets — budgeted vs actual
- [ ] **BI-03**: Spending views break down by category, by account, and by person
- [ ] **BI-04**: All views are month-over-month comparable via the calendar dimension (empty months render as €0; current partial month flagged provisional; YoY shows "insufficient history" until ~12 months)
- [ ] **BI-05**: Home dashboard (mobile-first) surfaces the 4 headline KPIs so each question is answerable in under a minute
- [ ] **BI-06**: Config supports managing categories, rules, and budgets
- [ ] **BI-07**: Daily account balance snapshots are captured and stored (`balances` table) to show cash position, net-worth trend, and months-of-reserve over time

### €100k Goal (GOAL) — Phase 3

- [ ] **GOAL-01**: €100k Goal page shows total invested (cost basis) and % to goal
- [ ] **GOAL-02**: Milestones (10k / 25k / 50k / 75k / 100k) are shown with `achieved_at` when reached
- [ ] **GOAL-03**: ETA to €100k is computed from the contribution run-rate
- [ ] **GOAL-04**: €4k monthly adherence streak is tracked and displayed
- [ ] **GOAL-05**: Home shows the €100k hero element
- [ ] **GOAL-06**: The goal total is computed via a swappable abstraction (cost-basis now; Phase 6 swaps in market value without breaking the page)

### PWA (PWA) — Phase 4

- [ ] **PWA-01**: The app is installable as a PWA via Serwist, optimized mobile-first for Fernanda
- [ ] **PWA-02**: All financial routes use a `NetworkFirst` caching strategy so money figures are never served stale
- [ ] **PWA-03**: A service-worker update prompt informs the user when a new version is available

### AI Insights (AI) — Phase 5

- [ ] **AI-01**: A manually-triggered daily digest runs via `claude-haiku-4-5` and writes to the `insights` table (bounded prompt with a hard token cap; token usage logged)
- [ ] **AI-02**: A weekly report is generated and written to `insights`
- [ ] **AI-03**: Home reveals the latest insight as the "phrase of the day" (hidden until this phase ships)
- [ ] **AI-04**: AI inputs are pre-aggregated KPIs only — the raw transaction table is never sent to the model

### ETF Valuation + Multicurrency (ETF) — Phase 6

- [ ] **ETF-01**: `holdings` and `prices` track the Invesco FTSE All-World position (ISIN IE000716YHJ7)
- [ ] **ETF-02**: Live market value, unrealized P/L, and allocation are shown on the Investments/Goal page
- [ ] **ETF-03**: `fx_rates` enable EUR/USD multicurrency conversion
- [ ] **ETF-04**: The €100k denominator is swapped from cost-basis to live market value via the Phase 3 abstraction (non-breaking)

### Reminders (REM) — Phase 7

- [ ] **REM-01**: A reconnect reminder fires before `connections.expires_at` (consent expiry)
- [ ] **REM-02**: Budget-overspend alerts notify when a cost center exceeds its budget
- [ ] **REM-03**: A dead-man's-switch alerts if ingestion has not succeeded in >24–48h

## v2 Requirements

Acknowledged but deferred — not in the current roadmap.

### Additional Sources

- **SRC-01**: Connect other banks if the couple ever opens accounts there (after the 3 Revolut accounts are proven)
- **SRC-02**: Support additional instruments beyond the single accumulating ETF

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| CSV / manual transaction import | Breaks idempotency and comparability; automatic open-banking ingestion only |
| Revolut's own API | Requires TPP status (not available to an individual); Enable Banking used instead |
| Historical backfill | Go-forward only; YoY becomes meaningful after ~12 months of data |
| Per-user data isolation by cost center | Both users see everything; cost center is an analytical label, not an access wall (RLS only enforces the 2-email allowlist) |
| Casino-style / manipulative gamification | Restrained only — progress bar, 5 milestones, €4k streak; nothing dark-pattern |
| Webhook-based ingestion | PSD2 is pull-only; daily cron instead |

## MVP Acceptance Criteria (Phases 0–3)

The MVP is shippable when:

- Google login works for only the 2 allowlisted emails; RLS is active; routes are protected.
- The 3 Revolut accounts are connected via Enable Banking; the daily pull is idempotent and populates `transactions`.
- Transactions are categorized and assigned to a cost center via `rules`.
- Home + Spending + Cost Centers (budgeted vs actual) + €100k Goal work and are month-over-month comparable.
- The €4k contribution is detected (`flow_type=investimento`) and reflected in €100k progress.

## Traceability

Which phases cover which requirements. Populated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| (populated by roadmapper) | | |

**Coverage:**
- v1 requirements: 40 total
- Mapped to phases: (set by roadmapper)
- Unmapped: (set by roadmapper)

---
*Requirements defined: 2026-06-21*
*Last updated: 2026-06-21 after initial definition*
