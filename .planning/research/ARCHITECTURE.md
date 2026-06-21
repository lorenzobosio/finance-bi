# Architecture Research

**Domain:** Personal-finance BI app with daily open-banking ingestion (Next.js App Router + Supabase Postgres/RLS + GitHub Actions cron)
**Researched:** 2026-06-21
**Confidence:** HIGH (stack is locked; patterns verified against Supabase + Enable Banking + PSD2 docs)

## Standard Architecture

A system like this is a **read-mostly analytical app over a single source of truth**, split into three planes that must never blur:

1. A **write plane** (the ingestion cron) that runs with elevated `service_role` privileges, *outside* the browser, and is the only thing allowed to insert bank data.
2. A **read plane** (the Next.js app) that runs entirely under the logged-in user's RLS context and never holds the service key.
3. A **derivation plane** (SQL views / materialized views + a calendar dimension) that turns raw transactions into comparable KPIs.

The governing principle for THIS app is **comparability**: every figure must be reproducible and aligned month-over-month. That pushes the architecture toward *immutable raw transactions + versioned rules + derived views*, rather than mutating rows in place.

### System Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                     WRITE PLANE (server-only, service_role)            │
├──────────────────────────────────────────────────────────────────────┤
│  GitHub Actions (daily cron, ~06:00 CET)                               │
│      │                                                                 │
│      ▼                                                                 │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐   ┌─────────┐ │
│  │ EB Connector │──▶│  Normalizer  │──▶│ Dedupe (hash)│──▶│  Rules  │ │
│  │ (JWT/session)│   │ (canonical   │   │  + import_   │   │ engine  │ │
│  │              │   │  shape, EUR) │   │  batch)      │   │(version)│ │
│  └──────────────┘   └──────────────┘   └──────────────┘   └────┬────┘ │
│                                                                 │      │
│                                              service_role write │      │
└─────────────────────────────────────────────────────────────────┼─────┘
                                                                    ▼
┌──────────────────────────────────────────────────────────────────────┐
│                        DATA PLANE (Supabase Postgres + RLS)            │
├──────────────────────────────────────────────────────────────────────┤
│  base:  accounts · connections · transactions · rules · categories    │
│         cost_centers · budgets · import_batches                        │
│  dim:   calendar (date dimension: y/m/q, period keys)                  │
│  derived (views / matviews): v_monthly_pnl · v_cost_center_actuals     │
│         v_goal_progress · v_category_spend · v_mom_yoy                  │
│  later: insights · holdings · fx_rates                                 │
│  RLS:   every table → auth.jwt()->>'email' IN (allowlist)             │
└──────────────────────────────────────────────────────────────────────┘
                                                                    ▲
                                            anon/user key (RLS-bound)│ reads
┌─────────────────────────────────────────────────────────────────────┐
│                    READ PLANE (Next.js App Router on Vercel)         │
├─────────────────────────────────────────────────────────────────────┤
│  Server Components / Route Handlers (per-request user session)       │
│   ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│   │  Home    │ │ €100k    │ │ Spending │ │ Cost     │ │ P&L /    │  │
│   │ dashboard│ │ Goal     │ │ views    │ │ Centers  │ │ Config   │  │
│   └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘  │
│   Tremor / Recharts (client islands) · @supabase/ssr cookie session  │
│   (Phase 4: Serwist PWA shell · Phase 5: AI insights reader)         │
└─────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| **EB Connector** | Authenticate to Enable Banking (JWT), maintain `session_id`, pull accounts/balances/transactions for the 3 Revolut accounts | TS module run in GitHub Actions; reads RSA key + app-id from secrets |
| **Normalizer** | Map raw bank payloads to a canonical transaction shape (date, amount sign, currency=EUR, normalized description, bank tx id) | Pure functions, no DB; deterministic so re-runs are stable |
| **Dedupe + Batch** | Compute `dedupe_hash`, group a run into an `import_batch`, upsert with conflict-on-hash so re-runs never duplicate | `INSERT ... ON CONFLICT (dedupe_hash) DO NOTHING` under service_role |
| **Rules engine** | Apply versioned `rules` to set `category`, `cost_center`, `flow_type`; record which rule version stamped each row | Ordered rule match; stores `rule_id`/`rule_version` on the transaction |
| **Calendar dimension** | Provide a stable date spine (year/month/quarter/period keys) so MoM/YoY are simple joins, not date math | Static seeded `calendar` table covering several years |
| **Derived views** | Express P&L, cost-center actuals, €100k progress, category/person spend, MoM/YoY as SQL the app just SELECTs | Postgres views (matviews if perf needed later) |
| **Next.js read app** | Render dashboards/config under the user's RLS session; mutate only metadata (rules, budgets, categories, re-categorize) | App Router Server Components + Route Handlers, `@supabase/ssr` |
| **RLS / Auth** | Gate everything behind Google login + 2-email allowlist; both users see all rows | Supabase Auth + per-table policy on `auth.jwt()->>'email'` |

## Recommended Project Structure

```
.
├── app/                          # Next.js App Router (read plane)
│   ├── (auth)/                   # login, callback, allowlist gate
│   ├── (dashboard)/
│   │   ├── page.tsx              # Home: €100k hero + month KPIs
│   │   ├── goal/                 # €100k Goal (gamified)
│   │   ├── spending/             # by category / account / person
│   │   ├── cost-centers/         # budgeted vs actual
│   │   ├── pnl/                  # revenue vs investment vs costs
│   │   ├── transactions/         # table, re-categorize, create rule
│   │   └── config/               # accounts, connections, categories, rules, budgets, allowlist
│   └── api/                      # Route Handlers (mutations: rules, budgets, recategorize)
├── lib/
│   ├── supabase/
│   │   ├── server.ts             # @supabase/ssr server client (user session)
│   │   ├── client.ts             # browser client (anon, RLS-bound)
│   │   └── service.ts            # service_role client — IMPORTED ONLY BY ingestion/route handlers, never RSC sent to client
│   ├── queries/                  # typed SELECTs against derived views
│   └── domain/                   # shared types: flow_type, category, cost_center
├── ingestion/                    # WRITE PLANE — runs in GitHub Actions, not in Vercel
│   ├── enable-banking/           # connector, JWT, session mgmt
│   ├── normalize.ts              # canonical shape (pure)
│   ├── dedupe.ts                 # dedupe_hash computation
│   ├── apply-rules.ts            # versioned rules engine
│   └── run.ts                    # orchestrates one daily batch
├── supabase/
│   ├── migrations/               # schema + RLS policies (source of truth)
│   └── seed/calendar.sql         # date dimension seed
└── .github/workflows/
    └── daily-ingest.yml          # cron; also the Supabase keep-alive
```

### Structure Rationale

- **`ingestion/` is physically separate from `app/`:** it is the only code that touches `service.ts` (service_role). Keeping it out of the Next.js bundle makes it structurally impossible to ship the service key to the browser.
- **`lib/supabase/service.ts` is the single chokepoint** for elevated access. One file to audit. Anything in `app/` that needs it must go through a Route Handler, never a Client Component.
- **`lib/queries/` only reads derived views**, never recomputes KPIs in TypeScript — comparability logic lives in SQL where it is versioned with migrations.
- **`supabase/migrations/` is the schema source of truth**, including RLS — so the allowlist and policies are reviewable and reproducible, not clicked into a dashboard.

## Architectural Patterns

### Pattern 1: Immutable raw transactions + idempotent upsert (dedupe_hash)

**What:** Every transaction row carries a deterministic `dedupe_hash = sha256(account_id | booking_date | amount | normalized_description | bank_tx_id)`. Ingestion upserts on that hash.
**When to use:** Always, for PSD2 pull-only feeds where the same window is re-fetched daily and history can shift.
**Trade-offs:** Re-runs are perfectly safe and cheap; cost is that the hash inputs must be frozen — changing the normalization rule changes the hash, so normalization must be treated as a stable contract.

**Example:**
```typescript
// dedupe.ts — deterministic, no DB access
export function dedupeHash(t: Normalized): string {
  return sha256([
    t.accountId,
    t.bookingDate,            // YYYY-MM-DD
    t.amount.toFixed(2),      // signed, EUR
    t.normalizedDescription,  // trimmed, lowercased, collapsed whitespace
    t.bankTxId ?? "",         // ASPSP id when present
  ].join("|"));
}

// run.ts (service_role) — re-run never duplicates
await supabaseService.from("transactions")
  .upsert(rows, { onConflict: "dedupe_hash", ignoreDuplicates: true });
```

### Pattern 2: Import batches for observable, reversible ingestion

**What:** Each cron run creates an `import_batches` row (started_at, source, status, counts). Every transaction references its `import_batch_id`.
**When to use:** Any unattended pipeline — you need to answer "did today's run work, and what did it add?".
**Trade-offs:** One extra table and FK; in exchange you get auditability, the ability to diagnose a bad run, and a natural place to record connection/SCA failures.

### Pattern 3: Versioned rules engine, applied at write time, re-runnable

**What:** `rules` are versioned (a rule has an id + version + ordering). When ingestion (or a manual re-categorize) runs, it stamps the matched `rule_id`/version and writes `category`, `cost_center`, `flow_type` onto the transaction.
**When to use:** When taxonomy must stay comparable across months but still be editable.
**Trade-offs:** Editing a rule does *not* silently rewrite history — you re-apply explicitly. This protects MoM/YoY comparability at the cost of an explicit "re-run rules" action.

```typescript
// flow_type is the correctness keystone:
// €4k internal transfer to the ETF pocket → flow_type = "investimento" (NOT a cost)
// salary inflow → "revenue"; everything else → "cost"
// Only "investimento" rows feed €100k progress; transfers never count as spend.
```

### Pattern 4: Calendar dimension drives MoM/YoY

**What:** A seeded `calendar` table (one row per date with year, month, quarter, `period_key = YYYYMM`) is joined to transactions so period comparisons are joins/group-bys, not ad-hoc date arithmetic.
**When to use:** Any BI layer needing aligned period-over-period math.
**Trade-offs:** Trivial storage cost; huge simplification — `v_mom_yoy` becomes a self-join on `period_key` and `period_key - 100` (prior year) / previous month.

### Pattern 5: RLS allowlist where "both users see everything"

**What:** Every table gets one policy: `auth.jwt()->>'email' IN ('lorenzo@...','fernanda@...')`. No per-user row filtering. `cost_center` is an analytical label, not an access wall.
**When to use:** Tiny trusted multi-user apps where the security boundary is "is this one of us", not "whose row is this".
**Trade-offs:** Simplest possible model; if a third user or true isolation is ever needed, policies must be rewritten. Acceptable here — explicitly out of scope.

## Data Flow

### Ingestion Flow (daily, write plane)

```
GitHub Actions cron (06:00 CET)
    ↓  JWT auth + existing session_id (from connections)
Enable Banking: GET /accounts/{id}/transactions  (×3 Revolut accounts)
    ↓
Normalizer → canonical rows (EUR, signed amount, normalized description)
    ↓
dedupe_hash computed per row → group into one import_batch
    ↓
service_role UPSERT into transactions  (ON CONFLICT dedupe_hash DO NOTHING)
    ↓
Rules engine stamps category / cost_center / flow_type (+ rule version)
    ↓
(no recompute needed) derived views read fresh data on next page load
```

### Read Flow (user request)

```
User opens /goal
    ↓
Server Component → @supabase/ssr client (user session from cookie)
    ↓  RLS checks email ∈ allowlist
SELECT * FROM v_goal_progress   (sum of flow_type='investimento')
    ↓
Server renders → Tremor/Recharts client island hydrates
```

### Key Data Flows

1. **Enable Banking → transactions:** pull-only, once/day; consent (`connections.expires_at`) expires ~every 90 days (SCA) → Config page surfaces a reconnect action; ingestion records the failure in the import batch when expired.
2. **transactions → derived KPIs:** raw rows + calendar dimension → SQL views compute P&L (revenue − investimento − costs, margin %), cost-center budgeted-vs-actual, category/person spend, and €100k progress (sum of `investimento`). The app never recomputes these in TS.
3. **€4k contribution → €100k progress:** the recurring internal transfer is matched to `flow_type='investimento'`; €100k = cumulative sum of contributions (cost basis) in MVP; Phase 6 swaps cost-basis for live ETF market value via `holdings` + `fx_rates`.

## Security Boundary (the line that must never move)

| Capability | Who holds it | Where it runs |
|------------|--------------|---------------|
| `service_role` key (bypasses RLS) | ingestion only | GitHub Actions secrets + server-only Route Handlers; never `NEXT_PUBLIC_`, never a Client Component |
| anon/user key (RLS-bound) | the Next.js app | Server Components, browser island reads |
| Auth (Google) + 2-email allowlist | Supabase Auth + RLS policy | enforced at the DB on every table |

**Rule of thumb:** if a code path can be reached by a browser, it must use the user session and be subject to RLS. The service key exists in exactly one importable module and one CI environment.

## Supabase Free-Tier Keep-Alive (free by construction)

Supabase pauses a free project after **7 days of database inactivity** (tracked on queries/writes, not dashboard visits; ~30s cold wake). The daily ingestion job writes `transactions`/`import_batches` every day, which **inherently resets the inactivity timer** — so the cron *is* the keep-alive. No separate ping workflow is needed. If ingestion ever pauses (e.g. SCA lapse with zero new rows), have `run.ts` still write the `import_batches` heartbeat row so a no-transaction day still counts as DB activity.

## Suggested Build Order (aligned to the 7-phase plan)

| Phase | Builds | Hard dependency | Sharp boundary established |
|-------|--------|-----------------|----------------------------|
| **0 Foundation** | Next.js+TS+Tailwind+Tremor scaffold; Supabase project; Google auth + allowlist; RLS-on-everything; base schema + calendar seed; `service.ts` chokepoint | — | Auth/RLS + service_role isolation locked before any data exists |
| **1 Ingestion** | EB connector, normalizer, dedupe_hash, import_batches, daily GitHub Actions cron, connections/SCA tracking | Phase 0 schema + service_role | Write plane fully separate from app; idempotency proven |
| **2 Core BI** | calendar-driven views: category/account/person spend, cost_centers + budgets (budgeted vs actual), P&L, MoM comparability; transactions page + versioned rules engine | Phase 1 data + rules | Derivation lives in SQL views, not TS |
| **3 €100k Goal** | `flow_type='investimento'` detection of €4k transfer; goal progress view, milestones, ETA, streak; Home hero | Phase 2 views + flow_type | Goal = sum of contributions (cost basis) |
| **4 PWA** | Serwist shell, installable, mobile-first for Fernanda | Phase 3 pages exist to wrap | Offline-tolerant read shell only |
| **5 AI** | manual-first daily digest + weekly report writing to `insights`; Haiku, tiny prompts | stable data + views | AI is a *writer* into one table; reads happen in app |
| **6 ETF Valuation** | `holdings`, `fx_rates`, prices API; swap cost-basis goal for live market value, P/L, allocation | Phase 3 goal abstraction | Multicurrency isolated behind valuation layer |
| **7 Reminders** | 90-day reconnect + budget alerts | connections + budgets + AI | Notifications last; depend on everything |

**Why this order holds:** Phases 0→1→2→3 are a strict dependency chain (you cannot derive KPIs without data, cannot ingest without schema+auth). Phases 4–7 are additive wrappers/extensions over a stable core and can slip without breaking the MVP. The two riskiest, research-worthy seams are **Phase 1** (real Enable Banking session/SCA behavior, which exact Revolut accounts are exposed) and **Phase 6** (ETF pricing outside PSD2 + FX).

## Anti-Patterns

### Anti-Pattern 1: Computing KPIs in TypeScript

**What people do:** Pull raw transactions into the Next.js app and sum/aggregate P&L, budgets, and goal progress in JS.
**Why it's wrong:** Comparability logic then lives in two places, drifts between pages, and is unversioned — MoM/YoY becomes unreproducible.
**Do this instead:** Express every KPI as a Postgres view joined to the calendar dimension; the app only SELECTs.

### Anti-Pattern 2: Letting the service_role key near the browser

**What people do:** Use the service client in a Server Component "because it's server code," or expose it via a poorly-scoped Route Handler.
**Why it's wrong:** Server Components can leak values into client props; one mistake exposes a full-database admin key.
**Do this instead:** Confine `service_role` to `ingestion/` and explicit, auth-checked Route Handlers. App reads use the RLS-bound user client only.

### Anti-Pattern 3: Mutating transactions in place on rule edits

**What people do:** Edit a rule and overwrite categories on historical rows silently.
**Why it's wrong:** Past months change retroactively; comparability breaks and the user can't trust last month's number.
**Do this instead:** Keep raw transactions immutable; re-apply rules as an explicit, versioned action and stamp the rule version used.

### Anti-Pattern 4: Treating internal transfers / the €4k as spend

**What people do:** Count the €4k ETF transfer or inter-account moves as costs.
**Why it's wrong:** P&L margin and €100k progress both go wrong — the single number that must always be correct.
**Do this instead:** Classify via `flow_type` (`revenue` / `investimento` / `cost`); only `investimento` feeds the goal; transfers never count as cost.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Enable Banking (AISP) | JWT (RS256, app-id as `kid`) → `POST /sessions` (from auth code) → `GET /accounts/{id}/transactions`; pull-only | Consent is per-ASPSP; Revolut/PSD2 ~90-day SCA → reconnect; verify which Revolut pockets are exposed (investment pocket may not be); 429 possible |
| Supabase | Postgres + Auth (Google) + RLS; two client types (user vs service_role) | service_role bypasses RLS — server-only |
| GitHub Actions | Scheduled cron runs `ingestion/run.ts`; secrets hold EB key + service_role | Doubles as Supabase keep-alive |
| Vercel Hobby | Hosts the Next.js read app | App must never need service_role at request time except in audited Route Handlers |
| Claude (Phase 5) | Manual-first writer into `insights`; Haiku, tiny prompts | Metered credits — keep automated calls minimal |
| Prices/FX API (Phase 6) | Pull ETF price + EUR FX into `holdings`/`fx_rates` | Outside PSD2; separate from ingestion |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| ingestion ↔ Postgres | direct, service_role upsert | only writer of bank data; idempotent |
| Next.js app ↔ Postgres | RLS-bound user client, reads derived views | metadata mutations (rules/budgets) via Route Handlers |
| rules engine ↔ transactions | write-time stamping + explicit re-apply | versioned; never silent rewrite |
| calendar ↔ derived views | join on period_key | enables MoM/YoY without date math |

## Sources

- Enable Banking API reference — auth (JWT/RS256), `/sessions`, `/accounts/{id}/transactions`, consent validity, pull-only (MEDIUM)
- Supabase Docs — Row Level Security, service_role bypass, `@supabase/ssr` server/client split (HIGH)
- Supabase free-tier pause behavior — 7-day DB-inactivity pause, keep-alive via scheduled DB activity (HIGH)
- PSD2 / AISP open-banking specs — consent + SCA + transaction access model (HIGH)
- Project context: `.planning/PROJECT.md` (locked stack, 7-phase plan, comparability/idempotency/flow_type rules)

---
*Architecture research for: personal-finance BI with daily open-banking ingestion*
*Researched: 2026-06-21*
