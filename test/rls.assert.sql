-- Wave 0 RLS + seed assertions (FND-02a, FND-04a/b/c).
-- Run against the LIVE database AFTER Plan 02 pushes schema + RLS + seed:
--   pnpm test:rls   (psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f test/rls.assert.sql)
-- Each DO block RAISEs EXCEPTION on a failed assertion; with ON_ERROR_STOP=1
-- psql exits non-zero, so any failure fails CI. Until Plan 02 runs, these
-- assertions are expected to fail (tables/seed do not yet exist) — pending, not red-forever.

\set ON_ERROR_STOP on

-- (a) FND-02a: RLS enabled on EVERY table in the public schema (zero with it off).
DO $$
DECLARE
  rls_off integer;
BEGIN
  SELECT count(*) INTO rls_off
  FROM pg_tables
  WHERE schemaname = 'public' AND rowsecurity = false;
  IF rls_off <> 0 THEN
    RAISE EXCEPTION 'FND-02a FAILED: % public table(s) have row level security disabled', rls_off;
  END IF;
END $$;

-- (b) FND-04a: every one of the 12 core tables + the calendar dimension exists.
DO $$
DECLARE
  t text;
  expected text[] := ARRAY[
    'members','accounts','transactions','categories','rules','budgets',
    'investment_contributions','goals','milestones','balances','insights',
    'connections','dim_calendar'
  ];
BEGIN
  FOREACH t IN ARRAY expected LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE EXCEPTION 'FND-04a FAILED: table public.% does not exist', t;
    END IF;
  END LOOP;
END $$;

-- (c) FND-04b: dim_calendar seeded for 2024-2035.
--   ~4383 day rows; 144 distinct month period values; min/max month bounds 202401 / 203512.
DO $$
DECLARE
  day_rows integer;
  distinct_periods integer;
  min_period integer;
  max_period integer;
BEGIN
  SELECT count(*), count(DISTINCT period_key), min(period_key), max(period_key)
    INTO day_rows, distinct_periods, min_period, max_period
  FROM dim_calendar;

  IF day_rows NOT BETWEEN 4382 AND 4384 THEN
    RAISE EXCEPTION 'FND-04b FAILED: dim_calendar has % day rows (expected ~4383)', day_rows;
  END IF;
  IF distinct_periods <> 144 THEN
    RAISE EXCEPTION 'FND-04b FAILED: dim_calendar has % distinct months (expected 144)', distinct_periods;
  END IF;
  IF min_period <> 202401 OR max_period <> 203512 THEN
    RAISE EXCEPTION 'FND-04b FAILED: dim_calendar month bounds are %/% (expected 202401/203512)', min_period, max_period;
  END IF;
END $$;

-- (d) FND-04c: exactly the 2 household members are seeded.
DO $$
DECLARE
  member_count integer;
BEGIN
  SELECT count(*) INTO member_count FROM members;
  IF member_count <> 2 THEN
    RAISE EXCEPTION 'FND-04c FAILED: members has % rows (expected 2)', member_count;
  END IF;
END $$;

-- (e) FND-04c: the category taxonomy covers all 3 groups.
DO $$
DECLARE
  group_count integer;
BEGIN
  SELECT count(DISTINCT "group") INTO group_count
  FROM categories
  WHERE "group" IN ('essential','desire','investment');
  IF group_count <> 3 THEN
    RAISE EXCEPTION 'FND-04c FAILED: categories cover % of the 3 expected groups', group_count;
  END IF;
END $$;

\echo 'RLS + seed assertions passed (FND-02a, FND-04a/b/c).'
