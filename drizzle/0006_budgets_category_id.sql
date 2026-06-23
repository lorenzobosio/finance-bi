-- 0006_budgets_category_id — add the NULLABLE `budgets.category_id` FK (D2-14, BI-02).
--
-- WHY: budgeted-vs-actual must work at TWO grains. Today `budgets` is keyed by `cost_center`
-- only (per-person / shared). Adding a NULLABLE `category_id` FK to `categories.id` lets a
-- budget row optionally pin a finer category grain:
--   * category_id IS NULL  -> a cost-center-grain budget (the existing behavior, unchanged).
--   * category_id IS SET    -> a category-grain budget (the new finer grain).
-- Nullable = additive and non-breaking: every existing budget row stays valid as a
-- cost-center-grain budget.
--
-- The new column inherits the existing `allowlist_all for all to authenticated` RLS on
-- budgets (0001) — no new policy, no access-boundary gap (T-02-05). RLS stays enabled.
--
-- Hand-written (matches the 0003 ADD COLUMN + FK convention); numbered after 0000-0004.

ALTER TABLE "budgets" ADD COLUMN "category_id" uuid REFERENCES "categories"("id");
