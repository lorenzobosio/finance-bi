# Feature Research

**Domain:** Personal-finance BI / PFM — a couple's "household-as-a-business" dashboard (open-banking ingestion, fixed category taxonomy + versioned rules, per-person cost-center budgeting, gamified €100k investing goal)
**Researched:** 2026-06-21
**Confidence:** MEDIUM — feature landscape corroborated across multiple PFM comparisons (YNAB, Monarch, Copilot, Lunch Money, Actual, Honeydue, Koody); product-specific calls anchored in the project's own spec (HIGH for those). Single-user-pair tool, so "market expectation" is moderated by what THIS couple actually needs.

## How the framing maps to real PFM tools

The product reframes generic PFM concepts as business concepts. The framing is sound — every piece has a proven analogue:

| House-as-a-business concept | Standard PFM analogue | Where it's proven |
|---|---|---|
| Revenue = salaries | Income tracking | Every PFM tool |
| Cost centers (Lorenzo / Fernanda / Shared) | Per-person + shared expense buckets with individual budgets | Honeydue, Koody, Shareroo, Monarch couples mode |
| Budgeted vs actual per cost center | Per-category monthly limits + overspend alerts | Monarch, Shareroo, YNAB |
| Margin = revenue − investment − costs | Cash-flow / savings-rate report | Monarch reports, YNAB "Age of Money" |
| €100k investing goal w/ milestones + €4k streak | Goal progress bar + milestone badges + streak tracker | YNAB targets, Monarch goals, fintech gamification patterns |
| Fixed taxonomy + versioned rules | Categorization rules engine (ordered, specificity-ranked) | Actual Budget, YNAB, Copilot ML |
| €100k = sum of contributions (cost basis) | Net-worth / investment contribution tracking | Monarch contribution tracking |

The novel part is not any single feature; it's **enforcing comparability** (fixed taxonomy + versioned rules + monthly grain) so the P&L is trustworthy MoM/YoY, and **collapsing the answer to four KPIs** surfaced in under a minute. That is the differentiator.

## Feature Landscape

### Table Stakes (Users Expect These)

Without these the tool fails its core promise: "answer four questions in under a minute, with trustworthy automatic data."

| Feature | Why Expected | Complexity | Notes / Phase |
|---|---|---|---|
| Automatic bank-account sync (no manual entry) | Every modern PFM syncs; manual entry is the thing this couple wants to avoid | HIGH | Enable Banking AISP, daily pull-only cron. **Phase 1.** Idempotent + `dedupe_hash`. |
| Idempotent ingestion (no duplicate transactions) | Duplicates silently corrupt every KPI; trust is the core value | MEDIUM | Dedupe key = account + date + amount + normalized desc + bank id. **Phase 1.** |
| Auto-categorization of transactions | Uncategorized data = no spending views, no P&L | MEDIUM | Versioned `rules`, fixed taxonomy. **Phase 1→2.** |
| Transactions table (view, re-categorize, assign cost center) | Users must be able to correct mistakes; rules never catch 100% | MEDIUM | Re-categorize + "create rule from this txn". **Phase 2.** |
| Spending breakdowns (by category / account / person) | The baseline "where did the money go" question | LOW–MEDIUM | Tremor/Recharts aggregations over monthly grain. **Phase 2.** |
| Budgeted vs actual per bucket | Couples apps universally offer per-category limits; "did either person blow their budget" is a stated core question | MEDIUM | Cost-center budgets. **Phase 2.** |
| Net-worth / total-invested figure | The single most-tracked PFM number; here it's the €100k denominator | LOW (MVP) | MVP = sum of contributions (cost basis), not live market value. **Phase 3.** |
| Home dashboard surfacing the 4 KPIs | The whole product is "answer in <1 min" | MEDIUM | Mobile-first hero. **Phase 2→3.** |
| Month-over-month comparability | Stated first principle; without it the P&L is anecdotal | MEDIUM | Depends on fixed taxonomy + calendar dimension. **Cross-cutting, Phase 2.** |
| Secure login, data behind auth | Financial data; non-negotiable | LOW–MEDIUM | Google + 2-email allowlist + RLS on all tables. **Phase 0.** |
| Config (accounts, connections, categories, rules, budgets, allowlist) | Sync consent expires every 90 days (PSD2 SCA) — without reconnect UI the data silently goes stale | MEDIUM | `connections.expires_at` reconnect. **Phase 0→2.** |

### Differentiators (Competitive Advantage)

These are why this tool exists instead of installing Monarch. They map directly to Core Value and the four KPIs.

| Feature | Value Proposition | Complexity | Notes / Phase |
|---|---|---|---|
| House-as-a-business P&L view | Revenue vs investment vs costs → result + margin (% of revenue). Reframes a budget as a business statement the couple can reason about | MEDIUM | Correctness rule: internal transfers and the €4k are NOT costs; €4k = `flow_type=investimento`. **Phase 2.** |
| Cost centers as first-class (Lorenzo / Fernanda / Shared) | Per-person accountability with individual budgets, but as an analytical label not an access wall — both see everything | MEDIUM | Couples apps do per-person; the "analytical-label-not-access-boundary" choice keeps RLS simple. **Phase 2.** |
| €100k goal page, gamified | Milestones (10k/25k/50k/75k/100k), % to goal, ETA. Turns a long savings slog into visible momentum | MEDIUM | Progress bar + milestone markers + ETA projection from contribution run-rate. **Phase 3.** |
| €4k/month contribution streak | "Pay yourself first" made into a habit loop; "did we hit €4k this month" is a stated core question | MEDIUM | Detect `flow_type=investimento` internal transfer; streak = consecutive months ≥ €4k. **Phase 3.** |
| Versioned rules + fixed taxonomy for comparability | Re-running categorization can't silently rewrite history; MoM/YoY stays honest | MEDIUM–HIGH | Rule ordering = least→most specific (Actual Budget pattern). Versioning is the comparability guarantee. **Phase 1→2.** |
| Two-audience UX (technical desktop + non-technical mobile PWA) | Same data, two front doors: Lorenzo's config-heavy desktop, Fernanda's simple mobile-first PWA | MEDIUM | Mobile-first is the default; PWA installability is **Phase 4**. |
| Single-ETF / single-currency simplicity | One ETF (Invesco FTSE All-World), EUR-only → no portfolio-management bloat | LOW (by omission) | Live valuation + FX deferred to **Phase 6**; cost-basis is enough for the goal in MVP. |

### Anti-Features (Commonly Requested, Often Problematic)

Documented to prevent scope creep. Most are already in PROJECT.md "Out of Scope" — restated here with the *why*.

| Feature | Why Requested | Why Problematic | Alternative |
|---|---|---|---|
| CSV / manual transaction import | "What if a bank isn't supported / for backfill" | Breaks idempotency and comparability; ongoing maintenance burden; reintroduces the manual entry this tool eliminates | Automatic open-banking only; add more banks via the same AISP path later |
| Live ETF market value / multicurrency in MVP | "I want my real portfolio value" | Investment positions usually sit outside PSD2; needs prices API + FX + holdings model — large surface, off the critical path to €100k | €100k = sum of contributions (cost basis) in MVP; live valuation = **Phase 6** |
| Automated AI insights in MVP | "An AI that watches my money" | Automated Claude jobs draw metered credits, not the subscription; cost + reliability risk before the data is even proven | Manual-first daily digest / weekly report (Haiku, tiny prompts) = **Phase 5**; "phrase of the day" hidden until then |
| Reminders / push notifications in MVP | "Tell me when budget is blown / consent expires" | Notification infra + PWA push is its own project; premature before AI and PWA exist | **Phase 7**, after AI; surface 90-day reconnect status passively in Config meanwhile |
| Historical backfill | "I want years of history / YoY now" | Open banking exposes limited history; backfill is lumpy and breaks the clean go-forward grain | Go-forward only; YoY becomes meaningful after ~12 months |
| Per-user data isolation by cost center | "Privacy between partners" | A real access wall complicates RLS and contradicts "both see everything"; cost center is analytical, not a permission | RLS enforces only the 2-email allowlist; cost center is a label |
| Casino-style / heavy gamification (badges, confetti, leaderboards) | "Make saving fun" | Industry criticized for manipulative engagement loops; this couple needs clarity, not dopamine slot-machines | Restrained gamification: honest progress bar, 5 milestone markers, €4k streak count — motivational, not manipulative |
| Bill detection / subscription cancelation / credit-score (Rocket Money style) | "Other apps do it" | Off-mission; this is a BI dashboard for a defined couple, not a money-management marketplace | Out of scope entirely; not in any phase |
| Configurable / open-ended categories per import | "Flexibility" | A taxonomy that drifts destroys MoM/YoY comparability — the first principle | Fixed taxonomy; change is a deliberate, versioned event |

## Feature Dependencies

```
Phase 0 Foundation (auth + RLS + schema + Config shell)
    └──requires──> Phase 1 Ingestion (Enable Banking daily pull, dedupe)
                       └──requires──> Versioned rules + fixed taxonomy (categorization)
                                          └──requires──> Phase 2 Core BI + house-as-business
                                                             ├── Spending views (by cat/account/person)
                                                             ├── Cost-center budgets (budgeted vs actual)
                                                             ├── P&L view (revenue − investment − costs, margin)
                                                             └── MoM comparability (calendar dimension)
                                                                    └──requires──> Phase 3 €100k Goal
                                                                                       ├── total invested (cost basis)
                                                                                       ├── milestones + % + ETA
                                                                                       └── €4k streak (flow_type=investimento)

Phase 4 PWA            ──enhances──> Home dashboard + all Phase 2/3 views (Fernanda's mobile experience)
Phase 5 AI            ──enhances──> Home ("phrase of the day"), reads Phase 2/3 aggregates → insights table
Phase 6 ETF valuation ──enhances──> €100k Goal (cost basis → live market value, P/L, allocation) + adds FX
Phase 7 Reminders    ──requires──> Phase 5 AI + Phase 4 PWA (push); surfaces 90-day reconnect + budget alerts
```

### Dependency Notes

- **Everything requires Ingestion (Phase 1):** no trustworthy data → no KPI is correct. Ingestion is the spine.
- **Categorization requires the fixed taxonomy + versioned rules:** comparability is a precondition, not a polish item — it must exist before Phase 2's P&L is meaningful.
- **P&L, cost-center budgets, and spending views all share the monthly-grain + cost-center model:** build the dimensional model once in Phase 2; the three views are projections of it.
- **€100k Goal (Phase 3) depends on the €4k contribution being correctly classified** as `flow_type=investimento` (not a cost, not double-counted as a transfer). Get the flow-type taxonomy right in Phase 1/2 or the streak and progress are wrong.
- **PWA (Phase 4) enhances, never gates:** the mobile-first views exist in Phase 2/3; Phase 4 only adds installability/offline via Serwist.
- **ETF valuation (Phase 6) replaces, not adds:** it upgrades the €100k denominator from cost-basis to market value; the goal page must be written so this swap is non-breaking.
- **Reminders (Phase 7) conflict with "MVP lean":** correctly last — depends on both AI (Phase 5) and PWA push (Phase 4).

## MVP Definition

MVP = **Phases 0–3**. The bar: the four core questions answer correctly and comparably.

### Launch With (v1 — Phases 0–3)

- [ ] Google login + 2-email allowlist + RLS on all tables — financial data behind auth *(Phase 0)*
- [ ] Daily idempotent ingestion of the 3 Revolut accounts (dedupe, no duplicates) — the trustworthy-data foundation *(Phase 1)*
- [ ] Versioned rules + fixed taxonomy + cost-center assignment — comparability precondition *(Phase 1→2)*
- [ ] Transactions page (view, re-categorize, create rule, assign cost center) — correct the long tail rules miss *(Phase 2)*
- [ ] Spending views by category / account / person — baseline "where did it go" *(Phase 2)*
- [ ] Cost centers with individual budgets — budgeted vs actual; "did either person blow their budget" *(Phase 2)*
- [ ] P&L view — revenue vs investment vs costs, result + margin %; "what's the margin" *(Phase 2)*
- [ ] MoM comparability across all views — the first principle *(Phase 2)*
- [ ] Home dashboard (mobile-first) — €100k hero + current-month KPIs; the <1-min answer *(Phase 2→3)*
- [ ] €100k Goal page — total invested, % to goal, milestone, ETA, €4k streak; "how far to €100k", "did we hit €4k" *(Phase 3)*
- [ ] €4k contribution detection (`flow_type=investimento`) feeding goal progress *(Phase 3)*
- [ ] Config (accounts, connections incl. 90-day reconnect, categories, rules, budgets, allowlist) *(Phase 0→2)*

### Add After Validation (committed, post-MVP)

- [ ] PWA (Serwist) — installable, offline-tolerant; **trigger:** MVP views stable and Fernanda using mobile daily *(Phase 4)*
- [ ] AI insights — manual daily digest + weekly report → `insights`; **trigger:** enough data to make insights non-trivial *(Phase 5)*

### Future Consideration

- [ ] ETF valuation + multicurrency — live market value, P/L, allocation, `fx_rates`/`holdings`; **defer:** positions sit outside PSD2, cost-basis suffices for the goal *(Phase 6)*
- [ ] Reminders / notifications — 90-day reconnect, budget alerts; **defer:** needs AI + PWA push first *(Phase 7)*

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---|---|---|---|
| Idempotent daily ingestion | HIGH | HIGH | P1 |
| Versioned rules + fixed taxonomy | HIGH | MEDIUM | P1 |
| P&L view (margin) | HIGH | MEDIUM | P1 |
| Cost-center budgeted vs actual | HIGH | MEDIUM | P1 |
| €100k goal + milestones + ETA | HIGH | MEDIUM | P1 |
| €4k streak detection | HIGH | MEDIUM | P1 |
| Spending views (cat/account/person) | MEDIUM | LOW | P1 |
| Home dashboard (4 KPIs, mobile-first) | HIGH | MEDIUM | P1 |
| MoM comparability | HIGH | MEDIUM | P1 |
| Auth + RLS + allowlist | HIGH | LOW | P1 |
| Config + 90-day reconnect | MEDIUM | MEDIUM | P1 |
| PWA installability | MEDIUM | MEDIUM | P2 |
| AI insights (manual) | MEDIUM | MEDIUM | P2 |
| ETF live valuation + FX | MEDIUM | HIGH | P3 |
| Reminders / push | LOW–MEDIUM | MEDIUM | P3 |

## Competitor Feature Analysis

| Feature | YNAB | Monarch / Copilot | Our Approach |
|---|---|---|---|
| Categorization | Manual + rules (mindfulness) | Copilot ML + Tinder-swipe Review | Versioned rules, fixed taxonomy, manual correction → rule (Actual-style specificity ordering) |
| Budgeting model | Zero-based envelopes | Per-category monthly limits | Cost-center budgets (per-person + shared), budgeted vs actual |
| Net worth / goal | Color-coded targets, "Age of Money" | Goal progress bars, Zillow asset values, contribution tracking | Single €100k goal: milestones + % + ETA + €4k streak, cost-basis denominator |
| Couples | Shared budget | Honeydue/Koody/Monarch: individual + shared, split rules, overspend alerts | Cost center as analytical label; both see all; no access wall |
| Investments | Basic | Monarch: holdings, allocation, performance | One ETF, cost-basis in MVP; live value = Phase 6 |
| Reframing | Budget discipline | Financial visibility | **Business P&L: revenue − investment − costs = margin** (unique framing) |
| Gamification | Targets | Goals/streaks (some criticized as manipulative) | Restrained: progress bar + 5 milestones + €4k streak, motivational not manipulative |

## Sources

- Era / WallStreetSurvivor / WalletGrower / Engadget — YNAB vs Monarch vs Copilot vs Lunch Money feature comparisons (MEDIUM)
- Actual Budget docs, YNAB support, MoneyPatrol, Spendee — categorization rule engines, specificity ordering, auto-rule creation (MEDIUM)
- Wealthtender / Moneywise / 11fs / Daily Emerald — net-worth tracking + fintech gamification mechanics and its criticism (MEDIUM)
- Koody / Honeydue / Shareroo / Monarch couples / Rocket Money — shared & per-person budgeting, split methods, budgeted-vs-actual alerts (MEDIUM)
- `.planning/PROJECT.md` — product vision, KPIs, data model, MVP boundary, out-of-scope (HIGH, authoritative for product-specific calls)

---
*Feature research for: personal-finance BI "household-as-a-business" dashboard*
*Researched: 2026-06-21*
