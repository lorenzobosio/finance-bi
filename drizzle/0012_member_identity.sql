-- 0012_member_identity — the members identity columns for PERS-01/02 (D4-23). DDL ONLY.
--
-- Adds the two new members columns in ONE ALTER (Eval-08 R3):
--   * auth_email text   — the authenticated Google email → member mapping resolveMember() reads
--     (separate from the Phase-0 `email` column, which stays NULL/unused this phase). UNIQUE so
--     two members can never claim the same login (a duplicate would corrupt the identity
--     resolver — eval-14 R3).
--   * onboarding_dismissed_at timestamptz — the household-scoped, server-readable dismissal
--     flag for the non-blocking onboarding checklist (D4-21; NOT a device cookie, so it stays
--     consistent across Lorenzo's desktop and Fernanda's phone).
--
-- DDL ONLY — ZERO email literals. Population is the SEPARATE env-seeded operator script
-- scripts/seed-member-emails.mjs (reads MEMBER_EMAIL_MAP, counts-only logging) run in a later
-- wave. A migration with `update members set auth_email = 'real@…'` would be a permanent leak
-- in a public CV repo (T-04-R-D / Phase-0 PII discipline) — never do it here.
--
-- RLS: inherited from the existing row-level `allowlist_all for all to authenticated` policy on
-- members (0001) — that policy is column-transparent, so the new columns need no new policy.
-- members is NOT a demo-bearing table (no is_demo, no anon policy): identity is owner-only.
--
-- NO PII, NO email literal — static DDL only.

-- Both new columns in one ALTER (Eval-08 R3).
alter table public.members
  add column auth_email text,
  add column onboarding_dismissed_at timestamptz;
--> statement-breakpoint

-- UNIQUE on auth_email so one login maps to at most one member (eval-14 R3).
alter table public.members
  add constraint members_auth_email_unique unique (auth_email);
--> statement-breakpoint
