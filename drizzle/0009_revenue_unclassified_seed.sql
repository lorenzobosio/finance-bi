-- 0009_revenue_unclassified_seed — seed the `revenue_unclassified` builtin rule as a REAL
-- `rules` row with its deterministic literal uuid (DSN-06b / D3-12), mirroring 0005.
--
-- WHY: engine.ts now classifies an UNMATCHED positive non-salary inflow as `revenue` with
-- ruleId `revenue_unclassified` (the negative-cost-margin fix). The cron stamps the matching
-- BUILTIN_RULE_IDS uuid (66666666-6666-6666-6666-666666660007 — builtins.ts) onto each such
-- transaction's `rule_id`; that uuid must FK-resolve to a real `rules` row or the write fails.
-- This seed creates that row so `rule_id` resolves (never NULL — D2-04), exactly as 0005 did
-- for the original 6 builtins.
--
-- The `6666…` namespace + trailing ordinal mirror 0005 (6666 = rules; 0007 = the next free
-- ordinal, NOT its priority). `priority` is 35 — between revenue (30) and sublocacao_revenue
-- (40) — so a future DB-rule load mirrors the in-code cascade placement (the catch sits after
-- the salary/sublet revenue checks and before the cost default). `version` is 2 = the bumped
-- RULESET_VERSION. `match_criteria` stays NULL: the matcher lives in code (engine.ts); this
-- row exists purely so `rule_id` resolves for auditability. `set_flow_type` is `revenue`;
-- `set_category`/`set_cost_center` are NULL (the engine uses the account's base cost center).
--
-- GO-FORWARD ONLY (CAT-05): this is a pure INSERT. Existing transactions are NOT re-classified
-- — re-apply is an explicit user action; history is never silently rewritten.
--
-- Idempotent: `on conflict (id) do nothing` (the 0002/0005 seed convention) makes re-runs safe.

INSERT INTO "rules" ("id","priority","version","match_criteria","set_category","set_cost_center","set_flow_type") VALUES
  ('66666666-6666-6666-6666-666666660007', 35, 2, null, null, null, 'revenue')
ON CONFLICT ("id") DO NOTHING;
