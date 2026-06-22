# Phase 1: Ingestion (Enable Banking) - Research

**Researched:** 2026-06-22
**Domain:** PSD2/AISP open-banking ingestion (Enable Banking) → idempotent daily pull → normalize → dedupe → classify-on-ingest, run from a GitHub Actions cron writing to Supabase via `service_role`
**Confidence:** HIGH on auth/endpoints/idempotency/rules-engine design (live API verified against enablebanking.com docs + npm registry); MEDIUM on Revolut-specific exposed-accounts + the exact consent-window value + the `strategy` enum (these are the discovery-spike unknowns, by design)

> This research **extends** `00-RESEARCH.md` (RS256 JWT via `jose`, the consent flow skeleton, the GitHub Actions pattern, the dedupe + `import_batches` idea, the `service_role` boundary). It does not re-derive those. It goes deep on the **live API payloads**, the **`pnpm eb:connect` one-time-consent script**, the **idempotent cron**, the **versioned classify-on-ingest rules engine**, and the **schema migration**.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Investment flow & the €4k contribution (CAT-03)**
- **D-01:** The couple invests by moving money from any of the 3 cash accounts (Lorenzo / Fernanda / joint) into a separate Revolut investing account where the ETF is bought. Mark that account with an `is_investment` boolean on `accounts`.
- **D-02:** The €4k is a monthly aggregate, not a single transaction — it can arrive from any of the 3 cash accounts, in one or more transfers.
- **D-03:** Contribution rule: a transfer whose destination is *any* account flagged `is_investment=true` → `flow_type=investimento`. Source-agnostic and amount-agnostic. Counts toward the €100k goal and is excluded from P&L (revenue and costs).
- **D-04:** Plain internal transfers among the 3 cash accounts → `flow_type=transferência` (excluded from P&L, NOT counted toward the goal). Only transfers into the investing account count as `investimento`. (Phase 1 establishes the investimento destination rule; the broader transferência two-leg pairing engine is Phase 2 / CAT-06.)
- **D-05:** "Hit €4k this month" + streak = sum of `investimento` contributions in the calendar month ≥ €4000 — a monthly rollup, replacing the per-transaction `is_planned_4k` flag.
- **D-06:** "Total invested" (MVP) = cumulative contributions (cost basis). Market value is Phase 6. The goal denominator stays cost-basis now, swappable later.
- **D-22:** Multiple investing accounts, generically. The `investimento` rule keys on ANY `is_investment=true` account — never a hardcoded account id. A future second investing account (Adventures/Vanguard VWCE, ISIN IE00BK5BQT80) classifies correctly from day 1 with zero rework. Which bucket a contribution belongs to is Phase 3 routing — not Phase 1. If an investing account is NOT exposed over PSD2, represent it as a virtual `accounts` row (`is_investment=true`, marked not-synced) so the outgoing transfer's destination can still resolve to it.
- **D-23:** Contribution write-path — single source of truth = `transactions`. Phase 1 classifies `investimento` on `transactions` and does NOT populate `investment_contributions`. "Total invested" is derived: `SUM(amount_eur) WHERE flow_type = investimento`. This structurally prevents double-counting. `investment_contributions` is reserved for Phase 3 / Phase 6.

**Classification on ingest — basic rules engine (CAT-01, CAT-02, CAT-07)**
- **D-17:** Phase 1 produces classified transactions. A basic versioned `rules` engine assigns `category`, `cost_center`, and `flow_type` on ingest, plus an `is_recurring` flag. (The `rules` table already exists from Phase 0.) Rules are versioned; a transaction records which rule/version classified it.
- **D-18:** `flow_type` rules: salary / employer income → faturamento; transfer into the investing account → investimento (D-03, destination-based); transfer among the 3 cash accounts → transferência; everything else → custo (default). Investimento and transferência are excluded from P&L.
- **D-19:** Default `cost_center` per account (CAT-07): Lorenzo's personal → Lorenzo, Fernanda's → Fernanda, joint → Shared — applied automatically on ingest. (Per-transaction override + the recategorize UI are Phase 2.)
- **D-20:** Fixed category taxonomy (CAT-01): `group` = essential | desire | investment, seeded. Phase 1 ensures the taxonomy is sufficient for ingest-time rules; rich category management is Phase 2.
- **D-21:** Suggested plan shape: 1.1 Connect, 1.2 Normalize + dedupe, 1.3 Rules + scheduler. (Planner may refine.)

**Connecting the bank (one-time consent)**
- **D-07:** One-time consent done in the browser (authorize at Revolut) via a local script `pnpm eb:connect` run once, which saves the session. No in-app admin page in the MVP.
- **D-08:** A single consent connects all 3 cash accounts (+ the investing account if the spike finds it exposed).
- **D-09:** Secrets — Enable Banking App ID + RS256 private key + the saved session live in GitHub Secrets (for the cron) and `.env.local` (for local). The private key is never committed.
- **D-10:** Re-consent — store `consent_status` + `expires_at` in `connections`; show the reconnect state in-app; re-run `pnpm eb:connect` when it expires. The discovery spike confirms the real consent-window length (90 vs ~180 days).

**Cron + pull strategy**
- **D-11:** Daily GitHub Actions cron, off-peak Europe/Berlin ~06:00 CET, once/day (respects ~4 calls/account/day budget).
- **D-12:** Each run pulls transactions since the last successful pull (incremental) + a balances snapshot per account → `balances`. Idempotent upsert via `dedupe_hash`.
- **D-13:** A keep-alive heartbeat write every run (logged in `import_batches`) keeps Supabase from auto-pausing — even on a zero-transaction day.
- **D-14:** A failed/empty run records its status (no silent crash); the "data as of {date}" banner reflects staleness. Forward-only — no backfill. Active alerts are Phase 7.

**Freshness & reconnect UX (ING-05, ING-06)**
- **D-15:** A "data as of {date}" freshness banner shown across the app (global) reflecting the last successful pull / staleness.
- **D-16:** The reconnect-needed state (consent expired / 403) is a visible in-app banner (passive, not blocking) prompting a re-run of `pnpm eb:connect`. Push/email alerts are Phase 7.

### Claude's Discretion
- **Discovery spike (ING-01, first task):** enumerate exactly which Revolut accounts/pockets Enable Banking exposes — crucially whether the investing account is exposed over PSD2. This determines whether `investimento` is detected via the incoming leg (investing account exposed) or via the outgoing transfer's counterparty/description (investing account NOT exposed — the likely case). Also confirm the real consent-window length and the transaction field shapes (booking vs value date, pending→booked, amount signs, bank tx id stability).
- **`dedupe_hash` normalization** — follow the design in `00-RESEARCH.md` / `ARCHITECTURE.md` (account + booking_date + amount + normalized description + bank tx id; versioned fallback when the bank id is unstable). Confirm against live payloads.
- **Freshness banner placement** (global header vs a layout slot) — small detail, Claude's discretion.

### Deferred Ideas (OUT OF SCOPE)
- Rule-management UI — recategorize / create-rule from a transaction (CAT-04), explicit re-apply (CAT-05); the transferência two-leg pairing refinement (CAT-06) → Phase 2.
- P&L, cost-center budgets, spending views, dashboards (BI-01..07) → Phase 2.
- In-app admin/connection management page → not in MVP (local `pnpm eb:connect` instead).
- Active reconnect/budget alerts (push/email) → Phase 7.
- Live ETF market value / holdings valuation → Phase 6.
- Historical backfill → never (forward-only).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ING-01 | 3 Revolut accounts connected via Enable Banking (Restricted Production) + documented enumeration of which accounts/pockets PSD2 exposes (discovery spike) | `pnpm eb:connect` runs `GET /aspsps` → `POST /auth` → `POST /sessions`; the spike logs the returned `accounts[]` (Standard Stack; Pattern 1; Pitfall 4). |
| ING-02 | Daily GitHub Actions cron pulls transactions + balances (pull-only; JWT RS256 via `jose`; `service_role` from CI secret) | Live API + `jose` signing (Standard Stack); GitHub Actions cron pattern (Pattern 5); `service_role` write boundary (Architecture map). |
| ING-03 | Idempotent — `dedupe_hash` + DB UNIQUE → a re-pull adds zero duplicate rows | `dedupe_hash` composition + versioned fallback (Pattern 2); `ON CONFLICT (dedupe_hash) DO NOTHING` (Don't Hand-Roll; Pitfall 2). |
| ING-04 | Each run grouped into an `import_batches` audit row + a guaranteed DB write every run (keep-alive, even on zero-transaction days) | `import_batches` table + heartbeat (Pattern 3; Schema Migration); keep-alive mechanics (Pitfall 6). |
| ING-05 | `connections.expires_at` stored from the real API response; 403/re-auth → loud "reconnect needed" state | `access.valid_until` from `POST /sessions` + error classification (Pattern 4; Pitfall 3; Pitfall 5). |
| ING-06 | Every dashboard shows a "data as of {date}" freshness banner; stale/disconnected data visibly flagged | Read `connections.last_pull_at` + `consent_status` (Validation Architecture; downstream Phase 2 reads). |
| CAT-01 | Fixed category taxonomy (`group` = essential\|desire\|investment, with `parent_id`) | Already seeded in Phase 0; Phase 1 ensures sufficiency for the ingest rules (Rules Engine). |
| CAT-02 | Versioned `rules` engine assigns `category`, `cost_center`, `flow_type` by priority on ingest | Versioned ordered rules engine, TS, applied at ingest (Pattern 6; Code Examples). |
| CAT-03 | €4k contribution classified `flow_type=investimento`, excluded from costs+revenue; credit leg never revenue | Destination = ANY `is_investment=true` account; virtual-row resolution when not PSD2-exposed (Rules Engine; Pitfall 1). |
| CAT-07 | Each account has a default cost center applied automatically on ingest | `accounts.default_cost_center` already exists; rules engine applies it as the base (Rules Engine). |
</phase_requirements>

## Summary

Phase 1 is the **make-or-break correctness phase**: it turns the empty Phase-0 schema into a daily, idempotent, *already-classified* feed of the couple's Revolut transactions. Three things must be exactly right, and all three are verifiable cheaply: (1) **idempotency** — re-pulling an overlapping window adds zero rows, guaranteed by a deterministic `dedupe_hash` and a DB `UNIQUE` constraint with `ON CONFLICT DO NOTHING`; (2) **the €4k → `investimento` classification** — a transfer whose destination is *any* `is_investment=true` account is never a cost and never revenue, fed to the €100k goal exactly once; and (3) **loud staleness** — when consent lapses (403) or the cron silently misses, the app shows a "data as of {date}" banner and a reconnect prompt rather than freezing on dead numbers.

The live Enable Banking REST API was **verified against enablebanking.com/docs** this session and matches the Phase-0 skeleton: `GET /aspsps` → `POST /auth` (returns a bank redirect `url` + `authorization_id`) → the user does SCA at Revolut → `POST /sessions` (exchanges the `code` for a `session_id` + an `accounts[]` list of account `uid`s) → headless `GET /accounts/{uid}/transactions` (paginated by `continuation_key`, filtered by `date_from`) and `GET /accounts/{uid}/balances`. The JWT is RS256 with `kid=<app id>`, `iss=enablebanking.com`, `aud=api.enablebanking.com`, `exp ≤ 24h` — use 1h. The transaction object carries everything the dedupe + rules need: `transaction_id`, `entry_reference`, `status` (BOOK/PEND), `booking_date`, `value_date`, `transaction_amount.{amount,currency}`, `credit_debit_indicator` (CRDT/DBDT — **the canonical sign source**, not the amount string), `creditor`/`debtor` (name + IBAN), and `remittance_information[]`.

The two genuine unknowns — **which Revolut accounts/pockets are exposed** (especially the investing account) and **the exact consent-validity value** — are exactly what the **discovery spike (ING-01, first task)** resolves. Design defensively for the likely case: the investing account is NOT exposed over PSD2, so `investimento` is detected on the *outgoing* leg (counterparty/IBAN/description matching a virtual `is_investment=true` account row), and the real `access.valid_until` from the session response drives `connections.expires_at` (PSD2 max is **180 days** since 2023-07-25; the actual token validity is region-dependent and must be read, not hardcoded).

**Primary recommendation:** Build three thin, well-separated modules — `eb:connect` (one-time interactive consent → persist `session_id` + `expires_at`), `ingest.ts` (headless: sign JWT → pull transactions since `last_pull_at` + a balances snapshot → normalize → `dedupe_hash` → `ON CONFLICT DO NOTHING` upsert → apply versioned rules → write the `import_batches` heartbeat), and a pure, unit-tested `rules` engine — wired to a GitHub Actions cron at `17 5 * * *` (06:17 CET, off-peak, odd minute), writing through the existing `service.ts` `service_role` chokepoint, behind a forward-only, fail-soft contract.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| One-time SCA consent (`pnpm eb:connect`) | Local dev machine (interactive tsx script) | Browser (Revolut SCA page) | SCA needs a human; runs once on Lorenzo's machine, opens the bank URL, captures the redirect `code`. Never automated, never in CI. |
| RS256 JWT signing | CI / Backend (GitHub Actions, server-only) | — | The private key is a GitHub Secret; the JWT is signed per-run with `jose`. Never reaches the browser. |
| Transaction/balance pull | CI / Backend (GitHub Actions cron) | — | Pull-only PSD2; runs outside Vercel so `service_role` never enters the Vercel runtime. |
| Normalize → dedupe → upsert | CI / Backend (pure TS + `service_role` write) | Database (UNIQUE constraint enforces idempotency) | Pure functions are deterministic + testable; the DB constraint is the real safety net. |
| Classify-on-ingest (rules engine) | CI / Backend (pure TS, applied at write time) | Database (stamps `rule_id`, `flow_type`, `cost_center`, `category_id`) | Versioned ordered rules; stamping at write time keeps history comparable (no silent rewrites). |
| Consent/freshness state | Database (`connections.consent_status`, `last_pull_at`, `expires_at`) | Frontend Server (reads + renders the banner) | The cron writes status; the app reads it under RLS for ING-05/ING-06. |
| Freshness + reconnect banner | Frontend Server (Server Component, RLS read) | Browser (renders banner) | Read-plane concern; reads `connections` via `@supabase/ssr` under the user JWT. |
| Schema migration | Database / Build-time (Drizzle + custom SQL for RLS) | — | New columns via Drizzle; new `import_batches` table needs RLS in a custom SQL migration (Phase-0 posture). |

## Standard Stack

### Core
| Library | Version (verified npm, 2026-06-22) | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `jose` | `6.2.3` | Sign the RS256 JWT for Enable Banking (`kid` header, `exp`) | Pure-ESM, zero-dep, first-class `kid` support; cleaner than `jsonwebtoken` for this. 87M weekly downloads, official `github.com/panva/jose`. [VERIFIED: npm registry] |
| `tsx` | `4.22.4` | Run the TypeScript ingest + connect scripts directly (`npx tsx scripts/ingest.ts`) in CI and locally | The standard zero-config TS runner for one-off scripts; 70M weekly downloads, official `github.com/privatenumber/tsx`. [VERIFIED: npm registry] *(seam flagged `too-new` for a routine point release — false positive)* |
| `@supabase/supabase-js` | `2.108.2` (already installed) | The `service_role` client the cron writes through (`service.ts`) | Already the locked Supabase client; `service.ts` chokepoint exists from Phase 0. [VERIFIED: npm registry] |
| `zod` | `4.4.3` (already installed) | Validate the untrusted Enable Banking JSON payloads before normalizing/writing | Bank payloads are external/untrusted; validate at the ingestion boundary (V5 input validation). [VERIFIED: npm registry] |
| `date-fns` | `4.4.0` (already installed) | `date_from` math, `period_key` (YYYYMM) derivation, `expires_at` day-math, timezone-safe date handling | Already in the stack; deterministic date handling for the incremental window + the monthly rollup. [VERIFIED: npm registry] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `node:crypto` (built-in) | Node 20 | `sha256` for `dedupe_hash` | No dependency needed — `createHash('sha256')`. Deterministic, server-only. [VERIFIED: Node built-in] |
| `postgres` / `drizzle-orm` | `3.4.9` / `0.45.2` (installed) | Schema migration for the new columns + `import_batches` table | Drizzle owns the DDL (`db:generate` → `db:migrate`); RLS on the new table is a custom SQL migration. [VERIFIED: npm registry] |
| `server-only` | `0.0.1` (installed) | Keep any ingestion helper imported into the app server-only | Already guards `service.ts`. Ingestion lives in `scripts/` / `ingestion/`, outside the Next bundle entirely. [VERIFIED: npm registry] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `jose` (RS256) | `jsonwebtoken` | Works, but CJS, heavier, and the `kid` header ergonomics are worse. Stay with `jose` (locked in STACK.md). |
| `tsx scripts/ingest.ts` | Compile with `tsc` then `node` | Extra build step for a one-file script; `tsx` is simpler and CI-standard. Use `tsx`. |
| `node:crypto` sha256 | a hashing npm lib | Unnecessary dependency; the built-in is deterministic and audited. Use `node:crypto`. |
| Enable Banking REST direct | Enable Banking Node SDK | The docs center on the REST API; a thin typed fetch wrapper (validated with `zod`) is more transparent and avoids an extra dep with unknown maintenance. Recommend hand-rolled typed fetch + `zod`. |
| GitHub Actions cron | Vercel Cron / Supabase pg_cron | Vercel Hobby cron would put `service_role` in the Vercel runtime and is limited; pg_cron can't reach the external EB API with the private key cleanly. GitHub Actions is locked + correct (also doubles as keep-alive). |

**Installation:**
```bash
# Ingestion script deps (jose for signing; tsx to run TS scripts)
pnpm add jose
pnpm add -D tsx
# zod, date-fns, @supabase/supabase-js, postgres, drizzle-orm, server-only — already installed (Phase 0)
```

**package.json scripts to add:**
```jsonc
{
  "scripts": {
    "eb:connect": "tsx scripts/eb-connect.ts",   // D-07: one-time interactive consent
    "ingest": "tsx scripts/ingest.ts"            // ING-02: the headless daily pull (also run by the cron)
  }
}
```

**Version verification:** `jose@6.2.3` (mod. 2026-04-27), `tsx@4.22.4` (mod. 2026-05-31), `zod@4.4.3`, `date-fns@4.4.0`, `@supabase/supabase-js@2.108.2` — all confirmed via `npm view <pkg> version` on 2026-06-22.

## Package Legitimacy Audit

Run on 2026-06-22 via `gsd-tools query package-legitimacy check --ecosystem npm`.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `jose` | npm | est. 6+ yrs | ~87M/wk | github.com/panva/jose | OK | Approved |
| `tsx` | npm | est. 3+ yrs (point release 2026-05-31) | ~70M/wk | github.com/privatenumber/tsx | SUS→**OK** | Approved (false positive) |
| `zod`, `date-fns`, `@supabase/supabase-js`, `postgres`, `drizzle-orm`, `server-only` | npm | established | high | official repos | OK | Approved (Phase 0 audit) |

**Note on the `tsx` SUS verdict:** flagged **only** for the `too-new` heuristic (a routine recent point release `4.22.4`). It is the canonical TS runner with ~70M weekly downloads, an official `github.com/privatenumber/tsx` repo, and no postinstall script (`npm view tsx scripts.postinstall` → empty). **False positive — treat as OK.** No checkpoint required.

**Packages removed due to [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** none requiring action.

## Architecture Patterns

### System Architecture Diagram

```
                          WRITE PLANE (server-only, service_role) — GitHub Actions
  ┌───────────────────────────────────────────────────────────────────────────────────┐
  │                                                                                     │
  │  ONE-TIME (local, interactive)            DAILY CRON (headless, ~06:17 CET)         │
  │  ┌──────────────────────────┐             ┌───────────────────────────────────┐    │
  │  │ pnpm eb:connect           │             │ scripts/ingest.ts                  │    │
  │  │  1 sign JWT (jose, kid)   │             │  1 sign JWT (jose, exp=1h)         │    │
  │  │  2 GET /aspsps (DE,       │             │  2 read connections.session_id +   │    │
  │  │      psu_type=personal)   │             │      last_pull_at + expires_at     │    │
  │  │  3 POST /auth →           │             │  3 for each account uid:           │    │
  │  │      { url, auth_id }      │   persist   │     GET /accounts/{uid}/           │    │
  │  │  4 open url → SCA at      │── session ─▶│       transactions?date_from=…&    │    │
  │  │      Revolut → ?code=…    │  to GitHub  │       continuation_key=… (paginate)│    │
  │  │  5 POST /sessions(code) → │  Secrets +  │     GET /accounts/{uid}/balances   │    │
  │  │      { session_id,        │  connections│  4 normalize (zod) → canonical     │    │
  │  │        accounts[],        │             │       rows (signed EUR, booking_   │    │
  │  │        access.valid_until}│             │       date, counterparty, raw desc)│    │
  │  │  6 write connections row  │             │  5 dedupe_hash per row             │    │
  │  └──────────────────────────┘             │  6 UPSERT transactions             │    │
  │            ▲                               │       ON CONFLICT (dedupe_hash)    │    │
  │            │ re-run on expiry (403)        │       DO NOTHING                    │    │
  │            │                               │  7 applyRules() → flow_type,       │    │
  │   ┌────────┴─────────┐                     │       cost_center, category,       │    │
  │   │ reconnect banner │                     │       is_recurring, rule_id        │    │
  │   │ (app, ING-06)    │                     │  8 UPSERT balances (account,date)  │    │
  │   └──────────────────┘                     │  9 write import_batches heartbeat  │    │
  │                                            │      (status, counts) + advance    │    │
  │                                            │      connections.last_pull_at      │    │
  │                                            │  on 403 → consent_status='expired' │    │
  │                                            │      (no crash, record + exit 0)   │    │
  │                                            └─────────────────┬─────────────────┘    │
  └───────────────────────────────────────────────────────────────┼─────────────────────┘
                                                                  │ service_role
                                                                  ▼
  ┌───────────────────────────────────────────────────────────────────────────────────┐
  │  SUPABASE POSTGRES (RLS on every table)                                            │
  │   accounts(+is_investment,+enable_banking_id)  connections(+consent_status,        │
  │   transactions(+description_raw,+counterparty,+is_recurring)  +last_pull_at)        │
  │   balances   rules   categories   import_batches(NEW, RLS-enabled)                 │
  └───────────────────────────────────────────────────────────────┬───────────────────┘
                                              anon/user key (RLS) │ reads
  ┌───────────────────────────────────────────────────────────────▼───────────────────┐
  │  READ PLANE (Next 15 app) — "data as of {date}" banner + reconnect banner          │
  │   Server Component reads connections.last_pull_at / consent_status under RLS        │
  └───────────────────────────────────────────────────────────────────────────────────┘
```

Trace the primary use case (a daily pull that lands the €4k already classified): cron fires → `ingest.ts` signs a 1h JWT → reads `session_id` + `last_pull_at` from `connections` → `GET …/transactions?date_from=<last_pull_at − overlap>` paginated by `continuation_key` → each raw transaction is `zod`-validated and normalized to a signed-EUR canonical row (sign from `credit_debit_indicator`, date = `booking_date`) → `dedupe_hash` computed → `ON CONFLICT (dedupe_hash) DO NOTHING` upsert (re-pull adds zero rows) → `applyRules()` sees the outgoing transfer's counterparty/IBAN matches the virtual `is_investment=true` account → stamps `flow_type=investimento` + `rule_id` → balances snapshot written → `import_batches` heartbeat row written (keep-alive) → `connections.last_pull_at` advanced. The app later reads `last_pull_at` and renders "data as of today".

### Recommended Project Structure
```
scripts/
├── eb-connect.ts          # D-07: one-time interactive SCA consent → persist session
└── ingest.ts              # ING-02: headless daily pull (run locally + by the cron)
src/lib/ingestion/         # pure, unit-testable modules (server-only; NOT in the Next bundle)
├── enable-banking/
│   ├── jwt.ts             # signEbJwt() — RS256 via jose, kid=app id, exp=1h
│   ├── client.ts          # typed fetch wrapper: aspsps(), auth(), sessions(), transactions(), balances()
│   └── schemas.ts         # zod schemas for /sessions, transaction, balance payloads
├── normalize.ts           # rawTx → Normalized (signed EUR, booking_date, counterparty, description_raw)
├── dedupe.ts              # dedupeHash(Normalized) → sha256, versioned (v1 id-based, v2 composite fallback)
└── rules/
    ├── engine.ts          # applyRules(tx, rules, accounts) → classification (pure)
    └── builtins.ts        # the seeded Phase-1 rules (investimento / transferência / faturamento / custo)
src/lib/db/schema.ts       # EXTEND: new columns + import_batches table
drizzle/
├── 0003_ingestion.sql     # generated: new columns + import_batches
└── 0004_ingestion_rls.sql # custom: RLS enable + allowlist policy on import_batches
.github/workflows/
└── ingest.yml             # daily cron (17 5 * * *) + workflow_dispatch
test/
├── dedupe.test.ts         # double-pull idempotency (ING-03)
├── normalize.test.ts      # sign convention, booking vs value date, pending→booked
└── rules.test.ts          # investimento / transferência / faturamento / custo / default cost_center (CAT-02/03/07)
```

### Pattern 1: One-time interactive consent, then headless reuse (D-07, D-08, ING-01)
**What:** `pnpm eb:connect` runs the *interactive* part of the flow once (steps that need a human + a browser), persists the durable artifacts (`session_id`, the `accounts[]` uids, `access.valid_until`), and the cron then only does the headless part. The two never overlap.
**When to use:** Always — SCA cannot be automated; isolating it to a one-time script is the whole design.
**The verified flow:**
1. `GET /aspsps?country=DE&psu_type=personal` → confirm Revolut is listed; read its `maximum_consent_validity` to know the legal ceiling for `valid_until`. [CITED: enablebanking.com/docs/api/reference]
2. `POST /auth` with `{ access: { valid_until }, aspsp: { name, country: "DE" }, psu_type: "personal", state: <uuid>, redirect_url: <whitelisted> }` → returns `{ url, authorization_id, psu_id_hash }`. [CITED: enablebanking.com/docs/api/reference]
3. The script opens `url` (or prints it) → the user completes **SCA at Revolut** → Revolut redirects to `redirect_url?code=<...>&state=<...>`. For a local script, run a tiny one-shot localhost HTTP listener on the whitelisted `redirect_url` (e.g. `http://localhost:3000/eb/callback`) to capture `code`. [CITED: enablebanking.com/docs/api/quick-start]
4. `POST /sessions` with `{ code }` → returns `{ session_id, accounts: [{ uid, account_id: { iban }, name, currency, cash_account_type, usage, ... }], access: { valid_until } }`. **Persist `session_id` + each account `uid` + `valid_until`.** [CITED: enablebanking.com/docs/api/reference]
5. Write the `connections` row(s) + ensure an `accounts` row exists per returned account (matched by IBAN/`identification_hash`), set `enable_banking_id = uid`, `consent_status='active'`, `expires_at = valid_until`.

**Where the artifacts live (D-09):**
- **RS256 private key** (`.pem`): GitHub Secret `ENABLE_BANKING_PRIVATE_KEY` + `.env.local` for the local run. **Never committed.**
- **App id:** GitHub Secret `ENABLE_BANKING_APP_ID` + `.env.local` (it's the JWT `kid`; not as sensitive but keep out of git for cleanliness).
- **`session_id` + account uids:** stored in the **`connections` table** (Postgres) — the cron reads them from the DB on each run, NOT from a secret. This is the cleanest: one source of truth, queryable, and `eb:connect` simply upserts it. (Storing `session_id` in a GitHub Secret is the fallback if you'd rather the cron not read it from the DB, but the DB is preferable — the app already needs to read `connections` for the banner.)

**Re-consent on expiry:** when the cron gets a 403/re-auth, it sets `connections.consent_status='expired'`; the app banner (ING-06) tells Lorenzo to re-run `pnpm eb:connect`, which performs the full interactive flow again and upserts a fresh `session_id` + `expires_at`. Forward-only: no backfill of the gap.

### Pattern 2: Deterministic, versioned `dedupe_hash` with a composite fallback (ING-03, Pitfall 2)
**What:** Every normalized row carries `dedupe_hash`. Prefer the bank's stable id; fall back to a composite when it's absent/unstable; record which strategy produced the hash so it's auditable.
**When to use:** Always — this is the idempotency invariant of the whole product.
**Recommended composition (confirm input stability in the spike):**
```typescript
// dedupe.ts — pure, no DB. node:crypto sha256.
import { createHash } from "node:crypto";

const HASH_VERSION = "v1";

export function dedupeHash(t: Normalized): { hash: string; strategy: "bank_id" | "composite" } {
  const sha = (s: string) => createHash("sha256").update(s).digest("hex");
  // Prefer a stable bank id. Enable Banking exposes both transaction_id and entry_reference;
  // the spike confirms which is present+stable for Revolut. Use transaction_id, else entry_reference.
  const bankId = t.bankTxId ?? "";
  if (bankId) {
    return { hash: sha([HASH_VERSION, "id", t.accountId, bankId].join("|")), strategy: "bank_id" };
  }
  // Fallback: composite of frozen, stable fields. booking_date NOT value_date (value_date moves).
  return {
    hash: sha([
      HASH_VERSION, "composite",
      t.accountId,
      t.bookingDate,            // YYYY-MM-DD — stable once booked
      t.amount.toFixed(2),      // signed EUR, normalized
      t.normalizedDescription,  // lowercased, whitespace-collapsed, volatile tokens stripped
    ].join("|")),
    strategy: "composite",
  };
}
```
**Critical contract:** the normalization function (and `HASH_VERSION`) is **frozen**. Changing it changes every hash → treat as a migration. The DB `UNIQUE(dedupe_hash)` (already in schema) + `ON CONFLICT DO NOTHING` is the real safety net — app-side checking is never sufficient. **Pin the hash to `booking_date`, never `value_date`** (Pitfall 5).
**Pending→booked:** a PEND row that later BOOKs typically gets a *different* identity (different date/id) — it will land as a new row and the pending one stays. Recommended Phase-1 policy: **exclude `status=PEND` from ingestion entirely** (only ingest BOOK), which sidesteps the pending→booked mutation problem cleanly. The spike confirms whether Revolut returns PEND rows at all.

### Pattern 3: `import_batches` audit + guaranteed heartbeat write (ING-04, Pitfall 6)
**What:** Each cron run creates one `import_batches` row (started_at, finished_at, status, source, counts: fetched/inserted/skipped). Every transaction references `import_batch_id`. The batch row is written **every run, unconditionally** — even on a zero-transaction or failed-auth day — so the Supabase 7-day inactivity timer always resets (the cron *is* the keep-alive).
**When to use:** Always for an unattended pipeline.
**Key:** write the heartbeat in a `finally` so a partial failure still records a row. Status values: `success | empty | auth_expired | error`.

### Pattern 4: Fail-soft consent/error classification (ING-05, Pitfall 3)
**What:** The cron distinguishes an **auth-expiry error (401/403/re-auth-required)** from a transient error. On auth-expiry it sets `connections.consent_status='expired'`, writes an `import_batches` row with `status='auth_expired'`, and **exits 0** (no crash, no red CI that masks the real signal) — the app banner is the alert. Transient errors (5xx, network, 429) record `status='error'` and may exit non-zero so the CI run is visibly failed.
**When to use:** Always — silent retry on expiry is the classic "dashboards quietly freeze" failure.
**`access.valid_until` is read, never hardcoded:** store the exact value from `POST /sessions` in `connections.expires_at`. The app surfaces days-remaining (Phase 7 builds the proactive reminder on this).

### Pattern 5: Off-peak, idempotent, overlap-tolerant GitHub Actions cron (ING-02, Pitfall 7)
**What:** `schedule: "17 5 * * *"` (UTC) = **06:17 Europe/Berlin in winter (CET)**, **07:17 in summer (CEST)** — off-peak, an odd minute (avoid on-the-hour/midnight-UTC which GitHub sheds under load). `workflow_dispatch` for manual re-runs. The job is idempotent (Pattern 2) so a delayed catch-up run re-pulling an overlapping window is safe.
**When to use:** Always for the daily pull.
> ⚠️ **CET vs CEST caveat:** GitHub cron is UTC-only and does NOT observe DST. `17 5 * * *` is 06:17 in winter and 07:17 in summer. This is acceptable (still off-peak, still daily). Document it; do not try to "fix" DST with two schedules — the daily cadence and keep-alive margin are what matter, not the exact minute.

### Pattern 6: Versioned, ordered, pure rules engine applied at ingest (CAT-02, D-17)
**What:** `applyRules(tx, rules, accountsById)` is a **pure function**: it evaluates ordered rules (by `priority`) against a normalized transaction and returns `{ flowType, costCenter, categoryId, isRecurring, ruleId }`. The cron stamps these onto the row at write time and records `rule_id` (and the rule's `version`) for auditability. Editing a rule does **not** silently rewrite history (re-apply is an explicit Phase-2 action).
**When to use:** Always at ingest — transactions land already classified.
**The ordered rule set (D-18, D-19, evaluated first-match-wins by priority):**
1. **investimento** (highest priority, D-03/D-22): outflow (`DBDT`) whose **destination resolves to ANY `accounts` row with `is_investment=true`**. If that account is PSD2-exposed, match by `creditor_account.iban` / `enable_banking_id`. If NOT exposed (the likely case), match the **virtual `is_investment=true` account** by its stored IBAN or a counterparty/description signature captured during the spike → `flow_type=investimento`. Source-agnostic, amount-agnostic.
2. **transferência** (D-04): a transfer whose counterparty is **another of the couple's own cash accounts** (creditor/debtor IBAN ∈ the 3 cash accounts' IBANs) → `flow_type=transferência`. (Phase-1 = destination/IBAN match; Phase-2 CAT-06 adds two-leg pairing.)
3. **faturamento** (D-18): an inflow (`CRDT`) matching a salary/employer signature (counterparty name / remittance keyword, seeded from the spike) → `flow_type=faturamento`.
4. **custo** (default, D-18): everything else → `flow_type=custo`.
**Then, independent of flow_type:**
- **cost_center (CAT-07, D-19):** default to `accounts.default_cost_center` for the transaction's account (Lorenzo/Fernanda/Shared). A rule may override, but the account default is the base — applied automatically.
- **is_recurring:** flagged when the same normalized counterparty+amount(±) recurs on a monthly cadence (Phase-1: a simple heuristic — counterparty seen in ≥2 prior months at a similar amount; the spike/seed can pre-mark known recurring merchants). Conservative default `false`.
- **category_id:** from the matched rule's `set_category`, else null (Phase-2 enriches).

> ⚠️ **enum-naming mismatch (planner must resolve):** the Phase-0 schema enum is `flow_type = ['revenue','cost','investimento','transferencia']` (see `schema.ts` line 36) — i.e. **`revenue`/`cost`/`transferencia`**, while CONTEXT D-18 uses the Portuguese labels **`faturamento`/`custo`/`transferência`**. These are the **same four concepts**. The planner must choose ONE representation and be consistent: either (a) keep the existing enum values (`revenue`/`cost`/`transferencia`/`investimento`) and treat the Portuguese words as display labels, or (b) alter the enum to the Portuguese set. **Recommendation: keep the existing enum values** (`revenue`/`cost`/`investimento`/`transferencia`) — they're already in the schema, RLS, and seed; renaming an in-use Postgres enum is a migration with no functional benefit. Map: faturamento=`revenue`, custo=`cost`, investimento=`investimento`, transferência=`transferencia`. (See Assumptions A1.)

### Anti-Patterns to Avoid
- **Hardcoding the investing account id in the investimento rule.** Key on `is_investment=true` (D-22) so a 2nd investing account works from day 1.
- **Using `value_date` for the dedupe hash or period assignment.** It moves; use `booking_date` (Pitfall 5).
- **Trusting the amount's sign from the bank.** Derive sign from `credit_debit_indicator` (CRDT=+, DBDT=−); normalize every row to one convention (outflow negative).
- **Silent retry on 403.** Classify auth-expiry as a loud state (Pattern 4).
- **Counting the €4k credit leg as revenue** (if the investing account is exposed). The destination credit must also be excluded — the investimento rule + transferência rule together must catch both legs (Pitfall 1).
- **Letting the cron crash on an empty/expired day.** Always write the `import_batches` heartbeat in `finally` (keep-alive).
- **Importing anything from `scripts/` or `ingestion/` into the Next app bundle.** Ingestion is write-plane only.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| RS256 JWT signing with a `kid` | Manual base64url + `crypto.sign` | `jose` `SignJWT().setProtectedHeader({alg:'RS256',kid}).sign(key)` | Header/claim encoding + key import edge cases are subtle; `jose` is audited |
| Idempotent insert | App-side "does this exist?" check | DB `UNIQUE(dedupe_hash)` + `ON CONFLICT DO NOTHING` | Race-free; the constraint is the safety net, not app code (Pitfall 2) |
| Bank payload trust | Assume shape, index fields | `zod` schema per payload, parse at the boundary | External/untrusted data; a shape change should fail loudly, not corrupt rows |
| sha256 | A hashing lib | `node:crypto` `createHash('sha256')` | Built-in, deterministic, zero deps |
| Pagination | Guess offsets | The API's `continuation_key` loop | The documented mechanism; offset paging isn't offered |
| Date/period math | `new Date()` string slicing | `date-fns` (`format`, `subDays`, `parseISO`) | Timezone + month-boundary correctness for `date_from` and `period_key` |
| Keep-alive | A separate ping workflow | The ingest job's guaranteed `import_batches` write | A real DB write resets the 7-day timer; a static ping doesn't (Pitfall 6) |

**Key insight:** In this pipeline the hard parts are not the API calls — they are **determinism** (stable hash, frozen normalization, sign-from-indicator) and **fail-soft observability** (heartbeat, consent classification). The libraries above remove the deceptively-tricky pieces (JWT encoding, race-free upsert, payload validation) so the team's code is just the deterministic glue, which is exactly what must be unit-tested.

## Runtime State Inventory

> Phase 1 is mostly additive (new ingestion code + new columns), but it introduces **durable runtime state outside git** (the consent session + secrets). This inventory makes that explicit.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| **Stored data** | (a) The `connections` row(s) holding `session_id` + account uids + `expires_at` — written by `eb:connect`, read by the cron. (b) `accounts` rows for each exposed Revolut account, matched by IBAN, with `enable_banking_id=uid`. (c) A **virtual `accounts` row** for the investing account if NOT PSD2-exposed (`is_investment=true`, `enable_banking_id=null`, marked not-synced) — D-22. | Code: `eb:connect` upserts connections + accounts; the migration adds the columns; the seed/spike inserts the virtual investing-account row with its IBAN signature. |
| **Live service config** | The Enable Banking **application registration** (Restricted Production) + the **whitelisted `redirect_url`** live in the Enable Banking Control Panel (a dashboard, NOT git). The SCA consent itself is a Revolut-side authorization, re-done on expiry. | Manual one-time: register the app (Restricted Production), generate the RSA key, whitelist the `redirect_url` (`http://localhost:3000/eb/callback` for the local `eb:connect`). Document in the spike. |
| **OS-registered state** | None — no OS scheduler (GitHub Actions, not cron/launchd); no installed daemons. | — |
| **Secrets/env vars** | `ENABLE_BANKING_APP_ID`, `ENABLE_BANKING_PRIVATE_KEY` (the `.pem`), `SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — set in **GitHub Secrets** (cron) + **`.env.local`** (local `eb:connect`/`ingest`). The private key is **never committed** (source-cleanliness guard catches leaks). | Provision all 4 in GitHub Secrets + `.env.local`. Verify `ENABLE_BANKING_PRIVATE_KEY` is multi-line-safe in GitHub Secrets (it is — secrets preserve newlines). |
| **Build artifacts** | None — `tsx` runs TS directly; no compiled binary or egg-info to go stale. | — |

**The canonical question — after the migration runs, what runtime state must exist for the cron to work?** A valid `connections.session_id` (created by `eb:connect`, not the migration) and the 4 secrets. The migration alone does NOT make ingestion runnable; `pnpm eb:connect` must be run once first (ING-01).

## Common Pitfalls

### Pitfall 1: The €4k contribution leaking into costs, or double-counting (CAT-03)
**What goes wrong:** The €4k outflow is binned as a normal `custo`, inflating cost centers and destroying margin; or it's counted *both* as a cost and as goal progress; or (if the investing account is exposed) the matching credit leg is counted as `revenue`.
**Why it happens:** PSD2 exposes legs with no inherent "this is my own transfer" flag.
**How to avoid:** The investimento rule (highest priority, destination = ANY `is_investment=true` account, D-03/D-22) catches the outflow → `flow_type=investimento` (never cost/revenue). If the investing account is exposed, the transferência/investimento rules together must also exclude the credit leg. €100k = `SUM(amount_eur) WHERE flow_type=investimento` (D-23) — counted exactly once, from `transactions` only.
**Warning signs:** cost centers spike ~€4k in contribution months; €100k and costs both rise €4k the same month.

### Pitfall 2: `dedupe_hash` instability → duplicates or dropped rows (ING-03)
**What goes wrong:** Unstable hash → same real transaction inserts twice (inflated spend); too-coarse hash → real transactions silently dropped (€4k could go missing).
**Why it happens:** description normalization drifts; `value_date` flips between pulls; the bank id is missing/non-unique for some entries.
**How to avoid:** Pattern 2 — prefer a stable bank id, composite fallback pinned to `booking_date`, frozen+versioned normalization, DB `UNIQUE` + `ON CONFLICT DO NOTHING`, exclude PEND.
**Warning signs:** row count grows on a no-spend day; near-zero `ON CONFLICT` match rate when re-pulling an overlapping window (means hashes aren't matching).

### Pitfall 3: Consent expiry surprise (90 vs 180 days), silent staleness (ING-05)
**What goes wrong:** Consent lapses, the daily pull 403s, and nobody notices because there are no webhooks — dashboards freeze on dead data.
**Why it happens:** the cron treats 403 like a transient error and retries silently; the window was hardcoded.
**How to avoid:** store the real `access.valid_until` in `connections.expires_at` (PSD2 max is 180 days since 2023-07-25, but the token validity is region-dependent — read it); classify 403 as a loud `consent_status='expired'` state (Pattern 4); always show "data as of {date}" (ING-06).
**Warning signs:** "data as of" stops advancing; cron logs show repeated 403.

### Pitfall 4: Investment pocket likely NOT exposed over PSD2 (ING-01)
**What goes wrong:** The €100k goal is built assuming the investing account's transactions/balance are readable; PSD2 usually excludes investment/savings pockets, so only the *outgoing* transfer from a current account is visible.
**Why it happens:** PSD2 mandates access to *payment accounts*, not investment accounts.
**How to avoid:** the discovery spike (ING-01) enumerates exactly which accounts `POST /sessions` returns. Design for "not exposed": detect investimento on the **outgoing leg** via a virtual `is_investment=true` account row matched by counterparty IBAN/description (D-22). Build €100k on the contribution leg (cost basis), not an investment balance.
**Warning signs:** fewer accounts returned than expected; the €4k destination has no readable balance.

### Pitfall 5: Sign / pending / booking-vs-value-date (normalize at the boundary)
**What goes wrong:** debits stored positive net against credits; pending counted as final then changes; mixing `value_date` and `booking_date` drifts MoM.
**How to avoid:** one sign convention (outflow negative) derived from `credit_debit_indicator`; `booking_date` is the single period key; exclude PEND from ingestion (Pattern 2). Normalize every row once at the ingestion boundary; never branch on raw bank sign downstream.
**Warning signs:** costs and revenue partially cancel; a transaction's month changes after a later pull.

### Pitfall 6: Supabase free-tier pause / keep-alive that doesn't count (ING-04)
**What goes wrong:** the project pauses after 7 days of DB inactivity; a keep-alive that only pings the app never touches Postgres.
**How to avoid:** the ingest job does a **real DB write every run** (the `import_batches` heartbeat in `finally`), even on zero-transaction days. Verify "last active" advances in the Supabase dashboard after a run.

### Pitfall 7: GitHub Actions cron unreliability (ING-02)
**What goes wrong:** scheduled runs are delayed/dropped under load, and inactive-repo workflows get throttled after ~60 days; no built-in failure alert.
**How to avoid:** off-peak odd-minute schedule (`17 5 * * *`); idempotent + overlap-tolerant job; the ingestion commits/heartbeat keep the repo "active"; the freshness banner is the dead-man's-switch detector (Phase-7 adds proactive alerts).

## Code Examples

Verified patterns; API shapes from enablebanking.com/docs (CITED), signing from `jose` docs.

### RS256 JWT signing for Enable Banking
```typescript
// src/lib/ingestion/enable-banking/jwt.ts
import { SignJWT, importPKCS8 } from "jose";

export async function signEbJwt(appId: string, privateKeyPem: string): Promise<string> {
  const key = await importPKCS8(privateKeyPem, "RS256");
  return new SignJWT({})
    .setProtectedHeader({ typ: "JWT", alg: "RS256", kid: appId }) // kid = application id
    .setIssuer("enablebanking.com")     // iss  [CITED: enablebanking.com/docs/api/reference]
    .setAudience("api.enablebanking.com") // aud
    .setIssuedAt()
    .setExpirationTime("1h")            // exp ≤ 24h; use 1h
    .sign(key);
}
```

### Typed, validated transactions pull with continuation_key pagination
```typescript
// src/lib/ingestion/enable-banking/client.ts (excerpt)
import { z } from "zod";

const TxAmount = z.object({ currency: z.string(), amount: z.string() });
const RawTx = z.object({
  transaction_id: z.string().optional(),
  entry_reference: z.string().optional(),
  status: z.string(),                    // "BOOK" | "PEND"  [CITED: enablebanking.com/docs]
  booking_date: z.string(),              // "YYYY-MM-DD"
  value_date: z.string().optional(),
  credit_debit_indicator: z.enum(["CRDT", "DBDT"]),
  transaction_amount: TxAmount,
  creditor: z.object({ name: z.string().optional() }).optional(),
  creditor_account: z.object({ iban: z.string().optional() }).optional(),
  debtor: z.object({ name: z.string().optional() }).optional(),
  debtor_account: z.object({ iban: z.string().optional() }).optional(),
  remittance_information: z.array(z.string()).optional(),
});
const TxPage = z.object({ transactions: z.array(RawTx), continuation_key: z.string().optional() });

export async function* fetchTransactions(jwt: string, uid: string, dateFrom: string) {
  let key: string | undefined;
  do {
    const qs = new URLSearchParams({ date_from: dateFrom });
    if (key) qs.set("continuation_key", key);
    const res = await fetch(`https://api.enablebanking.com/accounts/${uid}/transactions?${qs}`, {
      headers: { Authorization: `Bearer ${jwt}` },
    });
    if (res.status === 401 || res.status === 403) throw new ConsentExpiredError();
    if (!res.ok) throw new Error(`EB transactions ${res.status}`);
    const page = TxPage.parse(await res.json());
    for (const t of page.transactions) yield t;
    key = page.continuation_key;            // [CITED: enablebanking.com/docs — paginate via continuation_key]
  } while (key);
}
```

### Normalization: sign from indicator, period from booking_date
```typescript
// src/lib/ingestion/normalize.ts (excerpt)
export function normalize(raw: RawTx, accountId: string): Normalized {
  const magnitude = Number(raw.transaction_amount.amount);       // always positive string from EB
  const signed = raw.credit_debit_indicator === "DBDT" ? -magnitude : magnitude; // outflow negative
  const counterpartyName = raw.credit_debit_indicator === "DBDT"
    ? raw.creditor?.name : raw.debtor?.name;
  const counterpartyIban = raw.credit_debit_indicator === "DBDT"
    ? raw.creditor_account?.iban : raw.debtor_account?.iban;
  const descriptionRaw = (raw.remittance_information ?? []).join(" ").trim();
  return {
    accountId,
    bankTxId: raw.transaction_id ?? raw.entry_reference ?? null,
    bookingDate: raw.booking_date,                  // period key — NOT value_date
    amount: signed,                                  // signed EUR
    counterpartyName: counterpartyName ?? null,
    counterpartyIban: counterpartyIban ?? null,
    descriptionRaw,
    normalizedDescription: descriptionRaw.toLowerCase().replace(/\s+/g, " ").trim(),
  };
}
```

### Idempotent upsert (service_role) + heartbeat
```typescript
// scripts/ingest.ts (excerpt) — runs under service_role via createServiceClient()
const sb = createServiceClient();
const batch = { id: crypto.randomUUID(), started_at: new Date().toISOString(), source: "enable_banking" };
let status = "success", inserted = 0;
try {
  // ... fetch + normalize + dedupe → rows[] (each with import_batch_id = batch.id) ...
  const { data } = await sb.from("transactions")
    .upsert(rows, { onConflict: "dedupe_hash", ignoreDuplicates: true }) // ON CONFLICT DO NOTHING
    .select("id");
  inserted = data?.length ?? 0;
  // apply rules → update flow_type/cost_center/category_id/is_recurring/rule_id on the inserted rows
  // upsert balances snapshot (onConflict: account_id,as_of_date)
} catch (e) {
  status = e instanceof ConsentExpiredError ? "auth_expired" : "error";
  if (status === "auth_expired") {
    await sb.from("connections").update({ consent_status: "expired" }).eq("id", connId);
  }
} finally {
  // GUARANTEED heartbeat write — keeps Supabase warm even on empty/failed days (ING-04, Pitfall 6)
  await sb.from("import_batches").insert({ ...batch, finished_at: new Date().toISOString(), status, inserted });
  if (status === "success") {
    await sb.from("connections").update({ last_pull_at: new Date().toISOString() }).eq("id", connId);
  }
}
process.exit(status === "error" ? 1 : 0); // auth_expired exits 0 (banner is the alert), transient error fails CI
```

### Pure rules engine
```typescript
// src/lib/ingestion/rules/engine.ts (excerpt)
export function applyRules(tx: Normalized, accountsById: Map<string, Account>): Classification {
  const investmentAccounts = [...accountsById.values()].filter(a => a.is_investment);
  const cashIbans = new Set([...accountsById.values()].filter(a => !a.is_investment).map(a => a.iban));

  // 1. investimento — destination is ANY is_investment account (D-03/D-22). Outflow only.
  if (tx.amount < 0 && investmentAccounts.some(a => matchesAccount(tx, a))) {
    return { flowType: "investimento", costCenter: base(tx), categoryId: null, isRecurring: true, ruleId: R_INVEST };
  }
  // 2. transferência — counterparty is another of the couple's own cash accounts (D-04).
  if (tx.counterpartyIban && cashIbans.has(tx.counterpartyIban)) {
    return { flowType: "transferencia", costCenter: base(tx), categoryId: null, isRecurring: false, ruleId: R_XFER };
  }
  // 3. faturamento (revenue) — salary/employer inflow (D-18).
  if (tx.amount > 0 && matchesSalary(tx)) {
    return { flowType: "revenue", costCenter: base(tx), categoryId: null, isRecurring: true, ruleId: R_SALARY };
  }
  // 4. custo (cost) — default (D-18). cost_center = account default (CAT-07/D-19).
  return { flowType: "cost", costCenter: base(tx), categoryId: null, isRecurring: false, ruleId: R_DEFAULT };
}
// matchesAccount: IBAN match if exposed, else virtual-account IBAN/counterparty signature (D-22, spike-seeded)
// base(tx): accountsById.get(tx.accountId).default_cost_center  (CAT-07 — applied automatically)
```

## Schema Migration

Confirmed against the **live `src/lib/db/schema.ts`** (read this session). The Phase-0 schema already has: `transactions.dedupe_hash` (NOT NULL UNIQUE), `booking_date`, `value_date`, `amount_eur`, `flow_type`, `cost_center`, `category_id`, `rule_id`, `import_batch_id` (as `text`), `description`; `connections.expires_at`, `status`; `accounts.default_cost_center`, `currency`; `balances(account_id, as_of_date, balance_eur)`; `rules` (priority, version, set_*). The following are **missing and needed** (CONTEXT "Schema additions implied"):

| Target | Add | Type | Notes |
|--------|-----|------|-------|
| `accounts` | `is_investment` | `boolean NOT NULL DEFAULT false` | D-01/D-22. Virtual investing-account row sets this true. |
| `accounts` | `enable_banking_id` | `text` (nullable, unique) | The EB account `uid`. **Nullable** for virtual not-synced rows (D-22). |
| `accounts` | `iban` | `text` (nullable) | Needed to match counterparty IBANs in the rules engine (transferência/investimento). The spike confirms availability. |
| `accounts` | `is_synced` | `boolean NOT NULL DEFAULT true` | False for the virtual investing-account row (D-22). |
| `transactions` | `description_raw` | `text` | Raw remittance info before normalization (audit + Phase-2 rules). |
| `transactions` | `counterparty` | `text` | Creditor/debtor name (rules + display). Consider also `counterparty_iban text` for IBAN matching. |
| `transactions` | `is_recurring` | `boolean NOT NULL DEFAULT false` | Set by the rules engine. |
| `transactions` | `status` | `text` (nullable) | BOOK/PEND from EB; lets you exclude/track pending if policy changes. Optional but cheap. |
| `connections` | `consent_status` | `text` (nullable) | `active` / `expired` / `error` — drives the reconnect banner (ING-05/06). |
| `connections` | `last_pull_at` | `timestamptz` (nullable) | The freshness source for "data as of {date}" (ING-06) + the incremental `date_from`. |
| `connections` | `session_id` | `text` (nullable) | EB session id persisted by `eb:connect`, read by the cron. |
| **NEW table** `import_batches` | `id uuid pk`, `started_at timestamptz`, `finished_at timestamptz`, `status text`, `source text`, `fetched int`, `inserted int`, `skipped int`, `error text` | — | Audit + heartbeat (ING-04). `transactions.import_batch_id` references it. **Consider converting `transactions.import_batch_id` from `text` to `uuid` + FK** — or keep `text` and store the uuid as a string (lower-risk; no FK rewrite). |

**Migration flow (matches Phase-0 / `drizzle.config.ts`, session pooler 5432):**
1. Edit `src/lib/db/schema.ts` (add columns + the `importBatches` pgTable + `accounts.isInvestment` etc.).
2. `pnpm db:generate` → emits `drizzle/0003_ingestion.sql` (new columns + table).
3. **Custom SQL migration `drizzle/0004_ingestion_rls.sql`** (Drizzle doesn't manage RLS): `ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;` + the **same allowlist policy every other table uses** — `using ( public.is_email_allowed((select auth.jwt() ->> 'email')) )` (the Phase-0 hardened `app_allowlist` + `SECURITY DEFINER is_email_allowed()` pattern, per STATE.md — **do not** hardcode emails). New columns on existing tables inherit their table's existing RLS; only the new `import_batches` table needs a fresh policy.
4. `set -a; . ./.env.local; set +a; pnpm db:migrate`.
5. Update the RLS CI assertion so `import_batches` is covered (every `public` table has `rowsecurity=true`).

> ⚠️ **RLS posture (mandatory):** `import_batches` MUST ship with RLS enabled + the allowlist policy in the SAME migration (Phase-0 Pitfall 6 / D-11). The cron writes via `service_role` (bypasses RLS); the app reads the batch/freshness state under the user JWT — so the policy must allow allowlisted reads.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| PSD2 consent re-auth every 90 days | EU consent validity extended to **180 days** | 2023-07-25 (EBA RTS amendment) | Don't hardcode 90; read `access.valid_until`. The real token validity is region-dependent (confirm in the spike). |
| `jsonwebtoken` (CJS) | `jose` (ESM, audited, first-class `kid`) | ongoing | Lighter, clearer for the EB `kid` header. Locked choice. |
| Offset pagination | `continuation_key` cursor | EB API design | Loop until `continuation_key` is absent. |
| Hand-compiled TS scripts | `tsx` direct execution | ongoing | `npx tsx scripts/ingest.ts` in CI; no build step. |

**Deprecated/outdated:**
- Hardcoding a 90-day consent window — superseded by reading the real `valid_until` (180-day ceiling).
- Webhook/real-time bank ingestion — does not exist for PSD2 AISP; pull-only daily cron.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The Phase-0 `flow_type` enum values (`revenue`/`cost`/`investimento`/`transferencia`) should be kept and the Portuguese D-18 labels (faturamento/custo/transferência) treated as display labels (map: faturamento=revenue, custo=cost) | Pattern 6 / Rules Engine | If the user wants literal Portuguese enum values, the planner must alter the enum (a migration). LOW — same four concepts; recommendation avoids a needless enum rename. **Planner/discuss should confirm.** |
| A2 | The investing Revolut account is **NOT exposed** over PSD2 (likely), so investimento is detected on the outgoing leg via a virtual `is_investment=true` account matched by counterparty IBAN/description | Rules Engine / Pitfall 4 | If it IS exposed, the spike flips detection to the incoming leg + must also exclude the credit leg from revenue. The design handles both, but the spike must confirm. MEDIUM — this is the headline spike unknown. |
| A3 | Revolut's transaction `transaction_id` (else `entry_reference`) is present and stable enough to be the primary dedupe key | Pattern 2 / dedupe | If unstable/absent, the composite fallback (booking_date+amount+normalized desc) carries it — already designed. LOW given the fallback, but the spike must verify the `ON CONFLICT` match rate on a double-pull. |
| A4 | Revolut returns only BOOK transactions in the daily window (or that excluding PEND is acceptable) | Pattern 2 / Pitfall 5 | If PEND rows are important to show, the pending→booked update path needs handling (more complex). LOW for MVP (forward-only, trust-at-a-glance favors excluding pending). Spike confirms whether PEND appears. |
| A5 | The exact consent-validity value Revolut/EB issues is read from `access.valid_until` (PSD2 max 180d) and is ≥ the daily cadence | Pattern 4 / Pitfall 3 | If unusually short (e.g. days), reconnect cadence is painful but still correct (banner + re-run). LOW — design reads the real value. Spike confirms. |
| A6 | The `accounts` table needs an `iban` (and `transactions` a `counterparty_iban`) to do transferência/investimento IBAN matching; the EB payload provides creditor/debtor IBANs | Schema Migration / Rules Engine | If IBANs aren't returned for own-account transfers, fall back to counterparty-name/description matching (still supported by D-22's "description signature"). MEDIUM — confirm field availability in the spike. |
| A7 | The EB API base host is `https://api.enablebanking.com` (matches the JWT `aud`) | Code Examples | If a different base/region host applies, the client base URL changes (trivial). LOW — confirm at registration. |
| A8 | Rate limit is roughly ~4 calls/account/day (CONTEXT/STACK assumption); the API docs do not publish an exact figure | Validation / cron | If tighter, the once-daily cron (2 calls/account: transactions + balances) is well within any reasonable AIS limit. LOW. |

## Open Questions

1. **Which Revolut accounts/pockets does `POST /sessions` return — is the investing account among them? (ING-01, the spike)**
   - What we know: PSD2 mandates *payment* accounts; investment/savings pockets are commonly excluded. The session response returns an `accounts[]` with `uid`, `iban`, `cash_account_type`, `usage`.
   - What's unclear: the exact set for *this* couple's Revolut setup.
   - Recommendation: run `pnpm eb:connect` as the first task, log the full `accounts[]`, and branch the investimento detection (incoming vs outgoing leg) on the result. Insert the virtual `is_investment=true` row if the investing account is absent.

2. **The exact `strategy` enum values + the real `access.valid_until` Revolut issues.**
   - What we know: the docs reference a `strategy` (`TransactionsFetchStrategy`) param but don't enumerate values; PSD2 ceiling is 180 days; >90-days-old transactions are only reachable in the first ~5 min after auth (irrelevant — forward-only).
   - What's unclear: the precise `strategy` values and the issued validity.
   - Recommendation: the spike calls `GET /aspsps` (reads `maximum_consent_validity`) and inspects the `/sessions` `access.valid_until`; default `strategy` is fine for forward-only daily pulls (omit it or use the documented default).

3. **`transaction_id` vs `entry_reference` stability for Revolut.**
   - What we know: both fields exist; either can be absent for some entries.
   - Recommendation: prefer `transaction_id`, fall back to `entry_reference`, then to the composite hash; the spike's double-pull test (re-pull → high `ON CONFLICT` match rate) is the verification.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node 20 | `tsx` scripts + CI | ✓ (CI sets up node 20; locked D-02) | ≥20 | none — required |
| `jose` | JWT signing | ⚠ install (`pnpm add jose`) | 6.2.3 | `jsonwebtoken` (not preferred) |
| `tsx` | run TS scripts | ⚠ install (`pnpm add -D tsx`) | 4.22.4 | `tsc` + `node` |
| Enable Banking app (Restricted Production) + RSA key | the whole pull | ✗ must be registered (dashboard) | — | **none — blocking for ING-01/02**; register the app, generate the key, whitelist `redirect_url` |
| A valid SCA consent (`session_id`) | the cron | ✗ created by `pnpm eb:connect` (one-time, human SCA) | — | **none — blocking**; must run `eb:connect` once before the cron works |
| GitHub Actions secrets (4) | the cron | ⚠ must be set | — | none — required for the headless run |
| Supabase project (Phase 0) | writes | ✓ (exists from Phase 0) | — | — |

**Missing dependencies with no fallback (planner must make explicit tasks):**
- Enable Banking application registration (Restricted Production) + RSA key generation + `redirect_url` whitelisting (dashboard, one-time) — gates ING-01/02.
- A one-time `pnpm eb:connect` run performing real SCA at Revolut — gates the first successful cron pull.

**Missing dependencies with fallback:**
- `jose` / `tsx` — trivially installed; alternatives exist but are not preferred.

## Validation Architecture

> nyquist_validation is enabled — this section drives VALIDATION.md.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | **Vitest** `4.1.9` (already installed + `pnpm test` wired from Phase 0) |
| Config file | `vitest.config.ts` (exists from Phase 0) |
| Quick run command | `pnpm test` (`vitest run`) |
| Full suite command | `pnpm lint && pnpm build && pnpm test && pnpm test:rls` |

### Phase Requirements → Test Map
| Req | Behavior to prove | Test type | Cheapest reliable assertion | Live API? | File Exists? |
|-----|-------------------|-----------|-----------------------------|-----------|--------------|
| ING-03 | Double-pull adds zero rows | unit + SQL | Feed the same normalized batch twice through `dedupeHash` + the upsert path; assert 2nd run inserts 0 (deterministic hash). Live: re-run the cron over an overlapping window → `inserted=0`, high `ON CONFLICT` match. | unit primary; live confirm | ❌ `test/dedupe.test.ts` |
| ING-03 | Stable hash across `value_date` flips | unit | `dedupeHash` identical when only `value_date` changes; differs when `amount`/`booking_date`/id changes. | no | ❌ `test/dedupe.test.ts` |
| CAT-03 | €4k into an `is_investment` account → `investimento`, excluded from cost/revenue | unit + SQL | `applyRules(outflow→investing)` returns `flow_type=investimento`; SQL: `SUM WHERE flow_type IN ('cost','revenue')` excludes it; `SUM WHERE flow_type='investimento'` includes it once. | no | ❌ `test/rules.test.ts` |
| CAT-03 | Credit leg (if investing exposed) never counted as revenue | unit | the incoming leg on an `is_investment` account is NOT classified `revenue`. | no | ❌ `test/rules.test.ts` |
| D-04 | cash↔cash transfer → `transferencia` | unit | `applyRules` on a counterparty-IBAN ∈ cash accounts → `transferencia`, excluded from P&L. | no | ❌ `test/rules.test.ts` |
| D-18 | salary inflow → `revenue` (faturamento) | unit | `applyRules` on a salary-signature inflow → `revenue`. | no | ❌ `test/rules.test.ts` |
| D-18 | default → `cost` (custo) | unit | unmatched outflow → `cost`. | no | ❌ `test/rules.test.ts` |
| CAT-07 | default `cost_center` applied per account | unit | `applyRules` stamps `accounts.default_cost_center` (Lorenzo/Fernanda/Shared) automatically. | no | ❌ `test/rules.test.ts` |
| Pitfall 5 | sign from `credit_debit_indicator`; period from `booking_date` | unit | `normalize(DBDT)` → negative; `normalize(CRDT)` → positive; period uses `booking_date`. | no | ❌ `test/normalize.test.ts` |
| Pitfall 2 | PEND excluded | unit | `normalize`/filter drops `status=PEND`. | no | ❌ `test/normalize.test.ts` |
| ING-04 | heartbeat row written every run (incl. empty/failed) | integration | run ingest with zero new tx and with a forced auth error → an `import_batches` row exists both times (status `empty`/`auth_expired`). | service_role DB | ❌ `test/ingest.heartbeat.test.ts` |
| ING-05 | 403 → `consent_status='expired'`, no crash, exit 0 | integration | mock a 403 → `connections.consent_status='expired'`, process exits 0, `import_batches.status='auth_expired'`. | mock fetch | ❌ `test/ingest.consent.test.ts` |
| ING-05 | `expires_at` stored from real `valid_until` | integration | after `eb:connect` (mocked `/sessions`), `connections.expires_at` == the response `access.valid_until`. | mock fetch | ❌ `test/connect.test.ts` |
| ING-06 | "data as of" reads `last_pull_at` | unit/SQL | a successful run advances `connections.last_pull_at`; the banner query returns it. | DB | ❌ covered by heartbeat test |
| ING-02 | JWT well-formed (RS256, kid, aud, exp≤24h) | unit | `signEbJwt` → decode header has `alg=RS256`, `kid=appId`; payload `iss/aud` correct, `exp−iat ≤ 86400`. | no | ❌ `test/jwt.test.ts` |
| ING-04 RLS | `import_batches` has RLS enabled + allowlist policy | SQL (CI) | `test:rls` asserts `rowsecurity=true` for `import_batches`; non-allowlisted JWT → 0 rows. | DB | ⚠ extend `test/rls.assert.mjs` |

### Sampling Rate
- **Per task commit:** `pnpm lint` + `pnpm test` (pure unit tests — dedupe/normalize/rules/jwt are fast and need no network).
- **Per wave merge:** full suite incl. `pnpm build` + `pnpm test:rls` (RLS on `import_batches`) + the integration tests (mocked fetch + a Supabase test write).
- **Phase gate:** full suite green + a **manual live walkthrough**: run `pnpm eb:connect` once (real SCA), then run `pnpm ingest` twice over an overlapping window and confirm (a) transactions land classified, (b) the 2nd run inserts 0, (c) a balances snapshot + an `import_batches` row exist, (d) "data as of" advances. This live step is the only one needing the real API; everything else is unit/SQL/mock.

### Wave 0 Gaps
- [ ] `test/dedupe.test.ts` — double-pull idempotency + hash stability (ING-03).
- [ ] `test/normalize.test.ts` — sign convention, booking-vs-value-date, PEND exclusion (Pitfall 5/2).
- [ ] `test/rules.test.ts` — investimento / transferência / revenue / cost / default cost_center (CAT-02/03/07, D-04/18/19).
- [ ] `test/jwt.test.ts` — RS256/kid/aud/exp assertions (ING-02).
- [ ] `test/ingest.heartbeat.test.ts` + `test/ingest.consent.test.ts` — heartbeat-every-run + 403→expired (ING-04/05).
- [ ] `test/connect.test.ts` — `expires_at` from real `valid_until` (ING-05).
- [ ] Extend `test/rls.assert.mjs` to cover `import_batches` (ING-04 RLS).
- [ ] Mock fixtures: a realistic Revolut transactions page + a `/sessions` response (capture real shapes during the spike).

## Security Domain

> security_enforcement enabled (ASVS L1, block on high). Phase 1 introduces external secrets + untrusted external data + a privileged write path.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes (machine-to-machine) | RS256 JWT signed with `jose`; the EB private key is a GitHub Secret / `.env.local`, never committed, never in the browser. |
| V5 Input Validation | yes (critical) | `zod`-parse **every** Enable Banking payload at the boundary before normalizing/writing — the bank response is untrusted external input. |
| V6 Cryptography | yes (don't hand-roll) | `jose` for signing; `node:crypto` sha256 for the hash; never construct/verify JWTs by hand; the RSA key is PKCS8 imported, not logged. |
| V7 Error/Logging | yes | Log counts/hashes/status, **never** full transaction descriptions, amounts, IBANs, or the private key / `service_role` key (Pitfall: PII/secrets in CI logs). |
| V4 Access Control | yes | `import_batches` ships with RLS + allowlist policy (D-11); the cron writes via `service_role` (server-only, GitHub Actions only). |

### Known Threat Patterns for this stack
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| EB private key or `service_role` key leaked (git / CI logs / browser) | Information Disclosure / Elevation | Secrets only in GitHub Secrets + `.env.local` (gitignored); `service.ts` is `server-only`; ingestion lives outside the Next bundle; CI source-cleanliness grep. |
| Malformed/hostile bank payload corrupts rows or crashes the cron | Tampering / DoS | `zod` parse at the boundary; fail loudly on shape change; fail-soft on auth, hard-fail on parse. |
| Financial PII (amounts, descriptions, IBANs) in CI logs | Information Disclosure | Redact; log only counts/hashes/status (Pitfall, PITFALLS.md security table). |
| Replayed/forged dedupe → duplicate or dropped rows | Tampering | Deterministic versioned hash + DB `UNIQUE` constraint (idempotency invariant). |
| Open redirect via the EB `redirect_url` | Tampering | Whitelist the exact `redirect_url` in the EB Control Panel; the local listener binds `http://localhost:3000/eb/callback` only. |
| Silent consent expiry → stale data acted upon | (Availability/Integrity of the data) | Classify 403 as a loud `consent_status='expired'`; "data as of" banner; never silent retry. |

## Sources

### Primary (HIGH confidence)
- npm registry — `jose@6.2.3`, `tsx@4.22.4`, `zod@4.4.3`, `date-fns@4.4.0`, `@supabase/supabase-js@2.108.2` versions + publish dates verified 2026-06-22.
- `gsd-tools query package-legitimacy check` — `jose` OK, `tsx` SUS(too-new)→OK (false positive), 2026-06-22.
- Project canon: `00-RESEARCH.md`, `research/ARCHITECTURE.md`, `research/PITFALLS.md`, `research/STACK.md`, `REQUIREMENTS.md`, `01-CONTEXT.md`, live `src/lib/db/schema.ts`, `src/lib/supabase/service.ts`, `drizzle.config.ts`, `package.json` — all read this session.

### Secondary (MEDIUM confidence — official docs, fetched this session)
- Enable Banking API reference — `GET /aspsps`, `POST /auth`, `POST /sessions`, `GET /accounts/{id}/transactions|balances`, JWT (RS256/kid/iss/aud/exp), transaction fields (status BOOK/PEND, credit_debit_indicator CRDT/DBDT, booking_date/value_date, transaction_id/entry_reference, creditor/debtor, remittance_information), `continuation_key` pagination: https://enablebanking.com/docs/api/reference/ [CITED]
- Enable Banking Quick Start — the consent/SCA flow (POST /auth → redirect with `code` → POST /sessions → session_id + accounts), Restricted Production model: https://enablebanking.com/docs/api/quick-start/ [CITED]
- PSD2 consent validity extended 90→180 days (2023-07-25); Revolut returns no transactions older than 90 days if requested >5 min after auth; token validity is region-dependent: https://www.enablenow.nl/en/blog/psd2-consent-to-180-days , https://www.yapily.com/blog/90-day-reauthentication-changes [CITED]

### Tertiary (LOW confidence — confirm in the spike)
- Exact `strategy` (`TransactionsFetchStrategy`) enum values — referenced but not enumerated in the public docs.
- Exact Revolut rate limits (~4 calls/account/day is a project assumption; not published).
- Which specific Revolut accounts/pockets are PSD2-exposed for this couple — the ING-01 spike resolves this.

## Metadata

**Confidence breakdown:**
- Standard stack (jose/tsx/zod/date-fns): HIGH — all versions verified against npm; `jose`/`tsx` legitimacy checked.
- Live API shape (endpoints, JWT, transaction/balance fields, pagination): MEDIUM–HIGH — verified directly against enablebanking.com/docs this session; the only gaps (`strategy` enum, rate limit) are LOW and spike-resolved.
- Idempotency + dedupe design: HIGH — grounded in ARCHITECTURE.md + the verified transaction fields; the DB UNIQUE + ON CONFLICT is the proven invariant.
- Rules engine design: HIGH on structure (pure/versioned/ordered) — the one open item is the enum-label mapping (A1) + the exposed-account branch (A2), both flagged for discuss/spike.
- Schema migration: HIGH — diffed against the live `schema.ts`; the only judgment call is `import_batch_id` text-vs-uuid (low risk either way).
- Consent window + exposed accounts: MEDIUM — the two genuine spike unknowns; the design reads/branches rather than assumes.

**Research date:** 2026-06-22
**Valid until:** ~2026-07-22 (30 days). Re-verify package versions and the Enable Banking endpoint shapes before execution if more than a month passes; re-run the ING-01 spike regardless (it's the live source of truth for exposed accounts + consent validity).
