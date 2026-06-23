-- 0005_builtin_rules_seed — seed the 6 builtin classification rules as REAL `rules` rows
-- with deterministic literal uuids (D2-04), and reconcile the cost-center code drift.
--
-- WHY (D2-04 — the audit fix): the engine returns a builtin `RuleId` string, but the cron
-- historically wrote `rule_id = NULL` (scripts/ingest.ts), so a classified transaction could
-- NOT be traced back to the rule that stamped it. Seeding each builtin as a fixed-uuid `rules`
-- row (the BUILTIN_RULE_IDS map in src/lib/ingestion/rules/builtins.ts mirrors these exact
-- literals) lets the writer stamp a real, FK-resolvable `rules.id` — never NULL.
--
-- The `6666…` namespace mirrors the 0002 seed's per-table literal prefixes (1111 categories,
-- 2222 child categories, 3333 goals, 4444 milestones, 5555 members) — 6666 = rules. The
-- trailing ordinal (0001…0006) follows the engine's first-match priority order. `priority`
-- ascends in that same order so a future DB-rule load mirrors the builtin cascade.
--
-- COST-CENTER DRIFT (RESEARCH Pitfall 1): the engine's default cost center resolves to an
-- account's `default_cost_center`. The FROZEN engine contract (test/rules.test.ts) exercises a
-- SHARED account whose default is the bare code `shared` and asserts the engine emits `shared`.
-- The 0003 lookup seeded `compartilhado` (and translated legacy `shared` -> `compartilhado`),
-- so the engine's `shared` had no FK target — an orphan. We reconcile by ADDING a `shared`
-- ALIAS ROW to cost_centers so every code the engine can emit is a SUBSET of cost_centers.code,
-- WITHOUT editing the frozen test. `compartilhado` remains the canonical live default.
--
-- NO PII, NO € amounts, NO real tenant/merchant names — sublet calibration (D2-05) happens
-- later against live data via the in-app rule editor (T-02-03). The seeded `match_criteria`
-- here is left NULL: the builtin matchers live in code (builtins.ts); these rows exist purely
-- so `rule_id` resolves to a real row for auditability.
--
-- Idempotent: `on conflict (id) do nothing` (the 0002 seed convention) makes re-runs safe.

-- cost-center drift fix: add the `shared` alias so the engine's emitted codes FK-resolve.
INSERT INTO "cost_centers" ("code","label") VALUES
  ('shared','Shared')
ON CONFLICT ("code") DO NOTHING;
--> statement-breakpoint

-- the 6 builtin rules as real rows with deterministic literal uuids (priority = first-match
-- order; version = RULESET_VERSION = 1). set_cost_center / set_flow_type are seeded only where
-- the builtin pins them: sublocacao_revenue/sublocacao_cost override the cost center to
-- `sublocacao`; flow_type is set to mirror each builtin's stamped flow. match_criteria stays
-- NULL — the builtin matchers are in code, these rows exist for rule_id auditability (D2-04).
INSERT INTO "rules" ("id","priority","version","match_criteria","set_category","set_cost_center","set_flow_type") VALUES
  ('66666666-6666-6666-6666-666666660001', 10, 1, null, null, null,          'investimento'),
  ('66666666-6666-6666-6666-666666660002', 20, 1, null, null, null,          'transferencia'),
  ('66666666-6666-6666-6666-666666660003', 30, 1, null, null, null,          'revenue'),
  ('66666666-6666-6666-6666-666666660004', 40, 1, null, null, 'sublocacao',  'revenue'),
  ('66666666-6666-6666-6666-666666660005', 50, 1, null, null, 'sublocacao',  'cost'),
  ('66666666-6666-6666-6666-666666660006', 60, 1, null, null, null,          'cost')
ON CONFLICT ("id") DO NOTHING;
