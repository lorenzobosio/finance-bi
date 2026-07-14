# Claude Code Routine setup — the subscription-pooled AI insight generator (AI-01/02, D-01/03)

This is the **owner runbook** for the two out-of-git actions that finish Phase 06-07. The code
(the `gen-insight` command + `scripts/insight-snapshot.ts` + `scripts/write-insight.ts` + the authored
demo insights) is already committed. Two manual steps remain — they live in Anthropic's cloud and the
live DB, **not** in git. Do them in order.

> **The one hard rule (D-01, denial-of-wallet):** the routine's cloud environment must carry **NO**
> `ANTHROPIC_API_KEY` and **NO** `ANTHROPIC_AUTH_TOKEN`. Either credential silently flips the session
> onto **metered API billing**. This whole feature must stay 100% **Claude Pro Max subscription**
> usage. A telltale sign a key is set: `/schedule` reports "No commands match".

---

## Step A — Reseed the live demo (so the authored voice renders on the public deploy)

The Task-2 authored insights (a `weekly_report`, a `whats_changed`, and a non-shame `overspend`
note) only appear on the public demo once you reseed the live DB.

```bash
set -a; . ./.env.local; set +a      # load the write-plane DATABASE_URL
pnpm db:seed:demo                    # idempotent: DELETEs is_demo=true rows, re-INSERTs (incl. the 3 insights)
pnpm test:rls:demo                   # the insights demo-visible direction stays green; no real row leaks
```

Then open the **public demo deploy** (no login) and confirm the AI Voice Card (06-06) renders one of
the authored insights with its date — the demo voice is alive with **zero** model call (AI-05).

---

## Step B — Register the subscription-pooled Claude Code Routine (AI-01/02)

The routine runs the committed `gen-insight` command on a cloud schedule (laptop-off), drawing Pro Max
**subscription** usage. Create it via the `/schedule` CLI (available in a Claude Code session) or at
`claude.ai/code/routines`.

### B1 — Create the routine
- Point it at **this repo** and the `gen-insight` command.
- **Setup script:** `pnpm install`.
- **Two Schedule triggers** (minimum interval is 1 hour, so weekly/monthly are fine):
  - **Weekly** → runs `gen-insight` with kind **`weekly_report`** (the weekly at-a-glance memo).
  - **Monthly (on rollover)** → runs `gen-insight` with kind **`whats_changed`** (the MoM note).

Both cadences sit far under the Max cap (15 routine runs/day).

### B2 — Configure the routine's cloud environment
1. Add **`DATABASE_URL`** as an **environment secret** (the read+write plane for both scripts). Read
   its value from your local `.env.local`.
2. Set **network access = Custom** and **allowlist the Supabase DB/pooler host** — read the host off
   `DATABASE_URL` (the part after `@`, before `:`/`/`). The Default "Trusted" allowlist blocks it,
   producing `403 host_not_allowed`.
3. **Confirm there is NO `ANTHROPIC_API_KEY` and NO `ANTHROPIC_AUTH_TOKEN`** in the routine
   environment (or your local shell). This is the D-01 footgun — see the box at the top.

### B3 — Run once and verify
- Trigger the routine once.
- Confirm a new **`is_demo=false`** row appears in `insights` (the real weekly memo).
- Confirm **NO metered credits** were drawn — subscription usage only (no Anthropic API key present).

---

## Local fallback (subscription-pooled, laptop-on)

If the cloud routine is ever unavailable, the **exact same** committed command runs locally with zero
change, on the same Pro Max subscription budget:

```bash
set -a; . ./.env.local; set +a
# In a Claude Code session:
/gen-insight weekly_report
# or on an interval:
/loop weekly /gen-insight weekly_report
```

Because the command and both scripts are committed and self-contained, swapping the scheduling surface
(cloud routine ⇄ local `/loop`) requires no code change.

---

## Definition of done

- The demo is reseeded; the authored voice renders on the public no-login deploy; `pnpm test:rls:demo`
  is no-leak green.
- The routine is registered (weekly `weekly_report` + monthly `whats_changed`), ran once producing a
  real `is_demo=false` insights row, with **no metered credits** drawn and **no** Anthropic API-key /
  auth-token credential in the routine env (D-01).
