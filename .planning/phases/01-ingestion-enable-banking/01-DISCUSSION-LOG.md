# Phase 1: Ingestion (Enable Banking) - Discussion Log

> **Audit trail only.** Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-22
**Phase:** 1-Ingestion (Enable Banking)
**Areas discussed:** €4k detection / investment flow, Connecting the bank, Cron + pull strategy, Freshness & reconnect UX

> The user selected all four gray areas and answered them together in one comprehensive decision set.

---

## €4k detection / investment flow

| Option presented | Selected |
|------------------|----------|
| Rule matching the transfer to the investing account (by destination) | ✓ (refined) |
| Amount + account match (~€4000) | |
| Manual monthly confirmation | |
| Gate on what the discovery spike finds exposed | ✓ (spike confirms investing-account exposure) |

**User's choice:** Investing is a separate Revolut account (mark with `is_investment`). Any transfer **into** the investing account → `flow_type=investimento` (source- and amount-agnostic). Cash↔cash transfers → `transferência` (not counted). €4k is a **monthly aggregate** (rollup ≥ €4000 for the streak), replacing per-transaction `is_planned_4k`. "Total invested" = cumulative contributions (cost basis); market value deferred to Phase 6.

---

## Connecting the bank

**User's choice:** One-time browser consent via a local `pnpm eb:connect` script (no in-app admin page in MVP). Single consent covers the 3 cash accounts (+ investing account if exposed). App ID + RS256 private key + session in GitHub Secrets / `.env.local`; private key never committed. Store `consent_status` + `expires_at` in `connections`; re-run `eb:connect` on expiry; spike confirms real window.

---

## Cron + pull strategy

**User's choice:** Daily GitHub Actions cron ~06:00 Europe/Berlin, once/day (~4 calls/account/day). Incremental transactions since last successful pull + a per-account balances snapshot; idempotent upsert via `dedupe_hash`. Keep-alive heartbeat write each run (logged in `import_batches`). Failed/empty runs record status (no silent crash); forward-only, no backfill; active alerts deferred to Phase 7.

---

## Freshness & reconnect UX

**User's choice:** Global "data as of {date}" staleness banner; passive in-app reconnect-needed banner on consent expiry/403 (not blocking). Push/email alerts are Phase 7.

## Claude's Discretion

- Exact `dedupe_hash` normalization (per research); freshness banner placement; Enable Banking endpoint/auth specifics → research.
- Schema additions (is_investment, enable_banking_id, description_raw, counterparty, consent_status, last_pull_at, import_batches table) flagged for the planner to add via migration.

## Deferred Ideas

- Rules engine + transferência pairing + default cost-center → Phase 2; in-app connection page → not MVP; active alerts → Phase 7; ETF market value → Phase 6; backfill → never.
