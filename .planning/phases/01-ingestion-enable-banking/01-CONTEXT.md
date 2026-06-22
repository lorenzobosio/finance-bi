# Phase 1: Ingestion (Enable Banking) - Context

**Gathered:** 2026-06-22
**Status:** Ready for planning

<domain>
## Phase Boundary

A daily, automatic, **idempotent** pull of the couple's Revolut accounts via Enable Banking (AISP, pull-only, PSD2) → normalized into `transactions` + `balances`, deduplicated, with **staleness/reconnect states loudly visible**, and the **€4k investment contribution classified at source** (`flow_type=investimento`). Covers requirements **ING-01..06** and **CAT-03**.

In scope: the discovery spike (which Revolut accounts/pockets are exposed + real consent window), the JWT/consent connection flow, the daily GitHub Actions cron (incremental transactions + balances snapshot, `dedupe_hash` idempotency, keep-alive heartbeat), the investimento destination rule, `connections` consent tracking, and the "data as of" freshness + reconnect UX.

Out of scope (later phases): the full versioned rules engine + transferência two-leg pairing + default cost-center (Phase 2 / CAT-01,02,04,05,06,07); P&L / dashboards (Phase 2); the €100k goal page (Phase 3); live ETF market value (Phase 6); push/active alerts (Phase 7); historical backfill (forward-only, never).
</domain>

<decisions>
## Implementation Decisions

### Investment flow & the €4k contribution (CAT-03)
- **D-01:** The couple invests by moving money from any of the **3 cash accounts** (Lorenzo / Fernanda / joint) into a **separate Revolut investing account** where the ETF is bought. Mark that account with an **`is_investment` boolean flag** on `accounts`.
- **D-02:** The €4k is a **monthly aggregate, not a single transaction** — it can arrive from any of the 3 cash accounts, in one or more transfers.
- **D-03:** **Contribution rule:** a transfer whose **destination is the investing account** → `flow_type=investimento`. **Source-agnostic and amount-agnostic.** It counts toward the €100k goal and is **excluded from P&L** (revenue and costs).
- **D-04:** Plain internal transfers **among the 3 cash accounts** → `flow_type=transferência` (excluded from P&L, **NOT** counted toward the goal). Only transfers **into the investing account** count as `investimento`. (Phase 1 establishes the investimento destination rule; the broader transferência two-leg pairing engine is Phase 2 / CAT-06.)
- **D-05:** **"Hit €4k this month" + streak** = sum of `investimento` contributions in the calendar month **≥ €4000** — a **monthly rollup**, replacing the per-transaction `is_planned_4k` flag.
- **D-06:** **"Total invested" (MVP)** = **cumulative contributions (cost basis)**. Market value is Phase 6 (Enable Banking holdings if exposed, else a prices API: units × ETF price, ISIN **IE000716YHJ7**, with a manual override). The goal denominator stays cost-basis now, swappable later (GOAL-06 / ETF-04).

### Connecting the bank (one-time consent)
- **D-07:** One-time consent done **in the browser** (authorize at Revolut) via a **local script `pnpm eb:connect`** run **once**, which saves the session. **No in-app admin page in the MVP.**
- **D-08:** A **single consent connects all 3 cash accounts** (+ the investing account **if** the spike finds it exposed).
- **D-09:** Secrets — **Enable Banking App ID + RS256 private key + the saved session** live in **GitHub Secrets** (for the cron) and **`.env.local`** (for local). The **private key is never committed** (consistent with the no-secrets-in-repo rule).
- **D-10:** Re-consent — store **`consent_status` + `expires_at`** in `connections`; show the reconnect state in-app; re-run `pnpm eb:connect` when it expires. The **discovery spike confirms the real consent-window length** (90 vs ~180 days).

### Cron + pull strategy
- **D-11:** **Daily GitHub Actions cron**, off-peak **Europe/Berlin ~06:00 CET**, **once/day** (respects Enable Banking's ~4 calls/account/day budget).
- **D-12:** Each run pulls **transactions since the last successful pull** (incremental) **+ a balances snapshot per account** → `balances`. **Idempotent upsert via `dedupe_hash`.**
- **D-13:** A **keep-alive heartbeat write** every run (logged in `import_batches`) keeps Supabase from auto-pausing — even on a zero-transaction day.
- **D-14:** A failed/empty run **records its status** (no silent crash); the "data as of {date}" banner reflects staleness. **Forward-only — no backfill.** Active alerts are Phase 7.

### Freshness & reconnect UX (ING-05, ING-06)
- **D-15:** A **"data as of {date}" freshness banner** is shown across the app (global) reflecting the last successful pull / staleness.
- **D-16:** The **reconnect-needed state** (consent expired / 403) is a **visible in-app banner** (passive, not blocking) prompting a re-run of `pnpm eb:connect`. Push/email alerts are Phase 7.

### Claude's Discretion / handed to research + planning
- **Discovery spike (ING-01, first task):** enumerate exactly which Revolut accounts/pockets Enable Banking exposes — crucially **whether the investing account (its transactions + balance/holdings) is exposed over PSD2**. This determines whether `investimento` is detected via the **incoming leg** (investing account exposed) or via the **outgoing transfer's counterparty/description** (investing account NOT exposed — the likely case). Also confirm the real consent-window length and the transaction field shapes (booking vs value date, pending→booked, amount signs, bank tx id stability).
- **`dedupe_hash` normalization** — follow the design already in `00-RESEARCH.md` / `research/ARCHITECTURE.md` (account + booking_date + amount + normalized description + bank tx id; versioned fallback when the bank id is unstable). Researcher confirms against live Enable Banking payloads.
- **Freshness banner placement** (global header vs a layout slot) — small detail, Claude's discretion.

### Schema additions implied (planner: confirm against the LIVE schema, add via a migration)
The Phase 0 schema has the core fields (`dedupe_hash` UNIQUE, `booking_date`, `value_date`, `amount_eur`, `flow_type`, `cost_center`, `expires_at`) but a scout found these likely MISSING and needed for ingestion:
- `accounts.is_investment` (boolean) and `accounts.enable_banking_id` (the EB account uid)
- `transactions.description_raw`, `transactions.counterparty`, `transactions.is_recurring`
- `connections.consent_status`, `connections.last_pull_at`
- an **`import_batches`** table (audit + heartbeat; `transactions.import_batch_id` references it)
- replace the per-transaction `is_planned_4k` with the monthly-rollup approach (D-05)
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project & scope
- `.planning/PROJECT.md` — data model, constraints, idempotency/dedupe rules, PSD2 realities, the €4k = investimento principle
- `.planning/REQUIREMENTS.md` — ING-01..06 + CAT-03 (and CAT-06/CAT-07 context for Phase 2)
- `.planning/ROADMAP.md` — Phase 1 goal + 5 success criteria

### Research (Enable Banking + idempotency — most important here)
- `.planning/phases/00-foundation/00-RESEARCH.md` — Enable Banking auth (RS256 JWT via `jose`), session/consent flow, the GitHub Actions ingestion pattern, dedupe design, Supabase `service_role` write boundary
- `.planning/research/ARCHITECTURE.md` — the three-plane model (write plane = the cron), `dedupe_hash` + `import_batches` idempotency design, keep-alive mechanics
- `.planning/research/PITFALLS.md` — PSD2 consent expiry, investment-pocket-not-exposed, dedupe_hash instability, GitHub cron unreliability, booking vs value date, pending→booked
- `.planning/research/STACK.md` — `jose`, `zod` (validate untrusted EB payloads), `date-fns`, `@supabase/supabase-js` with `service_role`

### Existing code (reuse)
- `src/lib/db/schema.ts` — existing tables: `accounts`, `transactions`, `connections`, `balances`, `investment_contributions`, `goals`/`milestones` (extend, don't recreate)
- `src/lib/supabase/service.ts` — the server-only `service_role` client the cron writes through
- `drizzle/` migrations + `drizzle.config.ts` — migration flow (session pooler 5432); `JOURNEY.md` Key Learnings (DB-over-env, no PII in history, forward-only)
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Schema** already has `accounts`, `transactions` (with `dedupe_hash` UNIQUE, `flow_type`, `cost_center`), `connections` (with `expires_at`), `balances`, `investment_contributions`. Phase 1 extends these (adds the fields under "Schema additions implied"), it does not recreate them.
- **`service.ts`** (server-only `service_role` client) is exactly what the GitHub Action uses to write ingested rows.
- **Drizzle migration flow** is established (session pooler 5432, ordered SQL migrations + RLS); add an ingestion migration the same way. RLS must be ENABLED on any new table (the source-cleanliness + RLS posture from Phase 0 applies).

### Established Patterns
- Secrets only in `.env.local` / GitHub Secrets (never committed); the source-cleanliness guard test will catch leaks.
- The CI workflow already runs lint/build/bundle-grep/tests/RLS — new ingestion code + tests slot into it. TDD by default.

### Integration Points
- The cron (write plane) writes via `service_role`; the app (read plane) reads via `@supabase/ssr` under RLS. Keep ingestion server-only — never import the service client into client code (ESLint guard enforces this).
</code_context>

<specifics>
## Specific Ideas

- The investing account is a **separate Revolut account** holding the ETF (Invesco FTSE All-World, ISIN IE000716YHJ7). It may or may not be exposed over PSD2 — the spike decides, and the investimento-detection strategy branches on that.
- `pnpm eb:connect` is the named local one-time-consent script.
- Cron at ~06:00 Europe/Berlin; ~4 calls/account/day budget.
</specifics>

<deferred>
## Deferred Ideas

- Full versioned rules engine, transferência two-leg pairing (CAT-06), default cost-center per account (CAT-07) → Phase 2.
- In-app admin/connection management page → not in MVP (local `pnpm eb:connect` instead).
- Active reconnect/budget alerts (push/email) → Phase 7.
- Live ETF market value / holdings valuation → Phase 6 (the cost-basis denominator is swappable).
- Historical backfill → never (forward-only).

None of the above is scope creep into Phase 1 — they are explicitly held for later.
</deferred>

---

*Phase: 1-Ingestion (Enable Banking)*
*Context gathered: 2026-06-22*
