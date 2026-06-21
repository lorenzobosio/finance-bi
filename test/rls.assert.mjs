// Wave-0 RLS + seed assertions against the LIVE Supabase Postgres (FND-02 + FND-04).
//
// This is the executable form of test/rls.assert.sql, run via the `postgres` driver
// (the project already depends on it) because this environment has no `psql` binary.
// The SQL file remains the version-controlled, human-readable source of the assertions;
// this script asserts the exact same facts and additionally proves the RLS allowlist
// zero-rows / rows behaviour (FND-02b) using `set local role authenticated` +
// `request.jwt.claims`.
//
// Run: `pnpm test:rls`  (loads DATABASE_URL from the environment; never prints it).
// Exits non-zero on the first failed assertion.

import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('FATAL: DATABASE_URL is not set. Load it first: set -a; . ./.env.local; set +a');
  process.exit(1);
}

const sql = postgres(url, { max: 1, onnotice: () => {} });

const ALLOWED_EMAIL = 'redacted@example.com';
const DENIED_EMAIL = 'intruder@example.com';

const EXPECTED_TABLES = [
  'members', 'accounts', 'transactions', 'categories', 'rules', 'budgets',
  'investment_contributions', 'goals', 'milestones', 'balances', 'insights',
  'connections', 'dim_calendar',
];

function fail(msg) {
  console.error('FAILED: ' + msg);
  process.exitCode = 1;
  throw new Error(msg);
}

async function asEmail(email, fn) {
  // Emulate an authenticated Supabase request: the `authenticated` role + a JWT whose
  // email claim drives the RLS allowlist. `set local` scopes it to this transaction.
  return sql.begin(async (tx) => {
    await tx.unsafe(`set local role authenticated`);
    await tx.unsafe(
      `set local request.jwt.claims = '${JSON.stringify({ email })}'`,
    );
    return fn(tx);
  });
}

try {
  // (a) FND-02a: RLS enabled on EVERY public table (zero with it off).
  const [{ rls_off }] = await sql`
    select count(*)::int as rls_off
    from pg_tables
    where schemaname = 'public' and rowsecurity = false`;
  if (rls_off !== 0) fail(`FND-02a: ${rls_off} public table(s) have RLS disabled`);

  // (b) FND-04a: every one of the 13 tables exists.
  for (const t of EXPECTED_TABLES) {
    const [{ reg }] = await sql`select to_regclass(${'public.' + t}) as reg`;
    if (reg === null) fail(`FND-04a: table public.${t} does not exist`);
  }

  // (c) FND-04b: dim_calendar seeded 2024-2035.
  const [cal] = await sql`
    select count(*)::int as day_rows,
           count(distinct period_key)::int as distinct_periods,
           min(period_key)::int as min_period,
           max(period_key)::int as max_period
    from dim_calendar`;
  if (cal.day_rows < 4382 || cal.day_rows > 4384)
    fail(`FND-04b: dim_calendar has ${cal.day_rows} day rows (expected ~4383)`);
  if (cal.distinct_periods !== 144)
    fail(`FND-04b: dim_calendar has ${cal.distinct_periods} distinct months (expected 144)`);
  if (cal.min_period !== 202401 || cal.max_period !== 203512)
    fail(`FND-04b: dim_calendar bounds ${cal.min_period}/${cal.max_period} (expected 202401/203512)`);

  // (d) FND-04c: exactly 2 members seeded.
  const [{ member_count }] = await sql`select count(*)::int as member_count from members`;
  if (member_count !== 2) fail(`FND-04c: members has ${member_count} rows (expected 2)`);

  // (e) FND-04c: taxonomy covers all 3 groups.
  const [{ group_count }] = await sql`
    select count(distinct "group")::int as group_count
    from categories
    where "group" in ('essential','desire','investment')`;
  if (group_count !== 3) fail(`FND-04c: categories cover ${group_count} of 3 groups`);

  // (f) FND-02b: allowlisted identity sees rows; non-allowlisted sees zero (RLS wall).
  const allowedRows = await asEmail(ALLOWED_EMAIL, (tx) => tx`select count(*)::int as c from dim_calendar`);
  if (allowedRows[0].c <= 0)
    fail(`FND-02b: allowlisted email saw ${allowedRows[0].c} dim_calendar rows (expected > 0)`);

  const deniedRows = await asEmail(DENIED_EMAIL, (tx) => tx`select count(*)::int as c from dim_calendar`);
  if (deniedRows[0].c !== 0)
    fail(`FND-02b: non-allowlisted email saw ${deniedRows[0].c} dim_calendar rows (expected 0)`);

  console.log('RLS + seed assertions passed (FND-02a, FND-02b, FND-04a/b/c).');
  console.log(
    `  tables=${EXPECTED_TABLES.length} dim_calendar=${cal.day_rows}rows/${cal.distinct_periods}periods ` +
      `[${cal.min_period}..${cal.max_period}] members=${member_count} groups=${group_count} ` +
      `allowlist: allowed=${allowedRows[0].c}>0 denied=${deniedRows[0].c}=0`,
  );
} catch (err) {
  if (process.exitCode !== 1) {
    console.error('FATAL:', err.message);
    process.exitCode = 1;
  }
} finally {
  await sql.end({ timeout: 5 });
}
