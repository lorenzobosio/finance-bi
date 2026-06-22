// Wave-0 RLS + seed assertions against the LIVE Supabase Postgres (FND-02 + FND-04)
// plus Phase-0 hardening: the allowlist is now DATA (app_allowlist table), gated by the
// SECURITY DEFINER function public.is_email_allowed().
//
// This is the executable form of the assertions, run via the `postgres` driver (the
// project already depends on it) because this environment has no `psql` binary. It asserts
// the RLS allowlist behaviour is DRIVEN BY THE TABLE: it inserts a TEMPORARY synthetic
// email into app_allowlist, proves that email gains row access, deletes it, proves access
// is lost, then cleans up — never touching the real emails.
//
// No real email literal appears in this file (public-repo hardening). The "allowed"
// identity used for the positive case is read from the LIVE app_allowlist at runtime
// (count only / value never printed), or a synthetic temp email is used.
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

// A synthetic, obviously-fake address used to PROVE the allowlist is dynamic/table-driven.
// It is not a real account and is always cleaned up.
const TEMP_EMAIL = `gsd-temp-${Date.now()}@invalid.test`;
const DENIED_EMAIL = 'intruder@invalid.test';

const DATA_TABLES = [
  'members', 'accounts', 'transactions', 'categories', 'rules', 'budgets',
  'investment_contributions', 'goals', 'milestones', 'balances', 'insights',
  'connections', 'dim_calendar',
  // Phase-1 ingestion tables (RLS enabled in 0004; existence + rowsecurity covered here).
  'import_batches', 'cost_centers',
];
const ALL_TABLES = ['app_allowlist', ...DATA_TABLES];

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
    await tx.unsafe(`set local request.jwt.claims = '${JSON.stringify({ email })}'`);
    return fn(tx);
  });
}

try {
  // (a) FND-02a: RLS enabled on EVERY public table, now INCLUDING app_allowlist.
  const [{ rls_off }] = await sql`
    select count(*)::int as rls_off
    from pg_tables
    where schemaname = 'public' and rowsecurity = false`;
  if (rls_off !== 0) fail(`FND-02a: ${rls_off} public table(s) have RLS disabled`);

  // (b) FND-04a: every one of the 14 tables (13 data + app_allowlist) exists.
  for (const t of ALL_TABLES) {
    const [{ reg }] = await sql`select to_regclass(${'public.' + t}) as reg`;
    if (reg === null) fail(`FND-04a: table public.${t} does not exist`);
  }

  // (c) HARDENING: public.is_email_allowed exists and is SECURITY DEFINER (prosecdef).
  const fn = await sql`
    select p.prosecdef
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'is_email_allowed'`;
  if (fn.length === 0) fail('HARDENING: public.is_email_allowed() does not exist');
  if (fn[0].prosecdef !== true)
    fail('HARDENING: public.is_email_allowed() is NOT security definer');

  // (d) HARDENING: app_allowlist is seeded; its row count equals the number of distinct
  // ALLOWED_EMAILS entries (when that env is available — CI without the secret skips the
  // strict equality but still requires a non-empty allowlist).
  const [{ allow_count }] = await sql`select count(*)::int as allow_count from public.app_allowlist`;
  if (allow_count <= 0) fail('HARDENING: app_allowlist is empty (no one could log in)');
  if (process.env.ALLOWED_EMAILS) {
    const expected = new Set(
      process.env.ALLOWED_EMAILS.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean),
    );
    if (allow_count !== expected.size)
      fail(`HARDENING: app_allowlist has ${allow_count} rows, expected ${expected.size} (== ALLOWED_EMAILS)`);
  }

  // (e) HARDENING: is_email_allowed() returns true/false correctly, case-insensitively.
  const [{ ok_lower }] = await sql`select public.is_email_allowed(${TEMP_EMAIL}) as ok_lower`;
  if (ok_lower !== false) fail('HARDENING: temp email allowed before it was inserted');

  // (f) FND-04b: dim_calendar seeded 2024-2035.
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

  // (g) FND-04c: exactly 2 members seeded (display names only — emails removed).
  const [{ member_count }] = await sql`select count(*)::int as member_count from members`;
  if (member_count !== 2) fail(`FND-04c: members has ${member_count} rows (expected 2)`);
  const [{ email_count }] = await sql`select count(email)::int as email_count from members`;
  if (email_count !== 0) fail(`HARDENING: ${email_count} member row(s) still store an email (expected 0)`);

  // (h) FND-04c: taxonomy covers all 3 groups.
  const [{ group_count }] = await sql`
    select count(distinct "group")::int as group_count
    from categories
    where "group" in ('essential','desire','investment')`;
  if (group_count !== 3) fail(`FND-04c: categories cover ${group_count} of 3 groups`);

  // (i) FND-02b + HARDENING (dynamic, table-driven): a non-allowlisted email sees ZERO
  // rows; INSERT it into app_allowlist → it now sees rows; DELETE it → zero again. This
  // proves access is driven by the TABLE, not a hardcoded list. Cleanup is guaranteed.
  const beforeRows = await asEmail(TEMP_EMAIL, (tx) => tx`select count(*)::int as c from dim_calendar`);
  if (beforeRows[0].c !== 0)
    fail(`HARDENING: temp email saw ${beforeRows[0].c} rows BEFORE being allowlisted (expected 0)`);

  try {
    await sql`insert into public.app_allowlist (email) values (${TEMP_EMAIL}) on conflict (email) do nothing`;

    const [{ fn_true }] = await sql`select public.is_email_allowed(${TEMP_EMAIL.toUpperCase()}) as fn_true`;
    if (fn_true !== true) fail('HARDENING: is_email_allowed() false for an allowlisted email (case-insensitive check)');

    const grantedRows = await asEmail(TEMP_EMAIL, (tx) => tx`select count(*)::int as c from dim_calendar`);
    if (grantedRows[0].c <= 0)
      fail(`HARDENING: temp email saw ${grantedRows[0].c} rows AFTER being allowlisted (expected > 0)`);
  } finally {
    await sql`delete from public.app_allowlist where email = ${TEMP_EMAIL}`;
  }

  const afterRows = await asEmail(TEMP_EMAIL, (tx) => tx`select count(*)::int as c from dim_calendar`);
  if (afterRows[0].c !== 0)
    fail(`HARDENING: temp email saw ${afterRows[0].c} rows AFTER removal from allowlist (expected 0)`);

  // (j) A clearly-denied email always sees zero rows.
  const deniedRows = await asEmail(DENIED_EMAIL, (tx) => tx`select count(*)::int as c from dim_calendar`);
  if (deniedRows[0].c !== 0)
    fail(`FND-02b: non-allowlisted email saw ${deniedRows[0].c} dim_calendar rows (expected 0)`);

  // (k) Phase-1 (D-24 / CAT-07): cost_centers seeded with EXACTLY the 4 extensible codes.
  const ccRows = await sql`select code from public.cost_centers`;
  const ccCodes = ccRows.map((r) => r.code).sort();
  const expectedCC = ['compartilhado', 'fernanda', 'lorenzo', 'sublocacao'];
  if (ccCodes.length !== expectedCC.length || ccCodes.some((c, i) => c !== expectedCC[i]))
    fail(`Phase-1: cost_centers has [${ccCodes.join(',')}] (expected the 4 D-24 codes: ${expectedCC.join(',')})`);

  console.log('RLS + seed + hardening assertions passed (FND-02a/b, FND-04a/b/c, table-driven allowlist, cost_centers seeded).');
  console.log(
    `  tables=${ALL_TABLES.length} app_allowlist=${allow_count}rows is_email_allowed=SECURITY DEFINER ` +
      `dim_calendar=${cal.day_rows}rows/${cal.distinct_periods}periods [${cal.min_period}..${cal.max_period}] ` +
      `members=${member_count}(emails=${email_count}) groups=${group_count} ` +
      `dynamic-allowlist: before=0 granted>0 afterRemoval=0 denied=0`,
  );
} catch (err) {
  if (process.exitCode !== 1) {
    console.error('FATAL:', err.message);
    process.exitCode = 1;
  }
} finally {
  await sql.end({ timeout: 5 });
}
