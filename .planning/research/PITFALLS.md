# Pitfalls Research

**Domain:** Personal-finance BI app on open banking (PSD2/AISP via Enable Banking) + Supabase RLS + Next.js + GitHub Actions daily cron + Claude insights + Serwist PWA
**Researched:** 2026-06-21
**Confidence:** HIGH (financial-correctness and PSD2 pitfalls grounded in PROJECT.md decisions + verified vendor docs; a few items MEDIUM where vendor behavior is account-specific and must be confirmed at setup)

> Phase legend (from PROJECT.md): **0** Foundation · **1** Ingestion (Enable Banking) · **2** Core BI + house-as-business · **3** €100k Goal · **4** PWA · **5** AI · **6** ETF valuation + multicurrency · **7** Reminders

---

## Critical Pitfalls

### Pitfall 1: The €4,000 contribution leaking into "costs" (and double-counting)

**What goes wrong:**
The €4k/month pay-yourself-first transfer is an *internal transfer* into investments. If categorization treats it as a normal outgoing transaction it gets counted as a **cost**, inflating the cost centers and destroying the P&L margin. The mirror failure: the same €4k is counted *both* as a cost/expense **and** as investment progress — double-counting it on two sides of the P&L. A third variant: the matching credit leg on the destination account is counted as *revenue*.

**Why it happens:**
PSD2 exposes both legs of an internal transfer (debit on source account, credit on destination). Naive categorization sees two transactions with no inherent "this is a transfer between my own accounts" flag and bins them by description/amount. The €4k is special-cased nowhere unless explicitly modeled.

**How to avoid:**
- Model an explicit `flow_type` enum with `investimento` as a first-class value (PROJECT.md already mandates this). The €4k is `flow_type=investimento`, **never** a cost and **never** revenue.
- Detect internal transfers structurally: match a debit on one own-account to a credit on another own-account (same/near amount, same/adjacent date). Mark **both** legs as internal-transfer so neither inflates revenue or costs.
- In every P&L / cost-center / margin aggregation, `WHERE flow_type NOT IN ('investimento','internal_transfer')` for costs, and feed `investimento` only into the €100k goal total — exactly once.
- Make the €100k total = sum of `flow_type=investimento` contributions (cost basis), per the locked decision.

**Warning signs:**
- Cost centers spike by ~€4k in months the contribution ran.
- Margin (revenue − investment − costs) doesn't reconcile to bank balance deltas.
- €100k progress increases by €4k *and* costs increase by €4k in the same month.

**Phase to address:** Phase 2 (Core BI / house-as-business categorization + P&L), validated again in Phase 3 (€100k goal).

---

### Pitfall 2: Idempotency / dedupe_hash instability — duplicate or dropped transactions

**What goes wrong:**
The daily pull re-fetches an overlapping window of transactions. If the `dedupe_hash` is unstable (changes between pulls for the same real transaction), the same transaction is inserted twice → **duplicates** inflate spend. If the hash is too *coarse* (collides for genuinely different transactions), real transactions are silently **dropped** → spend is understated and €4k may go missing.

**Why it happens:**
- The dedupe key (per PROJECT.md: `account + date + amount + normalized description + bank id`) includes a **normalized description**, and description normalization is unstable: banks change merchant strings, append auth codes, dates, or running references between the pending and booked states.
- `booking_date` vs `value_date` flip between pulls; using a date that mutates makes the hash mutate.
- The bank transaction id is **missing or non-unique** for some Revolut entries, so a key that assumes it's always present silently differs.

**How to avoid:**
- Prefer the bank's transaction id when present and stable; treat the composite (account+booking_date+amount+normalized_description) only as a **fallback** when the id is absent — and record which strategy produced the hash so behavior is auditable.
- Pin the hash to **`booking_date`** (the date that stabilizes once booked), never `value_date` or a "pending date" that moves.
- Make description normalization deterministic and versioned: lowercase, collapse whitespace, strip known volatile tokens (auth codes, trailing reference numbers, dates). Freeze the normalization function; if you change it, you change *all* hashes — treat it as a migration.
- Enforce dedupe at the database with a `UNIQUE` constraint on `dedupe_hash` and `INSERT ... ON CONFLICT DO NOTHING/UPDATE`, so correctness doesn't depend on app-side checking.
- Handle the pending→booked transition explicitly: a pending transaction that later books must **update**, not create a second row.

**Warning signs:**
- Row count grows on a day with no new spending.
- Same merchant/amount appears twice on consecutive ingestion runs.
- `INSERT ... ON CONFLICT` conflict count is near-zero when re-pulling an overlapping window (means hashes aren't matching → instability).
- Monthly totals shift retroactively after a later pull.

**Phase to address:** Phase 1 (Ingestion) — this is the make-or-break invariant of the whole product. Add a re-pull idempotency test in Phase 1's UAT.

---

### Pitfall 3: 90-day SCA consent expiry surprises (and the 90-vs-180 assumption)

**What goes wrong:**
PSD2 consent expires and the daily pull starts returning `403 re-auth-required`. Because ingestion is pull-only with no webhooks, **nobody notices until data silently stops** — dashboards quietly freeze on stale numbers, and the couple makes decisions on dead data. Worse, the failure can land mid-month so a month looks artificially "under budget."

**Why it happens:**
- Consent has a hard expiry tracked in `connections.expires_at`; reconnect requires a human SCA flow (strong customer authentication) that can't be automated.
- The cron job treats an auth error like any transient error and retries silently, or doesn't alert.
- **Assumption mismatch:** PROJECT.md assumes a fixed **90-day** window. Verified facts: EU AIS consent can be valid up to **180 days**, but Revolut/Enable Banking may issue a **shorter** access-token/session validity, and re-auth is required when *either* the token or the consent expires — whichever is first. The real reconnect interval is account- and provider-specific and **must be confirmed at Enable Banking setup**, not assumed.

**How to avoid:**
- Store the *actual* `expires_at` returned by Enable Banking on each session/consent — do not hardcode 90 days. Surface days-remaining on the Config page.
- Make the daily cron distinguish **auth-expiry errors (403/re-auth)** from transient errors and treat expiry as a **loud, visible** state (banner on Home + Config), not a silent retry.
- Add a **freshness / heartbeat indicator**: every dashboard shows "data as of <last successful pull>". If the last pull is >24–48h old, show a warning. This is the single cheapest defense against silent staleness.
- Schedule reconnect reminders **before** expiry (Phase 7), but ship the freshness banner in MVP regardless — reminders are post-MVP but the *detection* must not be.

**Warning signs:**
- "Data as of" date stops advancing.
- Cron logs show repeated 403 / `re-auth-required`.
- Month totals flatten unexpectedly.

**Phase to address:** Detection (freshness banner + expiry storage + error classification) in Phase 1; proactive reminders in Phase 7. Do **not** defer detection to Phase 7.

---

### Pitfall 4: Which accounts are actually exposed — investment pocket likely NOT visible

**What goes wrong:**
The team builds the €100k goal assuming the Revolut **investment/savings pocket** (where the ETF and the €4k land) is readable over PSD2. It usually is **not** — investment positions and many Revolut "pockets"/vaults sit outside the PSD2 AIS scope. The €4k contribution may be visible only as a *transfer out* of the current account, with no view of the destination balance or holdings.

**Why it happens:**
PSD2 mandates access to *payment accounts*, not investment accounts. Revolut exposes the main current account(s); pockets, vaults, savings, and the trading/ETF account are commonly excluded or exposed inconsistently.

**How to avoid:**
- At Enable Banking setup (Phase 1, first task), **enumerate exactly which of the 3 Revolut accounts/pockets return data** and write it down. Treat this as a discovery spike, not an assumption.
- Architect the €100k total around **the outgoing €4k contribution leg** (`flow_type=investimento`) detected on the *visible* account — i.e., cost-basis from contributions, per the locked decision — rather than reading an investment-account balance.
- Defer live market value / holdings to Phase 6 precisely because positions sit outside PSD2 (already in PROJECT.md Out of Scope for MVP).

**Warning signs:**
- Enable Banking returns fewer accounts than expected.
- The destination of the €4k transfer has no readable balance.
- ETF holdings/units are absent from any AIS response.

**Phase to address:** Phase 1 (confirm exposed accounts — gate the rest of the roadmap on this finding). Reconfirmed in Phase 6.

---

### Pitfall 5: Amount sign conventions, pending vs booked, booking_date vs value_date

**What goes wrong:**
Spend and revenue come out with wrong signs or land in the wrong month. Common forms: debits stored as positive so costs net to zero against credits; **pending** transactions counted as final (then changing when booked); using `value_date` for one report and `booking_date` for another so MoM comparisons drift; a transaction booked on the 1st but valued on the previous month's 31st crossing a month boundary.

**Why it happens:**
PSD2 / Enable Banking responses carry both `booking_date` and `value_date`, a pending/booked status, and a signed-or-unsigned amount with a separate credit/debit indicator depending on the bank. There is no single universal convention.

**How to avoid:**
- Pick **one canonical sign convention** at the ingestion boundary (e.g., outflow negative, inflow positive) and normalize *every* transaction to it on insert. Never branch on raw bank sign downstream.
- Pick **`booking_date` as the single source of truth for period assignment** (month/MoM/YoY). Store `value_date` too but never aggregate on it. Document this once.
- Decide the **pending policy explicitly**: either exclude pending from KPIs (recommended for a "trustworthy at a glance" product) or clearly mark them as provisional. Ensure pending→booked updates the same row (ties to Pitfall 2).

**Warning signs:**
- Costs and revenue partially cancel out.
- A transaction's month changes after a later pull.
- Sum of categorized transactions ≠ bank statement total.

**Phase to address:** Phase 1 (normalize at ingestion); Phase 2 verifies period assignment via the calendar dimension.

---

### Pitfall 6: MoM/YoY breaking without a proper calendar dimension

**What goes wrong:**
Month-over-month and year-over-year comparisons are computed ad hoc with `date_trunc` and `GROUP BY`, so **months with zero transactions vanish** (gaps instead of €0), partial current months compare against full prior months, and YoY silently returns nothing for the first ~12 months. Comparability — the project's *first principle* — quietly breaks.

**Why it happens:**
Without a dense calendar dimension, aggregates only produce rows for months that have data. Missing months don't render as zero; they just disappear, making charts and deltas misleading.

**How to avoid:**
- Build an explicit **calendar/date dimension** (one row per day/month, dense, no gaps) and **left-join** facts onto it (PROJECT.md already calls for a calendar dimension — make it a real table, not a derived CTE).
- Compute MoM/YoY against the calendar so empty periods are explicit €0.
- Mark the **current (partial) month** distinctly in the UI; compare like-for-like (e.g., month-to-date vs same-day-last-month) where it matters.
- Accept that YoY is meaningless until ~12 months of go-forward data exist (locked decision) — show "insufficient history" rather than a misleading 0% or ∞%.

**Warning signs:**
- A month with no spend is missing from a trend chart instead of showing €0.
- MoM delta divides by zero or shows ∞/NaN.
- The partial current month looks like a spending cliff.

**Phase to address:** Phase 2 (Core BI) — the calendar dimension is foundational to every comparable view.

---

### Pitfall 7: Supabase RLS misconfiguration — data leak or self-lockout

**What goes wrong:**
Two opposite failures: (a) RLS is **not enabled** (or a permissive policy slips through) on a table, so financial data is reachable by anyone with the anon key — a serious leak for personal finances; or (b) RLS is *too* strict / misordered and the two legitimate users get **locked out** of their own data, or the ingestion job can't write.

**Why it happens:**
- A new table is created without `ENABLE ROW LEVEL SECURITY`, or with RLS on but no policy (default-deny locks everyone out, sometimes masked during dev because you're using the service_role key).
- The allowlist (2 emails) is enforced in app code but not in policy, so it's bypassable.
- The ingestion writer and the human readers need different access paths and get conflated.

**How to avoid:**
- **RLS enabled on every table** (locked principle). Add a CI/test assertion that fails if any table in `public` has RLS disabled.
- Enforce the **2-email allowlist in the RLS policy itself** (e.g., `auth.jwt()->>'email' IN (allowlist)`), not only in app code. Cost center is an analytical label, not an access wall (locked decision) — both users see all data, so policies are simple but must still gate the allowlist.
- Give the **ingestion job a separate path**: it uses `service_role` server-side (in GitHub Actions), which bypasses RLS by design — verify it never runs with the anon key and never ships service_role to the client.
- Test policies with a **non-allowlisted** test user and confirm zero rows returned; test with each allowlisted user and confirm full access.

**Warning signs:**
- A table shows "RLS disabled" in the Supabase dashboard.
- Querying with a logged-out / anon key returns rows.
- A legitimate user sees an empty dashboard (over-strict policy).

**Phase to address:** Phase 0 (Foundation: auth + RLS scaffolding) and re-verified whenever a new table is added (Phases 1, 2, 3, 6).

---

### Pitfall 8: service_role key exposure on the client

**What goes wrong:**
The `service_role` key (which bypasses all RLS) ends up in client-side code or a `NEXT_PUBLIC_*` env var. Anyone who opens devtools gets full read/write to all financial data — total compromise.

**Why it happens:**
- Next.js inlines any env var prefixed `NEXT_PUBLIC_` into the client bundle. Naming the service key with that prefix, or importing a server-only Supabase client into a client component, leaks it.
- Copy-paste from a "quick start" that uses service_role for everything.

**How to avoid:**
- service_role lives **only** in server contexts: GitHub Actions secrets (for ingestion) and server-only Next.js code (Route Handlers / Server Actions / server components). **Never** `NEXT_PUBLIC_`.
- Client uses **only the anon key**, and relies on RLS (Pitfall 7) for safety.
- Add a build/CI check or grep that fails if `SERVICE_ROLE` appears in any client bundle or any `NEXT_PUBLIC_` var.
- Use Vercel/GitHub encrypted secrets; never commit keys.

**Warning signs:**
- `service_role` referenced in a `'use client'` file or a `NEXT_PUBLIC_` var.
- The key appears in the browser network tab or JS bundle.

**Phase to address:** Phase 0 (Foundation) — establish the server/client boundary before any data flows. Re-checked in Phase 1 (ingestion secrets).

---

### Pitfall 9: Claude metered-credit blowout from automated jobs (June 2026 billing change)

**What goes wrong:**
Automated Claude jobs (`claude -p`, Agent SDK, Claude Code GitHub Actions) silently burn a **separate metered credit pool** at full API rates — they do **not** draw from the interactive Pro/Max subscription. A runaway prompt (e.g., the daily digest stuffing *all* transactions into context) or an accidentally-frequent cron can drain the monthly credit; once it's gone, **requests stop** (if usage credits aren't enabled) or **bill at full API rates** (if they are). Either way: surprise cost or surprise outage.

**Why it happens:**
- Verified: as of **June 15, 2026**, `claude -p` / Agent SDK / Claude Code GitHub Actions usage moved to a **separate monthly credit** ($20 Pro / $100 Max-5x / $200 Max-20x), billed at standard API rates, not pooled with the interactive subscription. Without usage credits enabled, programmatic requests **halt** when the credit is exhausted.
- Prompt size grows unboundedly as transaction history accumulates (the digest naively includes everything).

**How to avoid:**
- **Start AI manual** (locked decision) — defer automated jobs to Phase 5, and even then make automation opt-in.
- Keep prompts **tiny and bounded**: send pre-aggregated KPIs / a capped window of transactions, never the full table. Use **Haiku** for the daily digest (locked decision).
- Cap/scope the cron: digest runs at most daily, with a hard token budget and a guard that refuses to run if the input exceeds N tokens.
- Track spend: log token counts per run; alert if a run exceeds a threshold.
- Decide deliberately **when to stay manual** vs automate — the value of an automated daily phrase rarely justifies metered spend for a 2-person app.

**Warning signs:**
- Digest prompt token count grows month over month.
- Credit pool depletes before month-end / unexpected API charges.
- Insights stop being written (credit exhausted, requests halted).

**Phase to address:** Phase 5 (AI). Architect prompt-size discipline and the manual-first gate as Phase 5 acceptance criteria.

---

### Pitfall 10: Supabase free-tier pause from inactivity (and a keep-alive that doesn't actually count)

**What goes wrong:**
The Supabase free project **pauses after ~7 days of database inactivity**, taking the whole app offline until manually resumed. The intended mitigation — "the daily cron doubles as keep-alive" — **fails silently** if the cron only hits the *app/API* or only reads cached data: the 7-day timer is tracked against **actual database activity**, not HTTP requests or dashboard visits.

**Why it happens:**
- Free-tier pause is by design.
- A keep-alive that pings a static page or a cached endpoint never touches Postgres, so the inactivity timer keeps running. Combined with cron unreliability (Pitfall 11), several missed runs can cross the 7-day line.

**How to avoid:**
- Ensure the daily ingestion job performs a **real database query/write every run** (it does, by ingesting) — but add an explicit lightweight DB heartbeat write even on days with no new transactions, so a zero-transaction day still counts as activity.
- Because GitHub cron is unreliable (Pitfall 11), don't rely on a single daily trigger to stay under 7 days — keep margin (daily, not weekly) and alert on missed runs.
- Confirm "last DB activity" advances in the Supabase dashboard after a cron run.

**Warning signs:**
- Supabase dashboard shows project "paused" or a countdown to pause.
- App returns connection errors after a quiet week.
- "Last active" timestamp not advancing despite cron "succeeding."

**Phase to address:** Phase 1 (ingestion job design includes a guaranteed DB write). Reminder/alerting hardening in Phase 7.

---

### Pitfall 11: GitHub Actions cron is quietly unreliable — silent missed ingestion

**What goes wrong:**
Scheduled GitHub Actions are **not guaranteed to run on time or at all**: runs are commonly delayed 15–60+ minutes, can be **dropped during high load** (especially on-the-hour / midnight UTC), and scheduled workflows on **inactive repos get throttled/disabled** after ~60 days of no commits. There's **no built-in alert on failure**, so ingestion silently stops and data goes stale — feeding directly into Pitfalls 3 and 10.

**Why it happens:**
- GitHub explicitly does not guarantee cron timing and sheds scheduled load under pressure.
- A private repo with no commits for 60 days has its scheduled workflows auto-disabled.
- Failures are silent by default.

**How to avoid:**
- **Avoid on-the-hour and midnight-UTC** schedules; pick an odd off-peak minute (e.g., `17 6 * * *`).
- Add **failure alerting**: the workflow must notify (email/issue/webhook) on failure *and* a "dead-man's switch" must alert if no successful run happened in >24–48h (a missed run produces no failure event, so you need an external freshness check — ties to the Phase 1 freshness banner).
- Keep the repo from being deemed inactive (the ingestion commits/heartbeat help) or periodically re-enable.
- Make the job **idempotent and overlap-tolerant** (Pitfall 2) so a delayed/catch-up run that re-pulls an overlapping window is safe.

**Warning signs:**
- Workflow run history shows gaps or large delays.
- "Scheduled workflows disabled due to inactivity" notice from GitHub.
- Freshness banner (Pitfall 3) trips with no corresponding *failed* run.

**Phase to address:** Phase 1 (cron + idempotency + freshness/dead-man's-switch). Alerting enriched in Phase 7.

---

### Pitfall 12: Serwist service worker serving stale (outdated) financial data

**What goes wrong:**
The PWA's service worker caches dashboard data and **serves yesterday's numbers** even after the daily pull updated them. Fernanda (mobile PWA) sees a frozen €100k figure or last week's budget and trusts it. A too-aggressive precache or `CacheFirst`/`StaleWhileRevalidate` on financial API responses is the culprit; an old service worker can also stick around and never update.

**Why it happens:**
- Default PWA caching favors offline-availability over freshness; `StaleWhileRevalidate` shows stale data first, and `CacheFirst` may never revalidate.
- Service-worker update/activation lifecycle means an old worker (and its caches) can persist across deploys until tabs close.

**How to avoid:**
- Use **`NetworkFirst`** for all **financial data / API** routes so live data wins and cache is only a fallback when offline (verified as the recommended strategy for dynamic/user data and for next-data requests).
- Reserve `CacheFirst`/precache for **static assets** (JS/CSS/icons), never for account/transaction/KPI responses.
- Implement an **update flow**: skip-waiting + clients-claim or a "new version available, refresh" prompt so a deploy doesn't strand users on an old worker.
- Show the **"data as of" freshness stamp** (Pitfall 3) inside the PWA so any staleness is visible even if caching misbehaves.
- Set sensible cache expiration on runtime caches.

**Warning signs:**
- PWA shows different numbers than the desktop/live site.
- A hard refresh changes the figures (means SW served stale).
- Deploys don't take effect until the app is fully closed.

**Phase to address:** Phase 4 (PWA / Serwist).

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| App-side dedupe instead of a DB `UNIQUE(dedupe_hash)` constraint | Faster to write | Race conditions / duplicates on overlapping pulls; correctness depends on app code | Never — the constraint is cheap and is the safety net |
| Aggregating MoM/YoY with `date_trunc` + `GROUP BY` (no calendar dim) | Works on the happy path | Missing-month gaps, divide-by-zero deltas, broken comparability (the core value) | Never for shipped KPIs; OK in a throwaway spike |
| Hardcoding 90-day consent / single sign convention without confirming at setup | Less discovery work upfront | Silent data stoppage; wrong-month/wrong-sign numbers | Never — confirm the real values at Enable Banking setup (Phase 1) |
| Using `service_role` everywhere to "make it work" in dev | Bypasses RLS friction during development | Catastrophic if it leaks to client; masks broken RLS policies | Only server-side in ingestion; never in any client path |
| Including full transaction history in the Claude digest prompt | Simple prompt | Runaway metered credit cost / requests halt | Never — always pre-aggregate and cap the window |
| `CacheFirst`/`StaleWhileRevalidate` on financial API responses | Instant load, offline-friendly | Shows outdated money figures users act on | Only for static assets, never financial data |
| Skipping the "data as of" freshness stamp in MVP | One less UI element | Silent staleness from expired consent / missed cron goes unnoticed | Never — it's the cheapest defense; ship in MVP |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Enable Banking (AISP) | Assuming all 3 Revolut accounts + investment pocket are readable | Enumerate exposed accounts at setup; build €100k on the contribution leg, not an investment balance |
| Enable Banking (AISP) | Hardcoding 90-day consent and silent retry on 403 | Store the real `expires_at`; classify `re-auth-required` as a loud, visible state; reconnect via human SCA |
| Enable Banking (AISP) | Trusting bank transaction id is always present/unique | Use id when stable; fall back to a versioned composite hash; record which strategy was used |
| Supabase RLS | Enforcing the email allowlist only in app code | Enforce allowlist inside the RLS policy; add CI check that every table has RLS enabled |
| Supabase (free tier) | Keep-alive that pings the app, not the DB | Ensure every cron run performs a real DB write/heartbeat; verify "last active" advances |
| GitHub Actions cron | Trusting it to run on time, no failure alert | Off-peak odd minute; failure + dead-man's-switch alerting; idempotent overlap-tolerant job |
| Claude (`claude -p` in CI) | Treating automated runs as covered by the subscription | Separate metered credit pool since Jun 15 2026; cap prompt size, use Haiku, manual-first |
| Serwist PWA | `CacheFirst` on financial endpoints | `NetworkFirst` for data, precache only static assets; add SW update prompt |
| Next.js env | Naming the service key `NEXT_PUBLIC_SERVICE_ROLE...` | Server-only env; anon key on client; CI grep to block service_role in client bundle |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Re-pulling full transaction history each day | Slow ingestion, growing API/DB load | Pull a bounded overlapping window; rely on idempotent upsert | After ~12+ months of data accumulate |
| Computing KPIs from raw transactions on every page load | Slow dashboard, repeated heavy queries | Pre-aggregate monthly facts; index `booking_date`, `account`, `flow_type`, `cost_center` | Modest data, but felt early on mobile/PWA |
| Unbounded Claude digest prompt | Rising token cost, slower runs, credit drain | Cap window + pre-aggregate inputs | As history grows month over month |
| No index on `dedupe_hash` / period columns | Slow upserts and aggregations | `UNIQUE` index on `dedupe_hash`; btree on date/account | Grows gradually with row count |

> Note: scale is intrinsically small (2 users, 3 accounts, ~hundreds of transactions/month). The real "performance" risk is **correctness under re-pull**, not throughput. Do not over-engineer for scale.

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| `service_role` reaches the client (`NEXT_PUBLIC_` / client import) | Full read/write to all financial data | Server-only secret; anon key on client; CI bundle check |
| RLS disabled / permissive on any table | Financial data readable with anon key | RLS on every table + CI assertion; allowlist enforced in policy |
| Allowlist enforced only in app code | Bypassable access to a couple's finances | Enforce 2-email allowlist inside RLS policy |
| Secrets committed or in plaintext logs | Bank-data API and DB compromise | GitHub/Vercel encrypted secrets only; never log tokens/keys |
| Logging full transaction descriptions/amounts to CI logs | Sensitive financial data in build logs | Redact; log counts/hashes, not raw financial content |
| Over-broad Enable Banking scope/consent | More data exposed than needed | Request only the accounts/scope required for the KPIs |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| No "data as of" freshness indicator | Couple acts on silently-stale data after expiry/missed cron | Always show last-successful-pull timestamp; warn when >24–48h |
| Desktop-first screens for Fernanda | Non-technical mobile user can't use the core views | Mobile-first PWA screens (locked); the four key answers in <1 min |
| Partial current month compared to full prior months | Looks like a spending cliff / false "under budget" | Mark current month partial; compare month-to-date like-for-like |
| Showing YoY before ~12 months of data | Misleading 0%/∞ deltas | Show "insufficient history" until enough go-forward data exists |
| Surfacing internal transfers/€4k as spend in the UI | Couple thinks they overspent by €4k | Exclude `investimento`/internal transfers from spend views by construction |
| Stale PWA numbers differing from desktop | Erodes trust in the one number that must be right | `NetworkFirst` + visible freshness stamp + SW update prompt |

## "Looks Done But Isn't" Checklist

- [ ] **Ingestion idempotency:** Re-run the daily pull twice over an overlapping window — verify zero new rows and a high `ON CONFLICT` match rate (no dupes, no drops).
- [ ] **€4k handling:** Confirm the contribution increments €100k progress **exactly once** and appears in **neither** costs nor revenue.
- [ ] **Internal transfers:** Both legs flagged; neither inflates revenue/costs; bank balance delta reconciles to revenue − investment − costs.
- [ ] **Consent expiry:** `expires_at` stored from the real Enable Banking response (not hardcoded 90d); a 403/re-auth produces a visible banner, not a silent retry.
- [ ] **Exposed accounts:** Documented exactly which Revolut accounts/pockets return data; €100k built on the visible contribution leg.
- [ ] **Sign + dates:** All amounts normalized to one sign convention; all period aggregation uses `booking_date`; pending policy decided and applied.
- [ ] **Calendar dimension:** Empty months render as €0 (not missing); MoM/YoY never divide by zero; partial current month flagged.
- [ ] **RLS:** Every table has RLS enabled (CI-asserted); allowlist enforced in policy; non-allowlisted test user gets zero rows.
- [ ] **service_role:** Not present in any client bundle or `NEXT_PUBLIC_` var (CI-checked).
- [ ] **Keep-alive:** Cron performs a real DB write every run; Supabase "last active" advances even on zero-transaction days.
- [ ] **Cron reliability:** Off-peak schedule; failure alert + dead-man's-switch (>24–48h no success) wired up.
- [ ] **Claude cost:** Digest prompt is bounded/pre-aggregated, uses Haiku, manual-first; token usage logged.
- [ ] **PWA freshness:** Financial routes use `NetworkFirst`; SW update prompt exists; PWA numbers match desktop after a pull.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Duplicate transactions from unstable hash | MEDIUM | Identify dupes by (account, booking_date, amount); collapse to one; fix + version the normalization; backfill hashes; add `UNIQUE` constraint |
| €4k counted as cost / double-counted | LOW–MEDIUM | Reclassify affected rows to `flow_type=investimento`; recompute monthly facts; add a guard test |
| Consent expired, data stale | LOW (process) | Run human SCA reconnect; resume cron; backfill the gap if Enable Banking still exposes the window |
| Supabase project paused | LOW | Resume from dashboard; add guaranteed DB heartbeat write; verify keep-alive counts |
| GitHub cron silently missed runs | LOW | Re-trigger manually (idempotent); add dead-man's-switch alert; move off on-the-hour schedule |
| service_role leaked to client | HIGH | **Rotate the key immediately**; audit access logs; purge from bundle/env; add CI check |
| RLS disabled on a table | MEDIUM | Enable RLS + add policy; audit whether anon access occurred; add CI assertion |
| Claude credit drained / runaway prompt | LOW | Pause automated job; shrink/cap prompt; switch to Haiku; revert to manual |
| Stale PWA cache | LOW | Switch financial routes to `NetworkFirst`; bump SW version + skip-waiting; prompt users to refresh |
| Broken MoM/YoY (missing months) | MEDIUM | Introduce calendar dimension; re-derive aggregates via left-join; flag partial/insufficient periods |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| €4k leak / double-count | Phase 2 (+3) | Margin reconciles; €4k in goal once, in costs/revenue zero |
| dedupe_hash instability | Phase 1 | Double re-pull → no dupes/drops; high `ON CONFLICT` rate |
| 90-day consent expiry surprise | Phase 1 (detect) / 7 (remind) | 403 → visible banner; `expires_at` is real, not hardcoded |
| Investment pocket not exposed | Phase 1 (+6) | Documented list of exposed accounts; €100k on contribution leg |
| Sign / pending / booking-vs-value-date | Phase 1 (+2) | One sign convention; period uses `booking_date`; pending policy applied |
| No calendar dimension (MoM/YoY) | Phase 2 | Empty months = €0; no divide-by-zero; partial month flagged |
| RLS misconfig (leak/lockout) | Phase 0 (+ each new table) | CI: all tables RLS-on; non-allowlisted user → 0 rows |
| service_role on client | Phase 0 (+1) | CI grep: no service_role in client bundle / `NEXT_PUBLIC_` |
| Claude metered-credit blowout | Phase 5 | Bounded prompt, Haiku, manual-first; token usage logged |
| Supabase free-tier pause | Phase 1 (+7) | "Last active" advances on zero-transaction days |
| GitHub cron unreliability | Phase 1 (+7) | Off-peak schedule; failure + dead-man's-switch alerts fire |
| Serwist stale data | Phase 4 | Financial routes `NetworkFirst`; PWA == desktop after pull |

## Sources

- Enable Banking Docs — FAQ (restricted production / "activate by linking accounts" own-account access): https://enablebanking.com/docs/faq/
- Enable Banking Docs — API reference & SDK (consent expiry / `re-auth-required` 403): https://enablebanking.com/docs/api/reference/ , https://enablebanking.com/docs/core/0.5/
- Revolut Open Banking Docs — AIS consent / refresh-token validity (180-day EU window, reauthorize on expiry): https://developer.revolut.com/docs/open-banking/open-banking-api
- EBA / TrueLayer / Yapily — PSD2 SCA reauthentication (EU up to 180 days vs UK 90 days, account-specific): https://truelayer.com/blog/compliance-and-regulation/explaining-changes-to-the-90-day-rule-for-open-banking-access/ , https://www.yapily.com/blog/90-day-reauthentication-changes
- Supabase free-tier pause behavior (7-day **database** inactivity; keep-alive must query DB) + GitHub Actions keep-alive pattern: https://github.com/travisvn/supabase-pause-prevention , https://supabase.com/docs/guides/troubleshooting/pausing-pro-projects-vNL-2a , https://dev.to/jps27cse/how-to-prevent-your-supabase-project-database-from-being-paused-using-github-actions-3hel
- GitHub Actions scheduled-workflow unreliability (delays, drops under load, inactive-repo throttling, no built-in alerting): https://github.com/orgs/community/discussions/156282 , https://dev.to/krissv/monitoring-github-actions-scheduled-workflows-a-practical-guide-31h7
- Serwist runtime caching — `NetworkFirst` for dynamic/financial data, stale-cache pitfalls: https://serwist.pages.dev/docs/serwist/runtime-caching/caching-strategies/network-first , https://github.com/vercel/next.js/discussions/52024
- Claude Code billing change (Jun 15 2026): `claude -p` / Agent SDK / GitHub Actions draw a separate metered credit pool at API rates, halt when exhausted: https://tygartmedia.com/claude-code-billing-credit-pool-2026/ , https://the-decoder.com/claude-subscriptions-get-separate-budgets-for-programmatic-use-billed-at-full-api-prices/ , https://github.com/anthropics/claude-code/issues/37686
- PROJECT.md (locked decisions: `flow_type=investimento`, dedupe key, RLS allowlist, manual-first AI, keep-alive cron, EUR-only MVP)

---
*Pitfalls research for: personal-finance BI on PSD2/AISP + Supabase + Next.js + GitHub Actions + Claude + Serwist PWA*
*Researched: 2026-06-21*
