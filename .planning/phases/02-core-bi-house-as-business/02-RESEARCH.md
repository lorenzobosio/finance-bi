# Phase 2: Core BI + house-as-business - Research

**Researched:** 2026-06-23
**Domain:** SQL analytics marts (calendar-joined P&L / budgets / breakdowns) + DB-backed versioned rules engine + Next 15 Server-Action write plane + Recharts-3 dashboards
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Categorization & the rules engine (becomes user-editable)**
- **D2-01 — Auto-rules + calibrate:** categories, cost-center overrides, and the Sublocação tag are assigned by best-effort signature rules on ingest, then calibrated against real June data (the playbook that fixed the `investimento` signature). It is acceptable that some rows land in "Uncategorized" until signatures are tuned; breakdowns must degrade gracefully (an "Uncategorized" slice), never crash.
- **D2-02 — Manual override persists FORWARD:** recategorizing a transaction writes/updates a persistent rule in the `rules` table so future months inherit it — never re-tag the same merchant twice. The engine must consult DB `rules` rows, not only the hardcoded `builtins.ts` seed. Heart of CAT-04.
- **D2-03 — Raw history is never silently rewritten (CAT-05):** a manual edit changes that one row immediately and optionally creates a forward rule. Applying a rule to existing past rows is an explicit user action (a "re-apply to matching transactions" button), never an automatic side effect of saving a rule.
- **D2-04 — Resolve the `rule_id` audit gap (was "Fix 2"):** today the engine emits string labels from `builtins.ts` while `transactions.rule_id` is a uuid FK → `rules.id`, so `rule_id` stays NULL. Phase 2 seeds the built-in rules as real `rules` rows (or otherwise persists the mapping) so `rule_id` resolves to a real, versioned row and every classification is auditable. Fold into the rules-engine plan.
- **D2-05 — Sublet uses the same auto+calibrate+override pattern:** the placeholder `SUBLET_SIGNALS` won't match real tenant-rent/utility memos. Seed real signatures against live data; manual tag persists forward (D2-02). Keep the engine's sublet-routing contract (D-25).

**Sublocação as a profit center**
- **D2-06 — Standalone P&L:** Sublocação has its own P&L = tagged revenue − tagged costs. NOT mixed into the 3 household cost-center budgets.
- **D2-07 — Net-only roll-up, no double-count:** the household P&L excludes the sublet's gross legs from main revenue/cost SUMs and adds a single `sublet_net` line. Implement as a dedicated bucket (the `sublocacao` cost-center / a flag) filtered out of the main aggregations and re-injected once, netted.
- **D2-08 — Its own view:** Sublocação gets a dedicated section/view (Cost-Centers area) showing its standalone P&L; the household P&L surfaces only the net line.

**Revenue / result / margin model**
- **D2-09 — Revenue = net salary:** what actually lands in the accounts, matched by the salary signature. Bonuses are one-off → `is_recurring = false`.
- **D2-10 — Emergency fund = Patrimônio:** no separate bucket/goal in Phase 2 — part of net worth / cash position. The one-off June ~€3272 "Instant Access Savings" transfer stays classified `cost` (do not re-flag).
- **D2-11 — Result & margin:** household result = revenue − investimento − costs; margin = result / revenue (%). Sublet enters once as `sublet_net` (D2-07). `investimento` (the €4k legs) and `transferência` are excluded from both revenue and costs — already enforced by the engine; the marts must preserve that.

**Budgets**
- **D2-12 — Ship at €0, edited in-app:** budgets start empty, fully editable in Config (BI-06). No € amounts in the repo (public-CV / no-PII). Bars render once filled; an empty budget shows "not set", not a fake cap.
- **D2-13 — Suggest budgets from history:** after ~1 month of data, offer a helper to set a budget from historical actuals (last month's actual or a trailing average).
- **D2-14 — Category-level budgets wanted:** the user wants budgets for spending categories, but `budgets` is keyed on `cost_center` ONLY. Phase 2 likely extends `budgets` with a nullable `category_id` so budgeted-vs-actual works at both the cost-center grain AND the category grain.

**New BI requested**
- **D2-15 — Category-as-%-of-revenue:** a first-class Phase-2 analysis showing each spending category as a share of (salary) revenue. Fits BI-03. Not deferred.

### Claude's Discretion
The user said "we are open for other inputs from you." Claude decides (and may propose, not force):
- Chart selection per view (Tremor Raw vs bespoke Recharts), Home KPI card layout/order, which marts are plain SQL views vs materialized.
- How %-of-revenue is visualized (stacked bar vs table with sparkbars).
- **Proposed additions (in scope, low cost):** a savings-rate KPI (`(investimento + sublet_net) / revenue`) and months-of-reserve (cash position ÷ avg monthly costs) — the latter is already named in BI-07/success-criteria, so build it; the savings-rate is a natural complement to the 4 headline KPIs.

### Deferred Ideas (OUT OF SCOPE)
- **Allocation cascade** (invest €4k → Brazil/Adventures → shared living → individual allowance) → **Phase 3**.
- **€100k goal, milestones, gamification, the savings "waterfall" visualization** → **Phase 3**.
- **PWA / mobile install for Fernanda** → Phase 4.
- **AI daily digest / weekly report → `insights`** → Phase 5.
- **ETF market value + FX/multicurrency** → Phase 6.
- **Budget-overspend alerts (REM-02)** → Phase 7 (the budget data model lands here, the notification does not).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CAT-04 | View tx table; re-categorize a tx, create a rule from it, assign its cost center | Pattern 5 (DB-backed rules read order), Pattern 6 (Server-Action write plane), Pattern 7 (forward rule on edit). Schema `rules` + RLS already support writes. |
| CAT-05 | Re-applying rules is explicit; raw history never silently rewritten | Pattern 7 (idempotent "re-apply to past" Server Action returning affected-row count; edit-one-row default). |
| CAT-06 | Internal movements classified `transferência`, excluded from cost/revenue | Already enforced by `engine.ts` (rule 2). Marts MUST keep the `WHERE flow_type NOT IN ('investimento','transferencia')` exclusion (Pattern 2). |
| BI-01 | P&L: revenue vs investment vs costs, result + margin (% of revenue) | Pattern 1 (calendar-joined P&L mart), Pattern 3 (sublet net roll-up without double-count), Pattern 8 (Recharts-3 waterfall). Locked margin formula. |
| BI-02 | Cost Centers show individual budgets — budgeted vs actual | Pattern 1 + Pattern 4 (budget-vs-actual mart at cost-center AND category grain, D2-14 nullable `category_id`). |
| BI-03 | Spending breakdown by category / account / person + %-of-revenue (D2-15) | Pattern 2 (breakdown marts), Pattern 9 (Uncategorized graceful-degrade), %-of-revenue mart. |
| BI-04 | All views MoM-comparable (empty=€0; current=provisional; YoY="insufficient history" <12mo) | Pattern 1 (calendar spine LEFT JOIN), comparability states. dim_calendar seeded 2024–2035. |
| BI-05 | Home (mobile-first) — 4 headline KPIs answerable in <1 min | UI-SPEC §1; KPI marts read shared `?period=YYYYMM`. |
| BI-06 | Config manages categories, rules, budgets | Pattern 6 (Server-Action writes under allowlist RLS); RLS write policies already exist. |
| BI-07 | Daily balance snapshots → cash position / net-worth / months-of-reserve | Pattern 10 (extend `scripts/ingest.ts` balance capture — already wired; calibrate), balance-trend mart. |
</phase_requirements>

## Summary

Phase 2 is overwhelmingly an **internal-patterns** phase: the entire stack is locked and Phase 0/1 already installed every dependency. **No new npm packages are required** — the only "addition" is copy-paste source (shadcn `chart.tsx` + Tremor Raw blocks) and SQL migrations. So research value is concentrated in four engineering patterns, not library selection: (1) **calendar-joined zero-filled SQL marts** that stay MoM-comparable; (2) **netting the Sublocação profit center into the household P&L exactly once** without double-counting its gross legs; (3) the **DB-backed rules engine** that resolves the `rule_id` audit gap while keeping `test/rules.test.ts` green and writing forward-only rules; and (4) the **Next 15 Server-Action write plane** under the existing 2-email allowlist RLS.

The codebase is in excellent shape for this: the `rules`, `budgets`, `balances`, `categories`, `cost_centers`, `transactions`, and `dim_calendar` tables all already exist (Phase 0), RLS `for all to authenticated` write policies on `rules`/`budgets`/`transactions` are already in place (so Server Actions can write under the user JWT — no `service_role` in the app), and `scripts/ingest.ts` **already captures per-account balances** (`upsertBalance`) — BI-07 is mostly calibration, not new code. The engine is pure, ordered, first-match-wins and frozen by a green test contract.

**Three landmines dominate the risk surface and must be addressed in Wave 0 / early:** (1) a **cost-center code mismatch** — the engine + tests emit `"shared"` but migration 0003 renamed the seeded code to **`compartilhado`**, so live tx will FK-fail or mis-bucket unless reconciled; (2) the **`rule_id` is hardcoded NULL** in `ingest.ts`'s INSERT (line 196 passes `${null}`) even though the engine returns a `ruleId` — D2-04 must fix both the seed AND the writer; (3) the **`builtins.ts` RuleId is a string union, not a uuid**, so making `rule_id` resolve requires a deterministic builtin→uuid mapping. The marts must religiously exclude `investimento` + `transferencia` from cost/revenue SUMs and filter the `sublocacao` cost-center out of the main aggregation, re-injecting it as one netted line.

**Primary recommendation:** Build marts as **Drizzle-defined Postgres views** (`pgView` with raw `sql`) layered on the dense `dim_calendar` spine; resolve the rules engine to DB-backed with a stable builtin→uuid seed in a new migration; route all UI writes through **Next 15 Server Actions using the existing `@supabase/ssr` server client (anon + user JWT + allowlist RLS)** — never `service_role`, never the Drizzle/`postgres` write client in the request path.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| P&L / budget / breakdown / balance aggregation | Database / Storage (SQL views) | — | Comparability + correctness must live in one queryable place; views keep the math out of TS and DRY across pages. |
| Calendar-joined MoM/YoY comparability | Database / Storage (`dim_calendar` LEFT JOIN) | — | The dense calendar is the only thing that makes empty months render €0 and YoY computable. |
| Rules engine classification (on ingest) | API / Backend (server-plane `engine.ts`, cron) | Database (DB `rules` rows it now reads) | Pure deterministic classifier; runs in the cron WRITE plane, must stay server-only (FND-03). |
| Reading marts for dashboards | Frontend Server (RSC + `@supabase/ssr`) | Database (RLS) | Server Components read under the user JWT so RLS enforces the allowlist; no data reaches the client unfiltered. |
| User writes (recategorize, create-rule, edit budget, re-apply) | Frontend Server (Next Server Actions) | Database (RLS INSERT/UPDATE) | Server Actions run server-side, write via the anon+JWT SSR client under the allowlist policy; keeps `service_role` off the client. |
| Daily balance capture | API / Backend (`scripts/ingest.ts` cron, WRITE plane) | Database (`balances`) | Already wired via `postgres` driver / `DATABASE_URL`; bypasses RLS by design (cron is service-equivalent). |
| Charts (waterfall, bars, area, KPI cards) | Browser / Client (Recharts 3 client components) | Frontend Server (data passed as props from RSC) | Recharts needs the DOM; data is fetched server-side and handed down, so the client never queries the DB. |
| Optimistic UI on edits | Browser / Client (`useOptimistic`) | Frontend Server (Server Action reconciles) | UX responsiveness; the Server Action is the source of truth and `revalidatePath` reconciles. |

## Standard Stack

> The stack is **LOCKED** (CLAUDE.md + Phase 0/1). This phase adds **no external npm packages**. The table documents the *already-installed* tools this phase uses and the copy-paste (non-npm) chart source.

### Core
| Library | Version (verified) | Purpose | Why Standard |
|---------|--------------------|---------|--------------|
| `next` | `15.5.19` (pinned; registry latest 16.2.9) | App Router pages + Server Actions write plane | Locked. Server Actions are the server boundary that keeps `service_role` off the client. [VERIFIED: npm registry / package.json] |
| `react` / `react-dom` | `19.2.7` | UI runtime + `useOptimistic` for edit UX | Locked; default for Next 15. [VERIFIED: package.json] |
| `drizzle-orm` | `0.45.2` (registry latest 0.45.2) | Schema source of truth; `pgView` for marts; `sql` for aggregations | Already the schema authority (`src/lib/db/schema.ts`); supports `pgView` (existing or new) for typed marts. [VERIFIED: npm registry] |
| `drizzle-kit` | `0.31.10` (registry latest 0.31.10) | Generate the `category_id`-on-budgets migration + any view DDL | Already the migration tool (`db:generate`/`db:migrate`). [VERIFIED: npm registry] |
| `postgres` | `3.4.9` | WRITE-plane driver (cron + re-apply Server Action if it bulk-updates) | Existing Node-side DB pattern (`scripts/ingest.ts`). Bypasses RLS — server-only. [VERIFIED: package.json] |
| `@supabase/ssr` | `0.12.0` | READ plane (RSC marts) + Server-Action writes under user JWT + RLS | Locked; the ONLY app-side DB client. `server.ts` already exposes `createClient()`. [VERIFIED: package.json] |
| `recharts` | `3.8.1` (EXACT pin; registry latest 3.8.1) | Waterfall (bespoke stacked Bar), area trend, bars | Locked; shadcn charts + Tremor Raw both target Recharts 3. [VERIFIED: npm registry] |
| `date-fns` | `4.4.0` | Period math (`period_key`, MoM/YoY windows, label formatting) | Already installed; UI-SPEC mandates `format(d,'d MMM yyyy')` + `MMM yyyy`. [VERIFIED: package.json] |
| `zod` | `4.4.3` | Validate Server-Action inputs (budget €, rule criteria, recategorize payload) | Already installed; bank/user inputs validated before DB write. [VERIFIED: package.json] |

### Supporting (copy-paste source, NOT npm)
| Source | Purpose | When to Use |
|--------|---------|-------------|
| shadcn official `chart` (`ChartContainer`/`ChartConfig`/`ChartTooltip`/`ChartLegend`) | Recharts-3 base layer for the P&L waterfall + balance area trend | Add via `npx shadcn@latest add chart` (shadcn 4.11.0 dev dep already present) — creates `src/components/ui/chart.tsx` (NOT present today). [CITED: ui.shadcn.com/docs/components/chart] |
| Tremor Raw blocks (BarList, CategoryBar, ProgressBar, ProgressCircle, SparkChart, Tracker) | Breakdown bars, budget-vs-actual, €4k/€100k progress, margin sparkline | Copy source into `src/components/charts/*` on Tailwind v4 + Recharts 3. No npm dep. [CITED: tremor.so] |
| shadcn `radix-nova` primitives (card, table, select, popover, dialog, input, label, badge, skeleton, tabs, progress, separator, sidebar, tooltip) | Page shell + Transações editor + Config forms | `npx shadcn@latest add <component>` per UI-SPEC §Registry Safety. [CITED: 02-UI-SPEC.md] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Drizzle `pgView` marts | Query-time TS aggregation in RSC | TS aggregation re-implements the math per page and risks drift; a DB view is one source of truth, MoM-comparable and testable in SQL. Use TS only for tiny derived KPIs the view already supplies. |
| Plain SQL views | Materialized views | Materialized adds a refresh trigger (cron/`REFRESH`) for a 2-person dataset that is tiny — not worth it in MVP. Revisit only if a page is slow. [ASSUMED] |
| Server Action writes via SSR (anon+JWT+RLS) | Route Handler + `service_role` | `service_role` bypasses RLS and must never be near the request path; the allowlist RLS already lets the 2 emails write — Server Actions are simpler and safer. |
| `useOptimistic` | Full page refetch on every edit | Optimistic update is the UI-SPEC-locked UX; refetch is a fallback if reconciliation gets complex. |

**Installation:** No `npm install`. Chart/primitive scaffolding only:
```bash
npx shadcn@latest add chart card table select popover dialog input label badge skeleton tabs progress separator sidebar tooltip
# Tremor Raw blocks: copy source manually into src/components/charts/ (no registry)
```

**Version verification (run results, 2026-06-23):**
```
npm view recharts version    -> 3.8.1   (matches EXACT pin)
npm view drizzle-orm version -> 0.45.2  (matches installed)
npm view drizzle-kit version -> 0.31.10 (matches installed)
npm view next version        -> 16.2.9  (project intentionally pins 15.5.19 — DO NOT bump)
```

## Package Legitimacy Audit

> This phase installs **no external packages**. All runtime deps were vetted in Phase 0/1 and are already in `package.json`. shadcn/Tremor Raw blocks are first-party / copy-paste source (no registry install of third-party code).

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| (none — no new installs) | — | — | — | — | — | — |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

The only scaffolding command is `npx shadcn@latest add …`, which writes first-party shadcn component source into the repo (official registry, `radix-nova`) — `components.json` has `"registries": {}`, so no third-party registry gate applies (per UI-SPEC §Registry Safety).

## Architecture Patterns

### System Architecture Diagram

```
                         ┌─────────────────────────────────────────────┐
   Daily cron (WRITE)    │  scripts/ingest.ts  (postgres driver, DATABASE_URL, bypasses RLS) │
   GitHub Actions  ─────▶│   EB pull → normalize → applyRules(tx) ──────┐                    │
                         │                       (engine reads DB rules)│                    │
                         │   per-account balance snapshot ──────────────┼──▶ balances        │
                         └───────────────────────────────────────────────┼────────────────┘
                                                                          │
                                  writes flow_type/cost_center/           ▼
                                  category_id/rule_id(uuid)        ┌──────────────┐
                                                                   │ transactions │
                                                                   │ rules/budgets│
                                                                   │ categories   │
                                                                   │ cost_centers │
                                                                   │ balances     │
                                                                   │ dim_calendar │ (dense spine)
                                                                   └──────┬───────┘
                                                                          │ LEFT JOIN on period_key
                                                  ┌───────────────────────▼─────────────────────────┐
                                                  │  SQL MARTS (Drizzle pgView)                      │
                                                  │  v_pnl_monthly · v_sublet_pnl · v_costcenter_bva │
                                                  │  v_category_breakdown · v_pct_of_revenue ·       │
                                                  │  v_balance_trend · v_home_kpis                    │
                                                  └───────────────────────┬─────────────────────────┘
                          READ plane (anon + user JWT + RLS allowlist)    │
                       ┌───────────────────────────────────────────────────┘
                       ▼
   Browser ◀── props ── RSC pages (@supabase/ssr server client)  ── read ?period=YYYYMM (shared)
   (Recharts 3,                 │  Home · Gastos · Cost Centers+Sublocação · Transações · Config
    useOptimistic)              │
        │ user edit             ▼
        └────────────▶  Next 15 Server Action (server-only)
                         · validate w/ zod
                         · write rules/budgets/transactions via @supabase/ssr (user JWT, RLS)
                         · revalidatePath/Tag
                         · "re-apply to past": idempotent bulk UPDATE, returns affected count
```

### Recommended Project Structure
```
src/
├── app/(protected)/
│   ├── layout.tsx              # shell: sidebar/bottom-nav + FreshnessBanner + month selector (?period)
│   ├── page.tsx                # Home (replace stub) — 4 KPI cards (slice 2.2)
│   ├── gastos/page.tsx         # Spending breakdown + %-of-revenue (2.2)
│   ├── cost-centers/page.tsx   # budgeted-vs-actual + Sublocação P&L (2.3)
│   ├── transacoes/page.tsx     # table + inline edit (2.4)
│   └── config/page.tsx         # categories/rules/budgets editor (2.3)
├── lib/
│   ├── db/
│   │   ├── schema.ts           # extend: budgets.categoryId (nullable); add pgView mart defs
│   │   └── marts.ts            # (new) typed pgView definitions / query helpers
│   ├── ingestion/rules/
│   │   ├── engine.ts           # extend: accept DB rules + builtin fallback (keep test green)
│   │   ├── builtins.ts         # extend: stable builtin→uuid map; calibrate sublet signals
│   │   └── db-rules.ts         # (new) load+order DB rules rows for the engine
│   ├── format.ts               # (new) central formatEUR/formatPct (de-DE) — UI-SPEC locked
│   ├── period.ts               # (new) period_key helpers, provisional/YoY-history checks
│   └── actions/                # (new) Server Actions: recategorize, create-rule, reapply, budget
├── components/
│   ├── charts/*                # Tremor Raw copied source + shadcn chart wrappers
│   └── ui/chart.tsx            # shadcn chart (add via CLI — not present yet)
test/
├── rules.test.ts               # FROZEN — extend, do not break
├── rules-db.test.ts            # (new) DB-rules ordering + builtin fallback + rule_id resolution
├── marts.test.ts               # (new) P&L formula, sublet net, exclusions, zero-fill
└── period.test.ts              # (new) provisional/MoM/YoY-history pure helpers
```

### Pattern 1: Calendar-spine zero-filled monthly mart (BI-01/02/03/04)
**What:** Drive every aggregation from the dense `dim_calendar` so empty months become `€0` rows, not missing rows. Group facts by `period_key` (YYYYMM int) and LEFT JOIN onto a distinct-period spine.
**When to use:** Every MoM-comparable mart (P&L, budgets, breakdowns, balance trend).
```sql
-- Source: PostgreSQL calendar-dimension LEFT-JOIN pattern (websearch, MEDIUM)
-- + project dim_calendar (period_key YYYYMM) [VERIFIED: schema.ts]
with periods as (
  select distinct period_key from dim_calendar          -- dense spine 2024..2035
),
fact as (
  select
    c.period_key,
    sum(t.amount_eur) filter (where t.flow_type = 'revenue'
                                and t.cost_center <> 'sublocacao')                as revenue,
    sum(-t.amount_eur) filter (where t.flow_type = 'cost'
                                and t.cost_center <> 'sublocacao')                as costs,
    sum(-t.amount_eur) filter (where t.flow_type = 'investimento')               as investimento
  from transactions t
  join dim_calendar c on c.date = t.booking_date
  group by c.period_key
)
select
  p.period_key,
  coalesce(f.revenue, 0)       as revenue,
  coalesce(f.costs, 0)         as costs,
  coalesce(f.investimento, 0)  as investimento
from periods p
left join fact f using (period_key)
order by p.period_key;
```
- **MoM:** compare adjacent `period_key`s (or `lag()` over the ordered spine). **YoY:** `period_key - 100`; show "insufficient history" until ~12 populated months exist.
- **Provisional:** the row whose `period_key` equals the current month is flagged in TS (the data is correct; the flag is a UI state).

### Pattern 2: Exclusion discipline — investimento & transferencia never in cost/revenue (CAT-06, D2-11)
**What:** Every cost/revenue SUM MUST filter `flow_type NOT IN ('investimento','transferencia')`. This is the correctness keystone the engine already enforces at write time; the marts must not undo it.
```sql
-- costs bucket: only true costs
sum(-amount_eur) filter (where flow_type = 'cost'   and cost_center <> 'sublocacao')
-- revenue bucket: only true revenue (salary/employer inflow), sublet excluded
sum(amount_eur)  filter (where flow_type = 'revenue' and cost_center <> 'sublocacao')
-- investimento is its OWN line (subtracted in result, but labeled "excluded from costs")
```
**Anti-pattern:** `SUM(amount_eur) GROUP BY flow_type` without the sublocacao filter — double-counts the sublet legs into the household totals.

### Pattern 3: Sublocação net roll-up, exactly once (D2-06/07/08, BI-01)
**What:** Compute the sublet's gross legs in an **isolated** mart, expose only the **net** to the household P&L, and **subtract those legs from the main SUMs** (done in Pattern 1/2 via `cost_center <> 'sublocacao'`). The household result re-injects one signed `sublet_net` line.
```sql
-- v_sublet_pnl: the standalone profit-center P&L (the ONLY place gross legs appear)
select
  c.period_key,
  coalesce(sum(t.amount_eur)  filter (where t.flow_type = 'revenue'), 0) as sublet_revenue,
  coalesce(sum(-t.amount_eur) filter (where t.flow_type = 'cost'), 0)    as sublet_costs,
  coalesce(sum(t.amount_eur), 0)                                         as sublet_net  -- signed
from dim_calendar c
left join transactions t
  on t.booking_date = c.date and t.cost_center = 'sublocacao'
group by c.period_key;

-- household result (locked formula): revenue − investimento − costs + sublet_net
-- margin = result / nullif(revenue, 0)   ("% of net revenue")
```
**Why netting in SQL, not TS:** keeps the no-double-count invariant in one place; a `marts.test.ts` asserts `household.revenue` excludes sublet gross and `result` includes `sublet_net` exactly once.
**Landmine:** `sublet_net` is signed — a loss-making month is negative; the waterfall step must render the sign and color the *final* Result bar only.

### Pattern 4: Budget-vs-actual at two grains (BI-02, D2-14)
**What:** Add a **nullable `category_id`** to `budgets` so a budget row is either cost-center-grain (`category_id IS NULL`) or category-grain. The mart joins actuals by the same grain.
```sql
-- Drizzle migration: ALTER TABLE budgets ADD COLUMN category_id uuid NULL REFERENCES categories(id)
-- mart: budget (track) vs actual (fill) per (cost_center [, category_id], period_key)
select
  b.cost_center, b.category_id, b.period_key,
  b.amount_eur as budget,
  coalesce(sum(-t.amount_eur) filter (where t.flow_type = 'cost'), 0) as actual
from budgets b
left join transactions t
  on t.cost_center = b.cost_center
 and (b.category_id is null or t.category_id = b.category_id)
 and to_char(t.booking_date,'YYYYMM')::int = b.period_key
group by b.cost_center, b.category_id, b.period_key, b.amount_eur;
```
- **"Not set" ≠ €0 cap:** absence of a budget row → UI shows "Budget not set" (never a fake cap, D2-12). Don't synthesize €0 budget rows.
- **Sublocação budget:** none — it's a profit center, not a household cost center (D2-06).

### Pattern 5: DB-backed rules engine + builtin fallback (CAT-04, D2-02/04)
**What:** The engine keeps its pure ordered contract but now **consults DB `rules` rows first**, falling back to the hardcoded builtins. Keep `applyRules(tx, accountsById)` pure by passing DB rules in as an argument (do NOT make the engine query the DB — it must stay server-plane pure for the test).
```ts
// db-rules.ts (cron + re-apply load this; engine stays pure)
export interface DbRule {
  id: string; priority: number; version: number;
  matchCriteria: string;            // signature/merchant token
  setCategory: string | null;       // uuid
  setCostCenter: string | null;     // cost_centers.code
  setFlowType: 'revenue'|'cost'|'investimento'|'transferencia'|null;
}
// engine.ts (extended signature, default keeps test green):
export function applyRules(tx, accountsById, dbRules: DbRule[] = []): Classification {
  // 1. evaluate dbRules in (priority, version) order, first-match-wins on matchCriteria
  // 2. fall through to the existing hardcoded ordered builtins (investimento > transferencia > ...)
}
```
**`rule_id` resolution (D2-04 — the audit fix):** seed the 6 builtin `RuleId` strings as real `rules` rows with **deterministic uuids** (a fixed map, like the categories seed uses `1111…`/`2222…` literals), then have the writer stamp the **uuid** (not NULL). Two concrete bugs to fix:
- `builtins.ts` `RuleId` is a string union → add `export const BUILTIN_RULE_IDS: Record<RuleId, string>` (uuid map) seeded in a new migration.
- `scripts/ingest.ts` line ~196 inserts `${null}` for `rule_id` — change to `${BUILTIN_RULE_IDS[cls.ruleId] ?? dbRuleId}`.

### Pattern 6: Next 15 Server-Action write plane under allowlist RLS (BI-06, CAT-04)
**What:** UI mutations are `'use server'` functions that write through the **`@supabase/ssr` server client** (anon key + user JWT), so the **existing `for all to authenticated` allowlist RLS** authorizes the write. No `service_role`, no Drizzle/`postgres` client in the request path.
```ts
// Source: Next.js Server Actions (App Router) + @supabase/ssr server client [CITED: nextjs.org/docs/app/.../server-actions; project server.ts VERIFIED]
'use server';
import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const RecatInput = z.object({ txId: z.string().uuid(), categoryId: z.string().uuid().nullable(),
                              costCenter: z.string(), createRule: z.boolean(), merchant: z.string() });

export async function recategorize(raw: unknown) {
  const i = RecatInput.parse(raw);
  const sb = await createClient();                       // user JWT → RLS allowlist
  await sb.from('transactions').update({ category_id: i.categoryId, cost_center: i.costCenter })
          .eq('id', i.txId);                             // (D2-03) one row only
  if (i.createRule) {                                    // (D2-02) forward-only rule
    await sb.from('rules').insert({ match_criteria: i.merchant, set_category: i.categoryId,
                                    set_cost_center: i.costCenter, priority: 100, version: 1 });
  }
  revalidatePath('/transacoes');
}
```
- **RLS is already there:** `0001_rls_policies.sql` has `allowlist_all for all to authenticated` on `transactions`, `rules`, `budgets` (verified). No new policy needed for the write plane.
- **Client side:** `useOptimistic` for instant feedback; the Server Action result + `revalidatePath` reconciles (UI-SPEC §5).

### Pattern 7: Edit-one-row default + explicit idempotent "re-apply to past" (CAT-05, D2-03)
**What:** Saving an edit changes **only that row** (and optionally creates a forward rule). Applying a rule to **existing** rows is a **separate** Server Action that bulk-updates matching rows and **returns the affected-row count**; re-running it changes nothing further (idempotent).
```ts
'use server';
export async function reapplyRuleToPast(ruleId: string): Promise<{ affected: number }> {
  // bulk UPDATE transactions SET category_id/cost_center WHERE matches(rule) AND not-already-set
  // return the COUNT; idempotent — a second run affects 0 rows.
  // If this bulk update is large, it MAY use the postgres WRITE client (server-only) instead of
  // per-row supabase calls; still server-only, still gated by the UI being allowlist-authenticated.
}
```
**Anti-pattern:** auto-applying a new/edited rule to history on save — explicitly forbidden by CAT-05/D2-03.

### Pattern 8: Recharts-3 P&L waterfall (bespoke stacked Bar + transparent offset) (BI-01)
**What:** Recharts has no native waterfall. Build it as a stacked `BarChart` with two series: a **transparent "base" series** (the running offset) stacked under a **visible "delta" series** (the step magnitude). Each step: Revenue → +Sublet net → −Investimento → −Costs → =Result.
```tsx
// Source: Recharts 3 stacked-bar waterfall idiom [ASSUMED — verify on paste; Recharts-3 docs]
// data row: { name, base, delta, isTotal }
<ChartContainer config={cfg} className="min-h-[320px]">{/* height REQUIRED (Recharts-3) */}
  <BarChart data={steps}>
    <CartesianGrid horizontal vertical={false} stroke="var(--border)" />
    <XAxis dataKey="name" /><YAxis />
    <Bar dataKey="base"  stackId="w" fill="transparent" />
    <Bar dataKey="delta" stackId="w">
      {steps.map((s,i) => (
        <Cell key={i} fill={s.isTotal ? (s.delta>=0 ? 'var(--gain)' : 'var(--loss)') : 'var(--chart-1)'} />
      ))}
    </Bar>
  </BarChart>
</ChartContainer>
```
**Recharts-3 paste rules (UI-SPEC locked):** use `var(--chart-1)` NOT `hsl(var(--chart-1))`; `ChartContainer` MUST carry a height/`min-h-*`; only the Result bar is colored gain/loss, intermediate steps stay neutral `--chart-1`; provide an `aria-label`/data-table alternative (a11y).

### Pattern 9: Uncategorized graceful-degrade (D2-01, BI-03)
**What:** Breakdowns must render an explicit **"Uncategorized"** bucket (`category_id IS NULL`) as a labeled grey slice — never crash or silently drop. Use a `coalesce(category_name, 'Uncategorized')` in the breakdown mart.
**Warning sign:** a breakdown that sums to less than total costs → uncategorized rows were dropped.

### Pattern 10: Daily balance capture is already wired (BI-07)
**What:** `scripts/ingest.ts` **already** snapshots per-account balances (`upsertBalance`, keyed `(account_id, as_of_date)`, idempotent). BI-07 is calibration + the **net-worth / months-of-reserve marts**, not new ingest code.
```sql
-- v_balance_trend: latest balance per account per day → net worth; months-of-reserve
-- months_of_reserve = latest liquid cash position / trailing-3-month avg monthly costs (UI-SPEC)
```
**Landmine:** `balances` has **no UNIQUE(account_id, as_of_date)** constraint — the script upserts by hand (check-then-write). A mart that assumes one row per account/day is safe today, but a concurrent run could duplicate; consider adding the unique index in this phase's migration for safety. [VERIFIED: schema.ts has only `balances_account_id_idx`]

### Anti-Patterns to Avoid
- **Aggregating in TS instead of SQL:** drifts from the one mart definition; do the math in `pgView`.
- **Using `service_role` (or the Drizzle/`postgres` client) in a Server Action / RSC:** bypasses RLS; the app must use `@supabase/ssr` (anon+JWT). The only `service_role`-equivalent is the cron.
- **Forgetting the `sublocacao` exclusion** in household SUMs → double-counts sublet.
- **Synthesizing €0 budget rows** to fill "not set" → shows a fake cap (D2-12 forbids).
- **Auto-applying rules to history on save** → violates CAT-05/D2-03.
- **OFFSET pagination on Transações** → drifts/duplicates as data grows; use keyset (Pattern: composite `(booking_date, id)` seek).
- **Bumping Next to 16** → project pins 15.5.19; do not.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Money/percent formatting | Ad-hoc `Intl.NumberFormat` calls scattered in components | Central `formatEUR`/`formatPct` in `src/lib/format.ts` (de-DE, UI-SPEC locked) | Single source = consistent `€5.038,00` / `12,4 %`; ad-hoc calls drift. |
| Date/period math | Manual string slicing for YYYYMM, MoM windows | `date-fns` + a `period.ts` helper | Off-by-one month bugs; `period_key-100` YoY math centralized. |
| MoM/YoY zero-fill | App-side loops inserting missing months | `dim_calendar` LEFT JOIN (Pattern 1) | The dense calendar already exists; SQL does it correctly. |
| Pagination | OFFSET/limit page math | Keyset seek on `(booking_date, id)` | OFFSET is slow + unstable; keyset is the UI-SPEC-locked "server-side keyset" choice. |
| Auth on writes | Custom permission checks in Server Actions | Existing allowlist RLS (`is_email_allowed`) | The DB already enforces the 2-email wall; re-checking in TS is redundant and error-prone. |
| Rules ordering/first-match | A new classifier | Extend the existing pure `engine.ts` | It's frozen by `test/rules.test.ts` and battle-tested on live June data. |
| Chart components (waterfall offset, bars, progress) | From-scratch SVG | shadcn chart + Tremor Raw copy-paste | UI-SPEC mandates these; reinventing loses a11y + theming. |

**Key insight:** Almost everything this phase needs already exists in the schema, the engine, the RLS policies, and the cron. The work is **assembling marts on top of correct primitives** and **wiring a write plane that respects the already-correct security model** — not building new infrastructure.

## Runtime State Inventory

> This is **not** a rename/refactor phase (greenfield BI layer on existing tables). However, two pre-existing data/code mismatches behave like migration state and MUST be reconciled, so they are surfaced here explicitly.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | **Cost-center code drift:** seed 0003 stores `compartilhado`/`sublocacao`/`lorenzo`/`fernanda` as `cost_centers.code`, but `engine.ts` + `test/rules.test.ts` emit **`"shared"`** and `SUBLET_COST_CENTER="sublocacao"`. Any tx the engine classifies `shared` will **FK-fail or mis-join** against the seeded `compartilhado`. | **Reconcile** — either (a) add a `shared` alias row / rename seed to `shared`, or (b) map `shared→compartilhado` in the engine/writer. Decide in Wave 0; a `marts.test.ts` must assert the household cost-center codes match what the engine emits. **DATA + CODE edit.** |
| Stored data | **`transactions.rule_id` is NULL for all ingested rows** — `ingest.ts` inserts `${null}` (line ~196) despite the engine returning `ruleId`. | D2-04: seed builtin uuids + change the writer to stamp them. A backfill UPDATE may set `rule_id` for existing rows (idempotent). **CODE edit + optional data backfill.** |
| Live service config | None — no external service stores Phase-2 state (the cron's EB session is Phase-1 state, untouched here). | None. |
| OS-registered state | None — the GitHub Actions cron schedule is unchanged (balance capture already runs in it). | None. |
| Secrets/env vars | None new. Server Actions use the existing `NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY`; the cron keeps `DATABASE_URL`. No `service_role` introduced into the app. | None. |
| Build artifacts | `src/lib/database.types.ts` (generated Supabase types) will be **stale** after the `budgets.category_id` migration + any new views. | Regenerate types after migration (`supabase gen types …` or Drizzle inferred types). **Build step.** |

**The canonical question:** after the marts + write plane land, the only old state still in play is the two mismatches above (cost-center code, NULL `rule_id`) — both must be fixed as code+data tasks, not assumed away.

## Common Pitfalls

### Pitfall 1: Cost-center code mismatch (`shared` vs `compartilhado`)
**What goes wrong:** The engine/tests emit `"shared"`; the DB seeds `"compartilhado"`. Household budget rows and the P&L cost-center grain silently miss `shared` tx (or FK-violate on insert).
**Why it happens:** Migration 0003 localized the code to Portuguese after the engine was written against `shared`.
**How to avoid:** Reconcile in Wave 0 (alias row or engine mapping); add a test asserting `applyRules` output codes ⊆ `cost_centers.code`.
**Warning signs:** a "Shared" budget bar that never fills; tx with `cost_center='shared'` failing the FK.

### Pitfall 2: Double-counting the Sublocação legs
**What goes wrong:** Household revenue/costs include the sublet's gross rent-received + utilities-paid, inflating both sides and the margin.
**Why it happens:** A naive `GROUP BY flow_type` without the `cost_center <> 'sublocacao'` filter.
**How to avoid:** Pattern 2/3 — exclude `sublocacao` from main SUMs, re-inject as one `sublet_net`. Assert in `marts.test.ts`.
**Warning signs:** household revenue ≠ salary-only total; the waterfall's Revenue step is too high.

### Pitfall 3: `service_role` or Drizzle client leaking into the request path
**What goes wrong:** A Server Action that imports the `postgres`/Drizzle client (or `service.ts`) bypasses RLS — total data-exposure risk and `import "server-only"` throws in odd places.
**Why it happens:** Convenience — the cron uses Drizzle/`postgres`, so it's tempting to reuse.
**How to avoid:** Server Actions use `@supabase/ssr` `createClient()` ONLY (Pattern 6). Reserve `postgres`/Drizzle for the cron and, if truly needed, a large idempotent re-apply bulk update (still server-only, still behind allowlist-authenticated UI).
**Warning signs:** `service_role` or `DATABASE_URL` referenced anywhere under `src/app` or `src/lib/actions`.

### Pitfall 4: Provisional/empty-month states treated as afterthoughts
**What goes wrong:** Current partial month reads as a "drop"; empty months vanish from charts; YoY shows garbage before 12 months.
**Why it happens:** Aggregating only over populated rows; no calendar spine.
**How to avoid:** Pattern 1 zero-fill + the UI-SPEC §7 first-class states (provisional pill, €0 grey, "insufficient history").
**Warning signs:** a month missing from the trend; a misleading −100% MoM on the current month.

### Pitfall 5: `rule_id` stays NULL → audit gap persists
**What goes wrong:** D2-04's whole point (auditable classification) fails because the writer still inserts NULL.
**Why it happens:** Seeding builtin uuids but forgetting to change the `ingest.ts` INSERT (and the re-apply path).
**How to avoid:** Fix BOTH the seed AND `ingest.ts` line ~196; add a test asserting a classified row's `rule_id` resolves to a real `rules.id`.
**Warning signs:** `SELECT count(*) FROM transactions WHERE rule_id IS NULL` > 0 after a fresh ingest.

### Pitfall 6: Breaking the frozen rules-engine contract
**What goes wrong:** Adding DB-rule consultation changes `applyRules` semantics and `test/rules.test.ts` goes red.
**Why it happens:** Making the engine impure (querying the DB) or changing default behavior.
**How to avoid:** Add DB rules as an **optional argument** (`dbRules = []`), keep the builtin fallback ordering identical; the existing test (no dbRules) must pass unchanged.
**Warning signs:** any diff to the 11 existing assertions in `test/rules.test.ts`.

## Code Examples

### Adding the nullable `budgets.category_id` (Drizzle)
```ts
// Source: Drizzle pg-core [CITED: orm.drizzle.team] — extend schema.ts then db:generate
export const budgets = pgTable('budgets', {
  id: uuid('id').primaryKey().defaultRandom(),
  costCenter: text('cost_center').notNull().references(() => costCenters.code),
  categoryId: uuid('category_id').references(() => categories.id), // NEW — nullable = cost-center grain
  periodKey: integer('period_key').notNull(),
  amountEur: numeric('amount_eur', { precision: 14, scale: 2 }).notNull(),
});
// then: set -a; . ./.env.local; set +a; pnpm db:generate && pnpm db:migrate
```

### Defining a mart as a typed Drizzle view
```ts
// Source: Drizzle pgView [CITED: orm.drizzle.team/docs/views] — typed, queryable from RSC
import { pgView } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
export const vPnlMonthly = pgView('v_pnl_monthly').as((qb) =>
  qb.select({/* period_key, revenue, costs, investimento, sublet_net, result, margin */})
    .from(/* … */) // or: pgView('v_pnl_monthly').existing() if DDL is hand-written SQL like 0001/0002
);
// Pattern matches the project convention: complex SQL (RLS, seeds) is hand-written .sql; Drizzle
// can either generate the view or reference an existing() one. Prefer hand-written .sql for the
// FILTER-heavy marts (clearer), exposed to TS via .existing() typed views.
```

### Keyset pagination for Transações
```sql
-- Source: Postgres keyset/seek pagination (websearch, MEDIUM)
select * from transactions
where (booking_date, id) < ($1::date, $2::uuid)   -- row-value seek past last row
order by booking_date desc, id desc
limit 50;
-- needs index (booking_date, id); the id tiebreaker is mandatory (many tx share a date)
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `@tremor/react` npm (frozen 3.18.7) | Tremor Raw copy-paste + shadcn official charts | locked pre-Phase-2 | Stays on Tailwind v4 + React 19 + Recharts 3. |
| Recharts 2.x (planning-time note) | Recharts **3.8.1** (EXACT pin) | corrected 2026-06-23 (UI-SPEC) | `var(--chart-1)` not `hsl(...)`; `ChartContainer` needs height. |
| Route Handler + `service_role` for writes | Next 15 **Server Actions** + `@supabase/ssr` + allowlist RLS | this phase | No `service_role` in app; simpler write path. |
| OFFSET pagination | Keyset/seek on `(booking_date, id)` | this phase | Stable, fast Transações table. |

**Deprecated/outdated:**
- `@supabase/auth-helpers-nextjs` — deprecated; use `@supabase/ssr` (already done).
- App-side month-gap filling — replaced by the `dim_calendar` spine.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Plain SQL views (not materialized) are fast enough for a 2-person dataset | Stack/Alternatives | If a page is slow, switch to materialized + a refresh step; low risk at this data volume. |
| A2 | The Recharts-3 transparent-offset stacked-bar idiom renders the waterfall correctly | Pattern 8 | Verify on paste; if axis/stack behaves oddly, fall back to a custom `<Customized>` layer or a labeled table. |
| A3 | `shared` vs `compartilhado` should be reconciled by aliasing/mapping (not a full code rename) | Pitfall 1 / Runtime State | If the team prefers renaming the seed to `shared`, the migration differs — a Wave-0 decision. |
| A4 | A large "re-apply to past" MAY use the `postgres` WRITE client server-side | Pattern 7 | If per-row `@supabase/ssr` updates are fast enough, keep everything on the RLS path (cleaner). Confirm volume. |
| A5 | Builtin rules get **deterministic uuids** seeded in a new migration to resolve `rule_id` | Pattern 5 / D2-04 | If the team prefers a `builtin_key` text column on `rules` instead of fixed uuids, the FK story changes — design choice for the data-layer plan. |
| A6 | The proposed category taxonomy in CONTEXT (Accommodation/Food/…) must be reconciled with the EXISTING seed (Housing/Groceries/Utilities/Transport/Dining/Entertainment/Shopping/Travel/ETF/Savings) | (taxonomy) | The seed already differs from CONTEXT's wish-list; Config makes categories editable, so reconcile in the data-layer plan rather than hardcoding either list. |

## Open Questions (RESOLVED)

> All four were operationalized in the Phase-2 plans (verified by gsd-plan-checker, 2026-06-23): **Q1**→02-02/T1 (assert engine codes ⊆ `cost_centers.code`) · **Q2**→02-02/T1+T2 (fixed-uuid builtin seed + fix the `ingest.ts` writer) · **Q3**→02-03/T1 (keep the existing seed; Config editing closes the gap) · **Q4**→02-03/T1 (hand-written `.sql` + `pgView().existing()`).

1. **`shared` vs `compartilhado` cost-center code** — *What we know:* engine/tests emit `shared`; DB seeds `compartilhado`. *What's unclear:* alias vs rename vs engine-map. *Recommendation:* resolve in Wave 0 with a test that the engine's emitted codes are a subset of `cost_centers.code`.
2. **`rule_id` resolution mechanism** — *Known:* must become a real uuid FK. *Unclear:* fixed-uuid seed vs a `builtin_key` column. *Recommendation:* fixed-uuid seed (mirrors the existing `1111…`/`2222…` category-seed convention) + fix the `ingest.ts` writer + backfill.
3. **Category taxonomy reconciliation** — *Known:* CONTEXT proposes Accommodation/Food/…; the seed has Housing/Groceries/… *Unclear:* which wins. *Recommendation:* keep the seed, let Config editing close the gap (D2-12 spirit); don't commit a hardcoded relabel.
4. **Marts as Drizzle-generated views vs hand-written `.sql` + `.existing()`** — *Recommendation:* hand-write the FILTER-heavy mart DDL as numbered migrations (matches 0001/0002 convention) and expose them to TS via `pgView(...).existing()` typed views; keep the simple ones in Drizzle if cleaner.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Build, tsx scripts, vitest | ✓ | local Node 20+ (Next 15 / `@types/node` ^20) | — |
| PostgreSQL (Supabase) | All marts + writes | ✓ (remote Supabase; `DATABASE_URL`) | Postgres 15+ | — |
| pnpm | scripts (`pnpm db:migrate`, `pnpm test`) | ✓ (memory: project uses pnpm) | — | npm/yarn |
| shadcn CLI | scaffold `chart.tsx` + UI primitives | ✓ (`shadcn ^4.11.0` dev dep) | 4.11.0 | manual copy of component source |
| drizzle-kit | migration generate/apply | ✓ | 0.31.10 | hand-written `.sql` migration |
| Recharts | charts | ✓ | 3.8.1 (installed) | — |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** `shadcn` CLI → if unavailable, copy `chart.tsx` source manually (it's first-party, copy-paste safe).

> Note: `npm view next version` returns 16.2.9, but the project **intentionally pins `15.5.19`** — this is a deliberate constraint, not a missing/stale dependency. Do not "upgrade."

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest `4.1.9` (node environment) [VERIFIED: package.json + vitest.config.ts] |
| Config file | `vitest.config.ts` (alias `@`→`./src`; includes `test/**/*.test.ts(x)`) |
| Quick run command | `pnpm test` (`vitest run`) — fast; pure unit suites |
| Full suite command | `pnpm test && pnpm test:rls` (rls.assert.mjs is the RLS guard) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CAT-04 | DB rules consulted in priority order; builtin fallback unchanged | unit | `pnpm test -- rules-db` | ❌ Wave 0 (`test/rules-db.test.ts`) |
| CAT-04 | existing engine contract still green (no regression) | unit | `pnpm test -- rules` | ✅ `test/rules.test.ts` |
| D2-04 | a classified row's `rule_id` resolves to a real builtin uuid | unit | `pnpm test -- rules-db` | ❌ Wave 0 |
| CAT-05 | "re-apply to past" is idempotent + returns affected count | unit | `pnpm test -- reapply` | ❌ Wave 0 (`test/reapply.test.ts`, pure-logic core) |
| CAT-06 | investimento/transferencia excluded from cost+revenue SUMs | unit (mart SQL via pg-mem or fixture) | `pnpm test -- marts` | ❌ Wave 0 (`test/marts.test.ts`) |
| BI-01 | result = revenue − investimento − costs + sublet_net; margin = result/revenue | unit | `pnpm test -- marts` | ❌ Wave 0 |
| BI-01/D2-07 | household SUMs exclude sublet gross; sublet_net counted exactly once | unit | `pnpm test -- marts` | ❌ Wave 0 |
| BI-02/D2-14 | budget-vs-actual at cost-center AND category grain | unit | `pnpm test -- marts` | ❌ Wave 0 |
| BI-04 | empty month → €0 row; provisional flag on current period; YoY history gate | unit | `pnpm test -- period` | ❌ Wave 0 (`test/period.test.ts`) |
| BI-07 | months-of-reserve = cash ÷ trailing-3mo avg costs | unit | `pnpm test -- marts` | ❌ Wave 0 |
| BI-05/06 | KPI/format helpers (formatEUR/formatPct de-DE) | unit | `pnpm test -- format` | ❌ Wave 0 (`test/format.test.ts`) |
| CAT-04/BI-06 | Server-Action input validation (zod) rejects bad payloads | unit | `pnpm test -- actions` | ❌ Wave 0 (`test/actions.test.ts`, pure validators) |

> SQL marts are hard to unit-test without a DB. Recommended approach: extract the **formula/filter logic** into pure TS that the views mirror, OR run mart SQL against `pg-mem`/a fixture DB in `marts.test.ts`. Page rendering + RLS-write end-to-end behavior is **manual-only** (UAT) — flag in VALIDATION.md.

### Sampling Rate
- **Per task commit:** `pnpm test` (quick — `test/rules.test.ts` must stay green every commit).
- **Per wave merge:** `pnpm test && pnpm test:rls` (full suite + RLS guard).
- **Phase gate:** full suite green before `/gsd-verify-work`; manual UAT for page rendering + live recategorize→forward-rule→re-apply flow.

### Wave 0 Gaps
- [ ] `test/rules-db.test.ts` — DB-rule ordering, builtin fallback, `rule_id` resolution (CAT-04/D2-04)
- [ ] `test/marts.test.ts` — P&L formula, sublet net, exclusions, budget grains, months-of-reserve (BI-01/02/06/07, CAT-06)
- [ ] `test/period.test.ts` — zero-fill / provisional / MoM / YoY-history pure helpers (BI-04)
- [ ] `test/format.test.ts` — `formatEUR`/`formatPct` de-DE (BI-05)
- [ ] `test/reapply.test.ts` + `test/actions.test.ts` — idempotent re-apply core + zod validators (CAT-05)
- [ ] Decide mart test harness (pure-TS mirror vs `pg-mem`/fixture DB) — Wave-0 architecture call
- [ ] Re-arm note: `vitest.config.ts` currently relies on `configDefaults.exclude` only; the quarantined Phase-1 suites (memory: 6 vitest suites) — confirm which re-arm as Phase-2 modules land.

## Security Domain

> `security_enforcement: true`, ASVS level 1, block-on high.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes (existing) | Google OAuth via `@supabase/ssr`; allowlist of 2 emails. No change this phase. |
| V3 Session Management | yes (existing) | Cookie session refreshed in middleware (`@supabase/ssr`). No change. |
| V4 Access Control | **yes (central)** | RLS `is_email_allowed()` `for all to authenticated` on every table; Server Actions write under the user JWT so RLS authorizes — **no `service_role` in the app**. Re-apply/bulk writes stay server-only. |
| V5 Input Validation | **yes** | `zod` on every Server-Action input (budget €, rule criteria, recategorize payload, period); reject malformed before DB write. |
| V6 Cryptography | no (new) | No new crypto; EB JWT signing is Phase-1. Don't hand-roll any. |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| SQL injection via mart/query params | Tampering | Parameterized queries (`@supabase/ssr` filters, `postgres` tagged templates, Drizzle `sql` placeholders) — never string-concat user input into SQL. |
| `service_role` / `DATABASE_URL` leaking into client bundle | Information Disclosure / EoP | Server Actions + RSC use only anon+JWT (`@supabase/ssr`); CI/FND-03 asserts `service_role` is server-only. Lint/grep `src/app`+`src/lib/actions` for forbidden imports. |
| Mass-assignment via Server Action | Tampering / EoP | zod `.parse` with an explicit allow-list of fields; never spread raw `formData` into a DB `update`. |
| Privilege bypass on writes | Elevation of Privilege | Rely on RLS (not TS checks) as the wall; the allowlist policy already gates INSERT/UPDATE on `rules`/`budgets`/`transactions`. |
| Idempotency abuse on "re-apply" | Tampering | The action is idempotent + returns an affected-count; no destructive side effects on re-run (CAT-05). |
| PII in logs | Information Disclosure | Keep the Phase-1 discipline: log counts/status only, never amounts/descriptions/IBANs (cron already does this; Server Actions must too). |

## Sources

### Primary (HIGH confidence — verified against codebase)
- `src/lib/ingestion/rules/engine.ts`, `builtins.ts` — pure ordered classifier; `RuleId` string union; `SUBLET_COST_CENTER='sublocacao'`; emits `costCenter='shared'` default.
- `src/lib/db/schema.ts` — `budgets` (no `category_id`), `balances` (no UNIQUE(account,date)), `rules`, `transactions.rule_id uuid FK`, `dim_calendar.period_key`.
- `scripts/ingest.ts` — balance capture already wired (`upsertBalance`); `rule_id` inserted as `${null}` (line ~196); WRITE plane via `postgres`/`DATABASE_URL`.
- `drizzle/0001_rls_policies.sql` — `allowlist_all for all to authenticated` on `rules`/`budgets`/`transactions`; `is_email_allowed()` SECURITY DEFINER.
- `drizzle/0002_seed.sql`, `0003_ingestion.sql` — category taxonomy seed (Housing/Groceries/…); cost_centers seeded `lorenzo/fernanda/compartilhado/sublocacao`.
- `src/lib/supabase/server.ts` — `createClient()` (anon + user JWT) ready for Server-Action writes.
- `test/rules.test.ts` — the 11-assertion frozen engine contract.
- `package.json` / registry — recharts 3.8.1, drizzle-orm 0.45.2, drizzle-kit 0.31.10, next 15.5.19 pinned.

### Secondary (MEDIUM confidence — web, cross-checked)
- PostgreSQL calendar-dimension LEFT-JOIN zero-fill — learnsql.com, postgresql.org wiki (Date/Time dimensions), tigerdata.com.
- Postgres keyset/seek pagination on composite key — stacksync.com, sequinstream.com, citusdata.com.

### Tertiary (LOW confidence — training knowledge, flagged)
- Recharts-3 transparent-offset stacked-bar waterfall idiom (Pattern 8 / A2) — verify on paste.
- Next 15 Server Actions + `useOptimistic` API shape — standard but Context7 unavailable this session; cited from nextjs.org docs from training.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all versions verified against the registry + `package.json`; no new packages.
- Architecture (marts, write plane, exclusions, sublet net): HIGH — grounded in verified schema/engine/RLS; SQL patterns MEDIUM (web-verified).
- Pitfalls: HIGH — the two mismatches (cost-center code, NULL `rule_id`) are verified directly in source.
- Charts (waterfall): MEDIUM — Recharts-3 idiom is sound but Context7 was unavailable; verify on paste.

**Research date:** 2026-06-23
**Valid until:** 2026-07-23 (stable; locked stack, internal patterns). Re-verify the Recharts-3 waterfall idiom at implementation.
