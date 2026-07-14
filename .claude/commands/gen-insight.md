---
name: gen-insight
description: Generate one CFO-memo insight from the PII-safe aggregates snapshot and persist it to the insights table (subscription-pooled, no metered credits)
argument-hint: "<kind: weekly_report | whats_changed>"
allowed-tools:
  - Bash
---

# gen-insight — the one reusable subscription-pooled generation command (AI-01/02, D-02)

Generate ONE narrative insight in the household's warm, true, non-shame **CFO-memo** voice and
persist it to the `insights` table. This command is the D-02 single reusable generator: it runs
**byte-identically** from the cloud Claude Code Routine (primary, laptop-off) or a local `/loop`
(fallback) — both draw the **Claude Pro Max subscription** token budget, never metered API credits.

**Argument:** `$ARGUMENTS` = the insight `kind`, one of:
- `weekly_report` — the weekly at-a-glance verdict (the lead voice on Home).
- `whats_changed` — the monthly month-over-month note (run on month rollover).

If no kind is passed, default to `weekly_report`.

---

## The three steps (run in order)

### Step 1 — Read the PII-safe aggregates snapshot (AI-04 firewall)

Run the committed reader and read ONLY its bounded JSON:

```bash
set -a; . ./.env.local; set +a   # local fallback only; the cloud routine injects DATABASE_URL as a secret
pnpm tsx scripts/insight-snapshot.ts
```

It prints a single bounded JSON object — `{ period, kpis, pnl, goal, scorecard, anomalies }` —
built from the pre-aggregated marts (`v_home_kpis`, `v_pnl_monthly`, `v_costcenter_bva`,
`v_category_breakdown`, `v_bucket_spend`) plus the household launch date. **This JSON is the ONLY
input you may use.** NEVER ask for, query, or reason about the raw `transactions` table — the raw
row grain (counterparty, IBAN, description, booking date) is structurally outside this wall (AI-04).

### Step 2 — Write the CFO-memo prose

Write **2–4 sentences** in the owner's warm, true, non-shame CFO tone. Rules:

- **Voice:** a trusted CFO briefing a couple who run their home like a business. Calm, specific,
  encouraging — never alarming, never a scoreboard. Celebrate the €4k-before-anything-else habit and
  progress toward €100k invested.
- **Only narrate the snapshot.** Every figure must come from the JSON (`kpis`, `goal.pctTo100k`,
  `scorecard`, `anomalies`). Never invent a number.
- **`whats_changed` specifics:** narrate the month-over-month deltas over `pnl.current` vs
  `pnl.previous` (revenue, costs, margin, the investimento contribution) and the top movers. If the
  snapshot shows fewer than 2 non-empty months (`pnl.previous` is null), do NOT fabricate a
  comparison — say the monthly comparison becomes available next month (D-04/D-05).
- **Anomalies (D-10):** rank and phrase at most the top 1–2 flags from `anomalies` (already ordered
  worst-first by the deterministic detector). You only PHRASE them — you never decide *whether* a
  budget is blown; the detector already did. Frame any overspend as a non-shame nudge.
- **PII:** the prose must contain no email, no IBAN, and no real-owner name — the snapshot carries
  none, so keep it that way.

### Step 3 — Persist the insight

Run the committed writer with your prose:

```bash
pnpm tsx scripts/write-insight.ts --kind "$ARGUMENTS" --body "<your 2-4 sentence memo>"
```

It inserts one `is_demo=false` row into `insights` via the `DATABASE_URL`/`postgres` write plane
(never `service_role`, never in the app bundle) and logs counts only. Done.

---

## Operator setup this command depends on (subscription-only — the D-01 footgun)

This command is intended to run as a **subscription-pooled Claude Code Routine** in Anthropic's
cloud (weekly `weekly_report` + monthly `whats_changed`, laptop-off). Its cloud environment MUST be
configured as follows (this config lives in Anthropic's cloud, NOT git):

1. **`DATABASE_URL` as an environment secret** — the read+write plane for both scripts.
2. **Network access = Custom, with the Supabase DB/pooler host allowlisted** — read the host off
   `DATABASE_URL`. The Default "Trusted" allowlist blocks it (→ `403 host_not_allowed`).
3. **NO `ANTHROPIC_API_KEY` and NO `ANTHROPIC_AUTH_TOKEN` anywhere** in the routine's cloud
   environment (or the local shell). Either credential silently takes precedence and flips the
   session onto **metered API billing** — the D-01 denial-of-wallet footgun. A telltale sign is
   `/schedule` reporting "No commands match" when a key is set. This phase must stay 100%
   subscription-pooled: no `@anthropic-ai` dependency, no API key, ever.

Because the command + both scripts are committed and self-contained, swapping the scheduling surface
(cloud routine ⇄ local `/loop`) requires zero change to this command.
