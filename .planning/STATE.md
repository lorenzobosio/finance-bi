---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
current_phase: 1
current_phase_name: ingestion-enable-banking
status: executing
stopped_at: "01-01 connect tooling built + pushed (callback page + pnpm eb:connect); awaiting the human-action live SCA run to populate 01-SPIKE.md (ING-01)"
last_updated: "2026-06-22T09:40:00.000Z"
last_activity: 2026-06-22
last_activity_desc: "01-01 Task 2 tooling built: /eb/callback page (9a97638) + pnpm eb:connect script + spike scaffolding (af8920b), pushed; SUMMARY withheld until the live run fills 01-SPIKE.md"
progress:
  total_phases: 8
  completed_phases: 1
  total_plans: 9
  completed_plans: 5
  percent: 13
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-21)

**Core value:** Show, at a glance and with trustworthy automatic data, exactly how far the couple is from €100k invested — and whether this month's money behaved like a healthy business.
**Current focus:** Phase 1 — ingestion-enable-banking

## Current Position

Phase: 1 (ingestion-enable-banking) — EXECUTING
Plan: 1 of 5
Status: 01-01 connect tooling built + pushed; awaiting the human-action live SCA run
Last activity: 2026-06-22 — /eb/callback page + pnpm eb:connect built, deps installed, pushed to deploy

Progress: [░░░░░░░░░░] 0%

### 01-01 progress
- Task 1 (Wave-0 RED test scaffolds) — DONE, commit 239231d. All 7 test files fail RED at import-resolution (modules built in 01-03/01-04).
- Checkpoint (provision Enable Banking app + RSA key + redirect_url) — RESOLVED. EB provisioned; .env.local has ENABLE_BANKING_APP_ID / ENABLE_BANKING_PRIVATE_KEY_PATH (eb-private-key.pem, gitignored) / ENABLE_BANKING_REDIRECT_URL (deployed /eb/callback, D-07).
- Task 2 connect tooling — BUILT + PUSHED. /eb/callback page + PUBLIC_PATHS (9a97638); scripts/eb-connect.ts (pnpm eb:connect) + jose/tsx + scrubbed fixtures + 01-SPIKE.md skeleton (af8920b). pnpm lint + build green; Wave-0 tests stay RED for 01-03/04 targets (expected). Smoke: JWT signs OK; /aspsps 403 "Application is not active" (expected for the Inactive app — key + App ID wired).
- Task 2 LIVE SCA — AWAITING HUMAN. Run `pnpm eb:connect` ONCE PER PERSON (Lorenzo, then Fernanda) after the Vercel deploy: open the auth URL, approve at Revolut, paste the code from /eb/callback. That run populates 01-SPIKE.md (A2 investing-account exposure, A5 valid_until, A6 IBANs, A3 id stability, A4 PEND). SUMMARY is withheld until 01-SPIKE.md is real — must NOT be fabricated.

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
