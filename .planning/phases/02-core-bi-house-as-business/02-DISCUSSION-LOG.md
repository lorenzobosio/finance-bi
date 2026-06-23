# Phase 2: Core BI + house-as-business - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-23
**Phase:** 2-Core BI + house-as-business
**Areas discussed:** Categorization strategy, Allocation cascade scope, Budget seeding

> Note: the user supplied a near-complete house-as-business spec up front (Sublocação as a profit center with net-only roll-up, revenue = net salary / bonuses one-off, emergency fund = Patrimônio, category(what) × cost-center(who), Plans 2.1–2.4 + acceptance criteria). Those were captured directly into CONTEXT.md rather than re-asked. Only the three genuinely-open decisions below were put to the user.

---

## Categorization strategy (category + Sublocação tagging)

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-rules + calibrate | Seed merchant/counterparty signatures, auto-assign on ingest, refine against real June data (like investimento). Some rows start Uncategorized. | ✓ |
| Manual-first | Everything starts Uncategorized; user assigns on the Transações page. | |
| Hybrid (auto-suggest, confirm) | Engine guesses, flags low-confidence rows for review. | |

**User's choice:** Auto-rules + calibrate — **with a manual override that persists forward.**
**Notes:** "if you mark once that rewe was from health category and I go and change it to food, it persists as food for future analysis." → a manual recategorization must write/update a persistent rule so future months inherit it (CAT-04), without silently rewriting raw history (CAT-05). This makes the `rules` table the user-editable source of truth and resolves the `rule_id` audit gap (former "Fix 2").

---

## Allocation cascade scope (Phase 2 vs Phase 3)

| Option | Description | Selected |
|--------|-------------|----------|
| Budget lines only in Phase 2 | Cascade as budgeted-vs-actual lines; €100k goal + waterfall in Phase 3. | |
| Full visual cascade now | Build the allocation waterfall as a Phase-2 component. | |
| Defer whole cascade to Phase 3 | Phase 2 = 3 core cost-center budgets only; Brazil/Adventures/allowance waits. | ✓ |

**User's choice:** Defer the whole cascade to Phase 3.
**Notes:** Keeps Phase 2 = pure BI (3 cost-center budgets + Sublocação P&L). The €4k→Brazil/Adventures→shared→allowance structure belongs with the €100k goal in Phase 3.

---

## Budget seeding (public-repo / no-PII constraint)

| Option | Description | Selected |
|--------|-------------|----------|
| You enter them in Config | Ship at €0, edit in-app at runtime. Zero numbers in repo. | ✓ |
| Seed neutral placeholders | Round placeholders committed so bars render. | |
| Seed from ranges I'll give you | Real-ish defaults baked in — violates no-PII rule. | |

**User's choice:** Ship empty (€0), editable in-app.
**Notes:** "I want the budgets to reflect the reality and not to limit us to something unrealistic… start with 0 and after the first month start allocating numbers based on the historical values and adjusting." → add a "suggest budget from history" helper after month 1. Also new ask: **"different BIs to analyse how each category plays as a percentage out of our salary revenue"** → captured as a first-class Phase-2 view (category-as-%-of-revenue, BI-03). User: "we are open for other inputs from you" → Claude proposed a savings-rate KPI + months-of-reserve (the latter already in BI-07).

## Claude's Discretion

- Chart selection per view (Tremor Raw vs bespoke Recharts), Home KPI card layout/order, SQL views vs materialized marts, %-of-revenue visualization.
- Proposed (not forced): savings-rate KPI `(investimento + sublet_net) / revenue`; months-of-reserve (already in BI-07).

## Deferred Ideas

- Allocation cascade (€4k→Brazil/Adventures→shared→allowance) → Phase 3.
- €100k goal, milestones, gamification, savings waterfall → Phase 3.
- PWA/mobile install → Phase 4. AI digest → Phase 5. ETF market value + FX → Phase 6. Budget-overspend alerts (REM-02) → Phase 7.
