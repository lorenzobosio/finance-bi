---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
current_phase: 1
current_phase_name: ingestion-enable-banking
status: executing
stopped_at: "Wave 4 complete — classify-on-ingest pipeline (normalize/dedupe/rules + idempotent ingest cron); all Wave-0 tests GREEN (60). Next: Wave 5 (01-05 cron schedule + freshness/reconnect banners) — the FINAL Phase-1 wave"
last_updated: "2026-06-22T15:51:29.015Z"
last_activity: 2026-06-22
last_activity_desc: 01-04 classify-on-ingest pipeline (normalize/dedupe/rules + ingest.ts); 60 tests green, all quarantines re-armed
progress:
  total_phases: 8
  completed_phases: 1
  total_plans: 10
  completed_plans: 9
  percent: 90
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-21)

**Core value:** Show, at a glance and with trustworthy automatic data, exactly how far the couple is from €100k invested — and whether this month's money behaved like a healthy business.
**Current focus:** Phase 1 — ingestion-enable-banking

## Current Position

Phase: 1 (ingestion-enable-banking) — EXECUTING
Plan: 4 of 5 complete (Waves 1-4 done)
Status: Wave 4 complete — classify-on-ingest pipeline done; 60 tests green. Wave 5 (01-05 cron + banners) — the FINAL Phase-1 wave — next.
Last activity: 2026-06-22 — 01-04 normalize/dedupe/rules + idempotent ingest.ts; all 5 quarantined suites re-armed GREEN

Progress: [█████████░] 90%

### Phase 1 progress

- **01-01 (Wave 1) — COMPLETE.** Wave-0 TDD harness (7 RED suites; 6 quarantined in `vitest.config.ts` exclude until their modules land — re-arm per plan) + discovery spike: both Revolut consents run live; A2/A3/A4/A5/A6 resolved (investing NOT exposed → virtual is_investment; 180-day window; counterparty IBANs present; only entry_reference; no PEND). SUMMARY + PII-scrubbed fixtures committed (PR #12).
- **01-02 (Wave 2) — COMPLETE.** Ingestion columns on accounts/transactions/connections; `cost_center` enum → extensible `cost_centers` lookup (D-24, FK); `import_batches` (RLS). `0003`+`0004` applied to the LIVE Supabase DB; `test:rls` green (16 tables, 4 cost-center codes seeded). On branch `phase-01-wave2-schema` → PR.
- **01-03 (Wave 3) — COMPLETE.** EB RS256 signer + zod-validated client (ConsentExpiredError) + `eb:connect` that persists the live consent. Ran live for both logins → 2 connections, 4 accounts (lorenzo/compartilhado/fernanda + 1 virtual), 2 heartbeats. Live-run fixes: postgres-driver writer (not supabase-js), DBIT/PDNG (not DBDT/PEND), virtual idempotency, joint→compartilhado, PII masking. PR #14.
- **01-04 (Wave 4) — COMPLETE.** normalize (sign from DBIT, keep only BOOK) + dedupe (versioned sha256; bank_id/composite) + rules (investimento/transferencia/revenue/sublocacao/cost; €4k counted once) + headless `scripts/ingest.ts` (idempotent ON CONFLICT dedupe_hash, heartbeat in finally, 403→expired+exit0, postgres-driver writer). All 5 quarantined suites re-armed → 60 tests green. PR #15.
- **Next: 01-05 (Wave 5, FINAL)** — the daily ingestion cron (`.github/workflows/ingest.yml`) + the freshness ("data as of …") and reconnect banners (read `connections.consent_status`/`last_pull_at` + `import_batches`). Closes Phase 1.

## Performance Metrics

**Velocity:**

- Total plans completed: 0
- Average duration: — min
- Total execution time: 0.0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

**Recent Trend:**

- Last 5 plans: —
- Trend: —

*Updated after each plan completion*
| Phase 00 P02 | 7min | 3 tasks | 11 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Stack]: Tremor Raw (copy-paste, Tailwind v4 + Recharts) instead of the frozen `@tremor/react` npm package — research-confirmed deviation; resolve in Phase 0
- [Phase 1]: First task is a discovery spike enumerating which Revolut accounts/pockets Enable Banking exposes + the real consent-window duration; gates Phase 3 and Phase 6 design
- [Correctness]: `flow_type=investimento`/`transferência` excluded from all cost/revenue aggregations; €4k fed to goal exactly once — a Phase 1/2 contract, not retrofittable
- [Phase 0]: Phase-0 hardening (00-05): allowlist moved from hardcoded RLS emails to env-seeded app_allowlist table + SECURITY DEFINER is_email_allowed(); no email literal in any committed file (public-repo safe)
- [Phase 0]: members.email made nullable; members seeded by display name only (PII removed)

### Pending Todos

[From .planning/todos/pending/ — ideas captured during sessions]

None yet.

### Blockers/Concerns

[Issues that affect future work]

- Enable Banking live behavior is unverified: which Revolut accounts/pockets appear, exact `expires_at` format/range, pending→booked lifecycle, 429 limits. Must be confirmed in the Phase 1 discovery spike before finalizing the Phase 1 plan.
- Investment pocket likely NOT exposed via PSD2 — build the €100k goal on the outgoing €4k contribution leg (cost basis), not an investment balance.

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| *(none)* | | | |

## Session Continuity

Last session: 2026-06-22T01:15:16.049Z
Stopped at: Phase 1 UI-SPEC written (checker deferred — API 529)
Resume file: .planning/phases/01-ingestion-enable-banking/01-UI-SPEC.md
