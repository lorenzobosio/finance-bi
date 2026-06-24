-- 0011_demo_rls — the ADDITIVE anon read policy that opens the public demo surface (D4-13).
--
-- This is the FIRST migration in the project to grant the logged-out `anon` role any row
-- visibility. It mirrors the project's DDL-vs-RLS split convention (0007 view DDL / 0008 view
-- RLS; here 0010 column+mart DDL / 0011 anon RLS) and is applied in the SAME `pnpm db:migrate`
-- run as 0010.
--
-- ONE select-only policy per demo-bearing table (named below), each with the predicate
-- `using ( is_demo = true )`. The existing `allowlist_all for all to authenticated` policies
-- from 0001 are UNTOUCHED (a different role path — the two policies never interact). The grant
-- `grant select … to anon` already exists (0001_rls_policies.sql:39), so this policy is the
-- ONLY missing piece that turns "anon sees zero rows" into "anon sees ONLY is_demo=true rows."
--
-- CRITICAL — THE R-A / Threat-1 LEAK GUARD: the predicate MUST be exactly the is_demo=true
-- comparison shown on every policy below. An UNCONDITIONAL always-true predicate would publish
-- EVERY real transaction, balance and budget to the public internet — a catastrophic permanent
-- leak in a public CV repo. The Wave-0 RED gate (test/rls.demo.assert.mjs) proves anon sees 0
-- real rows in BOTH directions, and the source gate negative-greps for that always-true typo
-- on this file and must find ZERO occurrences. Never relax it.
--
-- SELECT-ONLY: there is NO anon insert/update/delete policy on any table — anon can read the
-- bounded is_demo=true partition and write NOTHING. The 0001 table-level
-- `grant … insert,update,delete … to anon` is harmless because RLS blocks every anon write
-- (no anon write policy exists) — this migration does not weaken that.
--
-- VIEWS NEED NO POLICY: the v_* marts are `security_invoker = on` (0008), so an anon
-- `select v_*` runs as the anon role and these underlying-table policies apply transitively —
-- no per-view policy is written.
--
-- TABLES (8): the 7 demo-bearing fact/config tables a mart or the Goal page reads, PLUS
-- `connections` — the onboarding-signal table the public demo's getOnboardingState probes
-- (D4-13). connections gains is_demo via the seed path; the anon policy bounds it to demo rows
-- like the rest.
--
-- NO PII, NO email literal — static RLS DDL only (T-04-R-D).

-- transactions
create policy "demo_anon_read" on public.transactions
  for select to anon using ( is_demo = true );
--> statement-breakpoint

-- balances
create policy "demo_anon_read" on public.balances
  for select to anon using ( is_demo = true );
--> statement-breakpoint

-- budgets
create policy "demo_anon_read" on public.budgets
  for select to anon using ( is_demo = true );
--> statement-breakpoint

-- goals
create policy "demo_anon_read" on public.goals
  for select to anon using ( is_demo = true );
--> statement-breakpoint

-- milestones
create policy "demo_anon_read" on public.milestones
  for select to anon using ( is_demo = true );
--> statement-breakpoint

-- investment_contributions
create policy "demo_anon_read" on public.investment_contributions
  for select to anon using ( is_demo = true );
--> statement-breakpoint

-- insights
create policy "demo_anon_read" on public.insights
  for select to anon using ( is_demo = true );
--> statement-breakpoint

-- connections (onboarding-signal table — D4-13)
create policy "demo_anon_read" on public.connections
  for select to anon using ( is_demo = true );
--> statement-breakpoint
