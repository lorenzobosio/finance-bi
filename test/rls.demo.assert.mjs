// Wave-0 anon-no-leak gate against the LIVE Supabase Postgres (DEMO-02 / DEMO-03, R-A).
//
// This is the PHASE-CRITICAL gate. Phase 4 opens the project's first UNAUTHENTICATED read
// surface (the public demo deploy reads via the `anon` role under an additive
// `for select to anon using (is_demo = true)` RLS policy). A single one-line typo in that
// policy — `using (true)` instead of `using (is_demo = true)` — would publish every real
// transaction, balance and budget to the public internet. This guard asserts BOTH directions:
//
//   Direction 1 (no-leak):       the anon role sees ZERO real (is_demo=false) rows.
//   Direction 2 (demo-visible):  the anon role sees ≥1 demo (is_demo=true) row.
//   Write-deny:                  the anon role CANNOT insert (no anon write policy → RLS rejects).
//   Cookie-escalation (Threat 4): anon + an explicit `is_demo=false` filter still yields 0 rows
//                                 (RLS post-filters regardless of the application-level filter).
//
// It clones the proven temp-row insert→prove→delete discipline from `test/rls.assert.mjs`,
// adapted to the `anon` role (no JWT email claim). Run via the `postgres` driver because this
// environment has no `psql` binary.
//
// No PII: synthetic temp values only (Date.now()-suffixed), counts/booleans logged — a row
// value is NEVER printed. The temp real row is deleted in a `finally`.
//
// RED until Wave 2: the `is_demo` column (migration 0010) and the anon policy (0011) do not
// exist yet, and the seed (0011+seed) has not run, so Direction 2 / the column probes fail.
// That is the intended RED state. This file must be GREEN before ANY demo deploy goes live.
//
// Run: `pnpm test:rls:demo`  (loads DATABASE_URL from the environment; never prints it).
// Exits non-zero on the first failed assertion.

import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('FATAL: DATABASE_URL is not set. Load it first: set -a; . ./.env.local; set +a');
  process.exit(1);
}

const sql = postgres(url, { max: 1, onnotice: () => {} });

// The demo-bearing tables the additive anon policy covers (D4-13). `connections` is included
// because it is an onboarding signal that the public demo must surface (is_demo=true) without
// leaking the real connection.
const DEMO_TABLES = [
  'transactions',
  'balances',
  'budgets',
  'goals',
  'milestones',
  'investment_contributions',
  'insights',
  'connections',
];

function fail(msg) {
  console.error('FAILED: ' + msg);
  process.exitCode = 1;
  throw new Error(msg);
}

// Emulate an UNAUTHENTICATED Supabase request: the `anon` role, NO jwt email claim. `set local`
// scopes the role to this transaction only (mirrors `asEmail` in rls.assert.mjs, anon variant).
async function asAnon(fn) {
  return sql.begin(async (tx) => {
    await tx.unsafe(`set local role anon`);
    return fn(tx);
  });
}

// Does a table carry the `is_demo` column yet? (false until migration 0010 lands — the RED state.)
async function hasIsDemo(table) {
  const rows = await sql`
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = ${table} and column_name = 'is_demo'`;
  return rows.length > 0;
}

try {
  // (pre) The phase invariant: every demo-bearing table must carry the `is_demo` column before
  // any of the directional assertions are meaningful. Missing column => RED (Wave 2 not applied).
  for (const t of DEMO_TABLES) {
    if (!(await hasIsDemo(t)))
      fail(`R-C: table public.${t} has no is_demo column yet (migration 0010 not applied)`);
  }

  // A minimal synthetic real row to prove the anon no-leak direction. transactions.account_id is
  // a NOT NULL FK, so we create a throwaway member+account first (privileged driver, bypasses
  // RLS), all Date.now()-suffixed and deleted in the finally. Synthetic values only — no PII.
  const stamp = Date.now();
  const tempDedupe = `gsd-demo-leakcheck-${stamp}`;
  let tempAccountId = null;
  let tempMemberId = null;

  try {
    // Throwaway member + account (synthetic, is_demo=false — a REAL row the anon role must NOT see).
    [{ id: tempMemberId }] = await sql`
      insert into public.members (display_name) values (${'gsd-temp-' + stamp})
      returning id`;
    // accounts does NOT carry is_demo (not in the D4-13 demo-bearing set) — insert without it.
    [{ id: tempAccountId }] = await sql`
      insert into public.accounts (member_id, name)
      values (${tempMemberId}, ${'gsd-temp-acct-' + stamp})
      returning id`;
    await sql`
      insert into public.transactions
        (account_id, booking_date, amount_eur, description, dedupe_hash, is_demo)
      values
        (${tempAccountId}, current_date, 0.01, ${'gsd-temp'}, ${tempDedupe}, false)`;

    // Direction 1 (NO-LEAK): the anon role sees ZERO real (is_demo=false) rows of our temp row.
    const leak = await asAnon((tx) => tx`
      select count(*)::int as c from public.transactions where dedupe_hash = ${tempDedupe}`);
    if (leak[0].c !== 0)
      fail(`R-A NO-LEAK: anon saw ${leak[0].c} real (is_demo=false) transaction row(s) (expected 0)`);

    // Cookie-escalation (Threat 4): anon + an explicit application is_demo=false filter still 0.
    const forged = await asAnon((tx) => tx`
      select count(*)::int as c from public.transactions where is_demo = false`);
    if (forged[0].c !== 0)
      fail(`R-A COOKIE-ESCALATION: anon + is_demo=false filter saw ${forged[0].c} row(s) (expected 0)`);

    // Write-deny: the anon role cannot INSERT (no anon write policy → RLS rejects). We expect an
    // error; a SUCCESSFUL insert is the failure.
    let wrote = false;
    try {
      await asAnon((tx) => tx`
        insert into public.transactions
          (account_id, booking_date, amount_eur, dedupe_hash, is_demo)
        values (${tempAccountId}, current_date, 0.01, ${tempDedupe + '-anon'}, true)`);
      wrote = true;
    } catch {
      // expected — RLS denies the anon insert.
    }
    if (wrote) fail('R-A WRITE-DENY: anon INSERT into transactions SUCCEEDED (expected RLS denial)');
  } finally {
    // Guaranteed cleanup of the synthetic real row + its FK parents (privileged driver).
    await sql`delete from public.transactions where dedupe_hash like ${'gsd-demo-leakcheck-' + stamp + '%'}`;
    if (tempAccountId) await sql`delete from public.accounts where id = ${tempAccountId}`;
    if (tempMemberId) await sql`delete from public.members where id = ${tempMemberId}`;
  }

  // Direction 2 (DEMO-VISIBLE): the anon role sees ≥1 demo (is_demo=true) row. This requires the
  // seed (Wave 2 `pnpm seed:demo`) — RED until then. Asserted per demo-bearing table so a missing
  // anon policy on ANY table fails loudly.
  for (const t of DEMO_TABLES) {
    const seen = await asAnon((tx) =>
      tx.unsafe(`select count(*)::int as c from public.${t} where is_demo = true`),
    );
    if (seen[0].c < 1)
      fail(`R-A DEMO-VISIBLE: anon saw ${seen[0].c} demo (is_demo=true) row(s) in public.${t} (expected >= 1; seed not run?)`);
  }

  // ---------------------------------------------------------------------------
  // VIEW CHECK (Phase-4 UAT fix — the gap that let this gate pass while the demo was €0).
  //
  // The app does NOT read the demo-bearing TABLES directly — it reads the `v_*` marts, which are
  // `security_invoker = on` and JOIN three SHARED reference tables (dim_calendar, categories,
  // cost_centers). If those reference tables lack an anon SELECT policy, the anon role sees zero
  // reference rows, the dim_calendar period-spine LEFT JOIN collapses, and EVERY mart returns zero
  // rows → the public demo renders €0 everywhere even though the demo-bearing tables (asserted
  // above) are correctly anon-visible. The table checks alone CANNOT catch that, so we assert the
  // VIEW surface the app actually reads.
  //
  // RED pre-migration (0013 not applied → anon has no read on the reference tables → the mart
  // returns 0 rows). GREEN post-migration (operator's `pnpm db:migrate` + the seed already run).
  //
  //   View Direction 1 (demo-visible): anon sees >= 1 demo (is_demo=true) row in v_pnl_monthly
  //                                    → the headline KPIs are non-empty for the demo.
  //   View Direction 2 (no-leak):      anon sees 0 real (is_demo=false) rows in v_pnl_monthly
  //                                    → the marts never publish real financials to the anon role.
  // ---------------------------------------------------------------------------
  const DEMO_VIEW = 'v_pnl_monthly';

  const viewDemo = await asAnon((tx) =>
    tx.unsafe(`select count(*)::int as c from public.${DEMO_VIEW} where is_demo = true`),
  );
  if (viewDemo[0].c < 1)
    fail(
      `R-A VIEW DEMO-VISIBLE: anon saw ${viewDemo[0].c} demo row(s) in public.${DEMO_VIEW} ` +
        `(expected >= 1). The marts JOIN dim_calendar/categories/cost_centers — anon needs a ` +
        `SELECT policy on those reference tables (migration 0013) or every mart collapses to €0.`,
    );

  const viewReal = await asAnon((tx) =>
    tx.unsafe(`select count(*)::int as c from public.${DEMO_VIEW} where is_demo = false`),
  );
  if (viewReal[0].c !== 0)
    fail(
      `R-A VIEW NO-LEAK: anon saw ${viewReal[0].c} real (is_demo=false) row(s) in public.${DEMO_VIEW} ` +
        `(expected 0). A reference table must NOT expose real financial rows through the mart.`,
    );

  console.log('anon-no-leak gate passed (R-A): both directions + write-deny + cookie-escalation + view.');
  console.log(
    `  demo_tables=${DEMO_TABLES.length} anon: real-leak=0 demo-visible>=1/table forged-filter=0 write-deny=enforced`,
  );
  console.log(
    `  view=${DEMO_VIEW} anon: demo-visible=${viewDemo[0].c} real-leak=${viewReal[0].c} (app reads marts, not tables)`,
  );
} catch (err) {
  if (process.exitCode !== 1) {
    console.error('FATAL:', err.message);
    process.exitCode = 1;
  }
} finally {
  await sql.end({ timeout: 5 });
}
