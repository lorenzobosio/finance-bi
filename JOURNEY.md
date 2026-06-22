# The Build Journal — Finance BI

A running, plain-English journal of how this app gets built, phase by phase. It's meant to
be read later like a story: what we set out to do, what actually happened (including the
plot twists), and what we learned. Newest **Key Learnings** are pinned near the top so they
carry into every later stage.

**What this app is:** a personal business-intelligence dashboard for a couple in Berlin who
run their household finances *like a business* — salaries are revenue, expenses are cost
centers per person, and a fixed €4,000/month is invested toward a gamified €100,000 goal.
Bank data arrives automatically once a day via open banking. Built with Next.js + Supabase,
deployed on Vercel, planned and executed with the GSD workflow.

---

## ⭐ Key Learnings (carry forward — read before each new phase)

These are the durable lessons. They should shape how every later phase is built.

1. **Don't trust `process.env` for config inside Next.js Edge middleware.** A `process.env`
   read in middleware was empty in production and locked out *legitimate* users. The fix
   that stuck: make the **database the single source of truth** — the allowlist lives in an
   `app_allowlist` table and the middleware checks it via the `is_email_allowed()` RPC. The
   same table also drives RLS, so auth and data access can never drift apart.
2. **Keep secrets *and* PII out of source AND git history.** `.env.local` is git-ignored;
   the email allowlist is seeded into the DB from an env var at deploy time (never committed).
   Before going public we rewrote git history to purge emails, and a **source-cleanliness
   test fails CI** if any forbidden literal ever reappears. Decide public-vs-private *before*
   the first push when you can.
3. **Security gates are real gates.** Vercel refused to deploy a vulnerable Next.js version —
   which matters double here because the Next.js CVEs target *middleware*, our auth layer.
   Keep Next patched; treat "vulnerable version" build failures as a feature, not a nuisance.
4. **The "fixed" stack still drifts.** shadcn dropped the exact style/base-color flags we
   planned for; Supabase issues new-style `sb_publishable_`/`sb_secret_` keys (mapping to the
   old anon/service_role slots). Verify versions/CLIs at build time, not from memory.
5. **Fail closed, then verify live.** Auth, RLS, and the `service_role` boundary were each
   proven against the *real* deployment (e.g. grepping the served JS bundle to confirm the
   secret key never reaches the browser), not just "the build passed."
6. **Pin the majors you deliberately chose.** We pin Next to 15 for MVP stability; Dependabot
   is configured to ignore those majors while still sending patches + security fixes.

---

## Chapter 0 — Foundation (June 2026)

**Goal:** a secure, deployed shell — Google login locked to two emails, row-level security on
every table, the database schema, and a clean deploy — so everything built later lands behind
auth and is comparable month-to-month.

**The plan.** Started from a detailed spec and let GSD research the domain, define 40
requirements, and lay out a 7-phase roadmap. Phase 0 was sliced into four waves: scaffold →
schema + RLS → auth gate → security lockdown + deploy.

**The build.**
- **Scaffold (Wave 1):** Next.js 15 + Tailwind v4 + shadcn/ui + Tremor Raw charting (deliberately
  *not* the frozen `@tremor/react`), with a Vitest test harness written test-first.
- **Database (Wave 2):** the full v1 schema — 12 tables + a calendar dimension (2024–2035) —
  defined in Drizzle, with **row-level security on every table** and seed data, then migrated
  to the live Supabase database and verified there (an allowlisted identity sees rows; anyone
  else sees zero).
- **Auth gate (Wave 3):** Google sign-in via Supabase, middleware that validates the session
  and enforces the allowlist, and a protected page that does a real RLS-bound read. Confirmed
  end-to-end in the browser.
- **Lockdown + deploy (Wave 4):** the `service_role` secret isolated behind a server-only
  module with a three-layer guard (server-only import + ESLint rule + a CI job that greps the
  built client bundle), then deployed to Vercel.

**The plot twists** (where the real learning happened):
- **Provisioning hand-offs.** Supabase, Google OAuth, and Vercel can't be created by an agent —
  those were guided, click-by-click, with credentials kept only in `.env.local`.
- **Going public, safely.** We decided the repo should be a public portfolio piece — but
  without leaking the couple's emails. That meant moving the allowlist into a DB table seeded
  from env, scrubbing emails from every file, **rewriting git history** to purge them, then
  flipping to public with Dependabot + CodeQL + branch protection.
- **The Next.js vulnerability.** The first Vercel deploy *failed* — not a build error, a
  security gate blocking a vulnerable Next.js. Patched 15.5.4 → 15.5.19 and shipped.
- **The lockout bug.** After deploy, a legitimate email was being denied. The cause: the
  middleware's `process.env.ALLOWED_EMAILS` was unreliable in Vercel's Edge runtime. The fix
  (Learning #1) was to read the allowlist from the database instead — which is also better
  architecture, since RLS already used the same source of truth.

**Outcome:** all six foundation requirements verified (including live, in production). The app
is deployed, secure, and tested, with a clean public repo. A real, working foundation. ✅

---

*This journal is updated at the end of each phase. Next: Chapter 1 — Ingestion (open banking).*
