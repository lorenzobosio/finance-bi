# Phase 2: Core BI + house-as-business - Context

**Gathered:** 2026-06-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Turn the classified Phase-1 transaction data into the **house-as-a-business BI layer**: calendar-joined SQL marts and the UI that reads them. The household is run like a business — salaries are **revenue**, spending is split across **cost centers** (Lorenzo / Fernanda / Shared) each with an editable budget, the **€4k pocket contribution** is `investimento` (excluded from costs and revenue), and **Sublocação** is a standalone **profit center** with its own P&L that rolls a single **net** line into the household result.

This phase delivers (per ROADMAP Phase 2 + REQUIREMENTS CAT-04/05/06, BI-01..07):
- A **user-editable, versioned rules engine** that assigns category / cost_center / flow_type on ingest, with manual override that **persists forward**.
- **SQL marts** (calendar dimension joined) for: P&L (revenue vs investimento vs costs → result + margin %), Sublocação isolated P&L + net roll-up, cost-center budgeted-vs-actual, spending breakdown by category / account / person, **category-as-% -of-revenue**, and the daily-balance / net-worth / months-of-reserve trend.
- The **pages**: Home (4 headline KPIs, mobile-first), Gastos/Spending, Cost Centers + Sublocação, Transações (recategorize / create rule / assign cost center), and Config (manage categories, rules, **budgets**).
- All views **month-over-month comparable** via `dim_calendar` (empty months → €0, current partial month flagged provisional, YoY = "insufficient history" until ~12 months).

**Hard scope fence:** the €100k goal, the savings-allocation cascade, milestones and any gamification are **Phase 3** — NOT here (see Deferred Ideas).

</domain>

<decisions>
## Implementation Decisions

### Categorization & the rules engine (becomes user-editable)
- **D2-01 — Auto-rules + calibrate:** categories, cost-center overrides, and the Sublocação tag are assigned by **best-effort signature rules on ingest**, then **calibrated against real June data** — the exact playbook that fixed the `investimento` signature (placeholder matched nothing until tuned on the live €5038 transfer). It is acceptable that some rows land in **"Uncategorized"** until signatures are tuned; breakdowns must degrade gracefully (an "Uncategorized" slice), never crash.
- **D2-02 — Manual override persists FORWARD:** recategorizing a transaction (e.g. REWE Health → Food) writes/updates a **persistent rule** in the `rules` table so future months inherit it — the user must never re-tag the same merchant twice. **The engine must consult DB `rules` rows**, not only the hardcoded `builtins.ts` seed. This is the heart of CAT-04.
- **D2-03 — Raw history is never silently rewritten (CAT-05):** a manual edit changes **that one row** immediately and **optionally** creates a forward rule. Applying a (new or edited) rule to **existing past rows** is an **explicit user action** (a "re-apply to matching transactions" button), never an automatic side effect of saving a rule.
- **D2-04 — Resolve the `rule_id` audit gap (was "Fix 2"):** today the engine emits string labels from `builtins.ts` while `transactions.rule_id` is a `uuid` FK → `rules.id`, so `rule_id` stays NULL. Phase 2 **seeds the built-in rules as real `rules` rows** (or otherwise persists the mapping) so `rule_id` resolves to a real, versioned row and every classification is auditable. Fold into the rules-engine plan.
- **D2-05 — Sublet uses the same auto+calibrate+override pattern:** the placeholder `SUBLET_SIGNALS` (`sublocacao`/`sublet`/`untermiete`) won't match real tenant-rent or utility memos. Seed the **real tenant / utility signatures** against live data; manual tag on Transações persists forward (D2-02). The engine already routes a sublet-tagged inflow → revenue / `costCenter=sublocacao` and a paid leg → cost / `costCenter=sublocacao` (D-25) — keep that contract.

### Sublocação as a profit center
- **D2-06 — Standalone P&L:** Sublocação has its **own P&L** = its tagged revenue − its tagged costs (rent received − rent/utilities paid). It is **NOT** mixed into the 3 household cost-center budgets.
- **D2-07 — Net-only roll-up, no double-count:** the household P&L **excludes the sublet's gross legs** from the main revenue/cost SUMs and adds a **single `sublet_net` line** to the household result. Implement as a dedicated bucket (the `sublocacao` cost-center / a flag) that is filtered out of the main aggregations and re-injected once, netted.
- **D2-08 — Its own view:** Sublocação gets a dedicated section/view (the Cost-Centers area) showing its standalone P&L; the household P&L surfaces only the net line.

### Revenue / result / margin model
- **D2-09 — Revenue = net salary:** what actually lands in the accounts, matched by the existing salary signature. **Bonuses are one-off** → `is_recurring = false` so they don't distort recurring-revenue / run-rate views.
- **D2-10 — Emergency fund = Patrimônio:** no separate bucket or goal in Phase 2 — it is simply part of net worth / cash position (the balances trend). The one-off June ~€3272 "Instant Access Savings" transfer stays classified `cost` (out of scope, per the saved decision — do not re-flag).
- **D2-11 — Result & margin:** household **result = revenue − investimento − costs**; **margin = result / revenue (%)**. Sublet enters once as `sublet_net` (D2-07). `investimento` (the €4k legs) and `transferência` are excluded from both revenue and costs — already enforced by the engine; the marts must preserve that.

### Budgets
- **D2-12 — Ship at €0, edited in-app:** budgets start empty and are **fully editable in the Config page** (BI-06). **No € amounts in the repo** (public-CV / no-PII rule). Bars render once the user fills them; an empty budget shows "not set", not a fake cap.
- **D2-13 — Suggest budgets from history:** after ~1 month of real data, offer a helper to **set a budget from historical actuals** (e.g. last month's actual or a trailing average) so budgets reflect reality rather than arbitrary limits. The user explicitly does NOT want unrealistic hardcoded caps.
- **D2-14 — Category-level budgets wanted (planner note):** the user wants budgets "for the different cost categories", but the `budgets` table is currently keyed on `cost_center` ONLY. Phase 2 likely **extends `budgets` with a nullable `category_id`** so budgeted-vs-actual works at both the cost-center grain AND the category grain. Flag for the data-layer plan.

### New BI requested
- **D2-15 — Category-as-%-of-revenue:** a first-class Phase-2 analysis showing each spending category as a **share of (salary) revenue** — "how much of our income does each category eat?". Fits BI-03 (breakdown by category). Not deferred.

### Claude's Discretion
The user said "we are open for other inputs from you." Claude decides (and may propose, not force):
- Chart selection per view (Tremor Raw copy-paste vs bespoke Recharts), Home KPI card layout/order, which marts are plain SQL views vs materialized.
- How %-of-revenue is visualized (stacked bar vs table with sparkbars).
- **Proposed additions to surface (in scope, low cost):** a **savings-rate KPI** (`(investimento + sublet_net) / revenue`) and **months-of-reserve** (cash position ÷ avg monthly costs) — the latter is already named in BI-07/success-criteria, so build it; the savings-rate is a natural complement to the 4 headline KPIs.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements
- `.planning/ROADMAP.md` → "### Phase 2: Core BI + house-as-business" — goal, 5 success criteria, requirement mapping (CAT-04/05/06, BI-01..07).
- `.planning/REQUIREMENTS.md` — CAT-04/05/06 (rules engine + recategorize + default cost center) and BI-01..07 (P&L, budgets, breakdowns, MoM, Home KPIs, Config, balances). Also REM-02 (overspend alerts) → noted as Phase 7.
- `.planning/phases/01-ingestion-enable-banking/01-CONTEXT.md` — Phase-1 decisions the marts depend on (D-04/18/19/22/25/26 classification semantics; READ vs WRITE plane).

### Rules engine (the asset to extend → DB-backed + user-editable)
- `src/lib/ingestion/rules/engine.ts` — the **pure, ordered, first-match-wins** classifier. Phase 2 makes it **consult DB `rules` rows** (D2-02) while keeping the contract in `test/rules.test.ts` green.
- `src/lib/ingestion/rules/builtins.ts` — seeded `SALARY_SIGNALS`, `SUBLET_SIGNALS`, `INVESTING_SIGNATURE`, `RULESET_VERSION`, `RuleId`. These migrate into `rules` rows (D2-04) and the sublet signals get calibrated (D2-05).
- `test/rules.test.ts` — the frozen engine contract (investimento > transferência > revenue/sublet > cost; cost-center defaulting CAT-07). Extend, don't break.

### Data layer
- `src/lib/db/schema.ts` — `rules` (priority/version/match_criteria/set_category/set_cost_center/set_flow_type), `categories` (group enum essential|desire|investment + parent_id), `cost_centers`, `budgets` (cost_center + period_key YYYYMM + amount_eur — **no category_id yet**, D2-14), `balances` (daily snapshots — empty, BI-07 populates), `transactions` (rule_id uuid FK, category_id, cost_center, flow_type, is_recurring, status), `dim_calendar` (seeded 2024-2035, powers MoM/YoY).
- `scripts/ingest.ts` — the cron; extend to **capture daily balances** into `balances` (BI-07). Reads `DATABASE_URL` (WRITE plane, postgres driver, bypasses RLS).
- `src/lib/status/connection-status.ts` + the Home freshness banner — Phase-1 READ-plane asset (`@supabase/ssr`, RLS, NEVER service_role) to reuse on every Phase-2 dashboard (ING-06 "data as of").

### Calibration playbook (signatures)
- Memory `investing-account-not-exposed.md` — documents the auto-signature-then-calibrate-on-live-data approach that D2-01/D2-05 reuse for categories and the sublet.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Freshness banner** (`connection-status.ts` + Home banner, `STALE_THRESHOLD_HOURS=36`): reuse the "data as of {date}" / stale flag on every Phase-2 dashboard (ING-06).
- **`(protected)` layout + Supabase SSR server client**: the READ plane for all marts/pages — anon key + user JWT + RLS allowlist. No `service_role` in the app.
- **`dim_calendar`** (seeded 2024-2035) + **`period_key` (YYYYMM int)** on `budgets`/`investment_contributions`: the join key for all MoM/YoY comparability.
- **The rules engine + builtins**: pure and unit-tested — extend to DB-backed, don't rewrite.

### Established Patterns
- **Two planes (Phase-1 lesson):** READ = `@supabase/ssr` + RLS (UI + SQL marts, anon/user). WRITE = `postgres` driver + `DATABASE_URL` (cron/scripts, bypasses RLS). Phase-2 marts are **read-only** through the SSR client; **user writes** (budget edits, recategorize, create-rule) go through **Route Handlers** or RLS-allowed writes by the 2 allowlisted emails — needs **RLS INSERT/UPDATE policies on `budgets` and `rules`** for the allowlist (planner note).
- **Enum/flow contract:** `flow_type ∈ {revenue, cost, investimento, transferencia}`; Portuguese labels (faturamento/custo/…) are DISPLAY-only.

### Integration Points
- `rules` table ← recategorize / create-rule (Transações, Config). Engine reads it.
- `budgets` table ← Config budget editing (+ likely `category_id` column, D2-14).
- `balances` table ← cron daily snapshot (BI-07) → net-worth / months-of-reserve marts.
- New **SQL marts/views** ← all dashboards read these (P&L, sublet P&L, cost-center budget, category & %-of-revenue, balance trend).
- Pages under `src/app/(protected)/` (only `page.tsx` exists today — Home).

</code_context>

<specifics>
## Specific Ideas

**Category seed taxonomy (editable — `category` = WHAT, `cost_center` = WHO):**
- **Accommodation** — rent, electricity, internet, furniture, renovation
- **Food** — groceries, dm/drugstore, dining out
- **Transport**
- **Health**
- **Leisure**
- **Subscriptions**
- **Personal**

All editable in Config. Reconcile this against the existing `categories` seed (0002) and the `group` enum (essential | desire | investment).

**Intended plan slicing (the user's 2.1–2.4 — guide the planner):**
- **2.1 — Metrics + P&L marts:** calendar-joined SQL for P&L (revenue/investimento/costs → result + margin), **Sublocação P&L isolated + net roll-up** (D2-06/07), category & **%-of-revenue** breakdowns (D2-15), cost-center budgeted-vs-actual, balance / net-worth / months-of-reserve trend. Make the **rules engine DB-backed + resolve `rule_id`** (D2-02/04). Capture **daily balances** in the cron (BI-07).
- **2.2 — Home + Gastos:** Home with the **4 headline KPIs** (mobile-first) answerable in <1 min; Gastos/Spending broken down by category, account, person + %-of-revenue.
- **2.3 — Cost Centers + Sublocação + budgets:** Lorenzo/Fernanda/Shared budgeted-vs-actual, the **Sublocação profit-center view**, and **Config budget editing** (€0 start, edit in-app, suggest-from-history).
- **2.4 — Transações:** table with **recategorize / create-rule-from-transaction (persists forward) / assign cost center** (CAT-04/05).

**Sublocação:** treat as a real profit center; only its **net** touches the household P&L.

</specifics>

<deferred>
## Deferred Ideas

- **Allocation cascade** (invest €4k → Brazil/Adventures €0–500 → shared living → individual allowance to each person's own account, spent freely) → **Phase 3** (user chose "defer whole cascade to Phase 3").
- **€100k goal, milestones (10k/25k/50k/75k/100k), gamification, the savings "waterfall" visualization** → **Phase 3**.
- **PWA / mobile install for Fernanda** → Phase 4.
- **AI daily digest / weekly report → `insights`** → Phase 5.
- **ETF market value** (true shares × live Invesco FTSE All-World price + the per-contribution shares/price popup) and **FX/multicurrency** → Phase 6.
- **Budget-overspend alerts (REM-02)** → Phase 7 (the budget data model lands here, the notification does not).

None of the above is in Phase 2 scope.

</deferred>

---

*Phase: 2-Core BI + house-as-business*
*Context gathered: 2026-06-23*
