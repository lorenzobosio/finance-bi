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

// Phase-5 (migration 0014) GOAL-JOURNEY demo-bearing tables — the new public-demo read surface.
// `household` (launch_date + shared "why") and `goal_events` (once-only celebrations) RENDER in the
// demo, so they get the full no-leak + write-deny + cookie-escalation directions AND the staged
// demo-visible direction. `transfer_overrides` is demo-bearing but MAY be empty for the demo
// (per-transfer manual splits are optional), so it gets the no-leak directions but is NOT required
// to be demo-visible. A wrong anon predicate on ANY of these would leak the real household's
// finances to the public internet — exactly the T-05-01 boundary Task 3 closes.
const GOAL_DEMO_TABLES = ['household', 'goal_events', 'transfer_overrides'];
const GOAL_DEMO_VISIBLE_TABLES = ['household', 'goal_events'];

// Phase-6 (migration 0015) HEALTH-SCORECARD demo-bearing table — the new `insight_thresholds`
// settings singleton (band config). It joins the additive anon-demo read surface, so a wrong anon
// predicate would leak the real household's threshold config to the public internet. It gets the
// full no-leak + cookie-escalation + write-deny directions but is NOT required demo-visible: the
// public demo relies on the DEFAULT_BANDS fallback, so a seeded is_demo=true thresholds row is
// OPTIONAL (mirrors transfer_overrides). Staged-RED until 0015 lands (the pre-check gates it).
const HEALTH_DEMO_TABLES = ['insight_thresholds'];

// `buckets` is REFERENCE data (like cost_centers in 0013): the same 3 rows (wealth/brazil/
// adventures) for real + demo, anon-readable via `using (true)`, NO is_demo column. It is asserted
// anon-SELECTable — NOT run through the is_demo no-leak check (there is nothing private in it).
const GOAL_REFERENCE_TABLES = ['buckets'];

// The new mart the app actually reads on the Brazil/Adventures pages (GOAL-13). Per the 0013
// lesson (assert the VIEWS the app reads, not only tables), the no-leak direction is asserted on
// this view too: every is_demo=false row anon can read through it must be a €0 zero-fill.
const GOAL_DEMO_VIEW = 'v_bucket_spend';

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
  // Phase-5: the goal-journey demo-bearing tables must carry is_demo before their directional
  // assertions are meaningful. Missing column => RED (migration 0014 not applied) — the intended
  // staged-RED state for this plan, exactly as Phase-4 staged the 0010/0011 tables.
  for (const t of GOAL_DEMO_TABLES) {
    if (!(await hasIsDemo(t)))
      fail(`R-C: table public.${t} has no is_demo column yet (migration 0014 not applied)`);
  }
  // Phase-6: the health-scorecard settings table must carry is_demo before its directional
  // assertions are meaningful. Missing column => RED (migration 0015 not applied) — the intended
  // staged-RED state for this plan, exactly as Phase-4/5 staged their new tables.
  for (const t of HEALTH_DEMO_TABLES) {
    if (!(await hasIsDemo(t)))
      fail(`R-C: table public.${t} has no is_demo column yet (migration 0015 not applied)`);
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
  //   View Direction 2 (no-leak):      EVERY is_demo=false row anon can read through v_pnl_monthly
  //                                    has ALL financial columns = €0 → the marts never publish a
  //                                    real non-zero figure to the anon role.
  //
  // WHY NOT "anon sees 0 is_demo=false rows": migration 0013 (correctly) grants anon SELECT on the
  // SHARED reference tables (dim_calendar/categories/cost_centers) so the period-spine LEFT JOIN
  // resolves. For every period with NO demo transactions, the spine's `t.is_demo` is NULL →
  // `coalesce(t.is_demo, false)` = false → a zero-fill is_demo=false row whose financial columns
  // are all €0. The anon role CANNOT read real (is_demo=false) transactions (its RLS policy is
  // `using (is_demo = true)`), so these false-partition rows carry NO real money — they are pure
  // €0 zero-fill from the now-readable spine. "0 is_demo=false rows" is therefore impossible AND
  // the wrong invariant. The correct, STRONGER invariant: anon never sees a real non-zero number
  // through the mart — i.e. SUM(|revenue|+|costs|+|investimento|+|sublet_net|+|result|) over all
  // anon-visible is_demo=false rows MUST be 0. A single non-zero value = a real leak → FAIL loud.
  // (margin is a derived ratio via nullif and can be NULL → excluded; the partition's money lives
  // in the five amount columns, which are exactly the v_pnl_monthly financial columns in 0010.)
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

  // No-leak: every is_demo=false row anon can read must be a €0 zero-fill (no real money). Find the
  // single worst offender (largest absolute financial footprint) so the failure names the period.
  const viewReal = await asAnon((tx) =>
    tx.unsafe(
      `select period_key,
              (abs(revenue) + abs(costs) + abs(investimento) + abs(sublet_net) + abs(result))::numeric(14,2) as money
         from public.${DEMO_VIEW}
        where is_demo = false
        order by money desc
        limit 1`,
    ),
  );
  const worst = viewReal[0];
  // worst is undefined if anon sees zero is_demo=false rows at all — also a pass (no row = no leak).
  if (worst && Number(worst.money) !== 0)
    fail(
      `R-A VIEW NO-LEAK: anon read a NON-ZERO real (is_demo=false) row in public.${DEMO_VIEW} — ` +
        `period_key=${worst.period_key} has |financials| sum = €${worst.money} (expected €0). ` +
        `Every is_demo=false row anon sees through the mart must be a pure €0 zero-fill; a non-zero ` +
        `value means a reference table is exposing REAL financial data to the anon role.`,
    );

  // ===========================================================================
  // PHASE-5 (0014) GOAL-JOURNEY SURFACE — new demo-bearing tables + the v_bucket_spend mart.
  //
  // Same discipline as the transactions block above: NO-LEAK (anon sees 0 real is_demo=false rows)
  // + COOKIE-ESCALATION (anon + explicit is_demo=false filter still 0) + WRITE-DENY (no anon write
  // policy → RLS rejects) on household / goal_events / transfer_overrides; the staged DEMO-VISIBLE
  // direction (RED until the Plan-09 seed) on household / goal_events; `buckets` asserted
  // anon-SELECTable as reference data (using(true), no is_demo); and the v_bucket_spend VIEW no-leak
  // (the 0013 lesson — assert the views the app reads). RED until 0014 lands (the pre-check above
  // gates this) + the seed runs — the intended staged state for this plan.
  // ===========================================================================
  const gstamp = Date.now();
  let hhId = null;
  let geId = null;
  let goalTxId = null;
  let goalAcctId = null;
  let goalMemberId = null;
  try {
    // --- household: no-leak + cookie-escalation on a real (is_demo=false) row ---
    [{ id: hhId }] = await sql`
      insert into public.household (is_demo) values (false) returning id`;
    const hhLeak = await asAnon((tx) => tx`
      select count(*)::int as c from public.household where id = ${hhId}`);
    if (hhLeak[0].c !== 0)
      fail(`R-A NO-LEAK: anon saw ${hhLeak[0].c} real (is_demo=false) household row(s) (expected 0)`);
    const hhForged = await asAnon((tx) => tx`
      select count(*)::int as c from public.household where is_demo = false`);
    if (hhForged[0].c !== 0)
      fail(`R-A COOKIE-ESCALATION: anon + is_demo=false saw ${hhForged[0].c} household row(s) (expected 0)`);

    // --- goal_events: no-leak + cookie-escalation on a real (is_demo=false) row ---
    [{ id: geId }] = await sql`
      insert into public.goal_events (kind, dedupe_key, is_demo)
      values ('level', ${'gsd-temp-' + gstamp}, false) returning id`;
    const geLeak = await asAnon((tx) => tx`
      select count(*)::int as c from public.goal_events where id = ${geId}`);
    if (geLeak[0].c !== 0)
      fail(`R-A NO-LEAK: anon saw ${geLeak[0].c} real (is_demo=false) goal_events row(s) (expected 0)`);
    const geForged = await asAnon((tx) => tx`
      select count(*)::int as c from public.goal_events where is_demo = false`);
    if (geForged[0].c !== 0)
      fail(`R-A COOKIE-ESCALATION: anon + is_demo=false saw ${geForged[0].c} goal_events row(s) (expected 0)`);

    // --- transfer_overrides: needs a real transaction FK parent (member → account → transaction) ---
    [{ id: goalMemberId }] = await sql`
      insert into public.members (display_name) values (${'gsd-temp-goal-' + gstamp}) returning id`;
    [{ id: goalAcctId }] = await sql`
      insert into public.accounts (member_id, name)
      values (${goalMemberId}, ${'gsd-temp-goal-acct-' + gstamp}) returning id`;
    [{ id: goalTxId }] = await sql`
      insert into public.transactions
        (account_id, booking_date, amount_eur, description, dedupe_hash, is_demo)
      values (${goalAcctId}, current_date, 0.01, ${'gsd-temp'}, ${'gsd-temp-goal-' + gstamp}, false)
      returning id`;
    await sql`
      insert into public.transfer_overrides
        (transaction_id, wealth_eur, brazil_eur, adv_small_eur, adv_big_eur, is_demo)
      values (${goalTxId}, 0.01, 0, 0, 0, false)`;
    const toLeak = await asAnon((tx) => tx`
      select count(*)::int as c from public.transfer_overrides where transaction_id = ${goalTxId}`);
    if (toLeak[0].c !== 0)
      fail(`R-A NO-LEAK: anon saw ${toLeak[0].c} real (is_demo=false) transfer_overrides row(s) (expected 0)`);
    const toForged = await asAnon((tx) => tx`
      select count(*)::int as c from public.transfer_overrides where is_demo = false`);
    if (toForged[0].c !== 0)
      fail(`R-A COOKIE-ESCALATION: anon + is_demo=false saw ${toForged[0].c} transfer_overrides row(s) (expected 0)`);

    // --- Write-deny: anon cannot INSERT into any of the three (no anon write policy → RLS rejects) ---
    const writeAttempts = [
      ['household', `insert into public.household (is_demo) values (true)`],
      ['goal_events', `insert into public.goal_events (kind, dedupe_key, is_demo) values ('level', 'gsd-temp-anon-${gstamp}', true)`],
      ['transfer_overrides', `insert into public.transfer_overrides (transaction_id, wealth_eur, brazil_eur, adv_small_eur, adv_big_eur, is_demo) values ('${goalTxId}', 0.01, 0, 0, 0, true)`],
    ];
    for (const [table, stmt] of writeAttempts) {
      let wrote = false;
      try {
        await asAnon((tx) => tx.unsafe(stmt));
        wrote = true;
      } catch {
        // expected — RLS denies the anon insert.
      }
      if (wrote) fail(`R-A WRITE-DENY: anon INSERT into ${table} SUCCEEDED (expected RLS denial)`);
    }
  } finally {
    // Guaranteed cleanup (privileged driver) — respect the FK chain (override → transaction → account → member).
    if (goalTxId) await sql`delete from public.transfer_overrides where transaction_id = ${goalTxId}`;
    if (hhId) await sql`delete from public.household where id = ${hhId}`;
    if (geId) await sql`delete from public.goal_events where id = ${geId}`;
    if (goalTxId) await sql`delete from public.transactions where id = ${goalTxId}`;
    if (goalAcctId) await sql`delete from public.accounts where id = ${goalAcctId}`;
    if (goalMemberId) await sql`delete from public.members where id = ${goalMemberId}`;
  }

  // Direction 2 (DEMO-VISIBLE) on the goal-journey tables — anon sees ≥1 demo (is_demo=true) row.
  // Staged: RED until the Plan-09 seed populates the demo partition of these tables (exactly the
  // Phase-4 pattern — NOT a hard failure at Plan-03 migration time). transfer_overrides is excluded
  // (may be empty for the demo).
  for (const t of GOAL_DEMO_VISIBLE_TABLES) {
    const seen = await asAnon((tx) =>
      tx.unsafe(`select count(*)::int as c from public.${t} where is_demo = true`),
    );
    if (seen[0].c < 1)
      fail(`R-A DEMO-VISIBLE: anon saw ${seen[0].c} demo (is_demo=true) row(s) in public.${t} (expected >= 1; seed not run?)`);
  }

  // `buckets` — reference data: anon must be able to SELECT it (using(true)); it carries NO private
  // financial content, so it is NOT run through the is_demo no-leak check. The 3 seed rows land in
  // migration 0014 (like cost_centers), so anon sees >= 1.
  for (const t of GOAL_REFERENCE_TABLES) {
    const cnt = await asAnon((tx) => tx.unsafe(`select count(*)::int as c from public.${t}`));
    if (cnt[0].c < 1)
      fail(`R-A REFERENCE: anon saw ${cnt[0].c} row(s) in reference table public.${t} (expected >= 1 anon-SELECTable rows; using(true) + 0014 seed)`);
  }

  // v_bucket_spend VIEW check (the 0013 lesson — the app reads this mart, not the tables directly).
  //   Demo-visible: anon sees >= 1 demo (is_demo=true) tagged-spend row → the bucket pages render.
  //   No-leak:      every is_demo=false row anon can read through the view has costs = €0 (a pure
  //                 zero-fill from the now-readable reference spine); a non-zero value = a real leak.
  const bucketViewDemo = await asAnon((tx) =>
    tx.unsafe(`select count(*)::int as c from public.${GOAL_DEMO_VIEW} where is_demo = true`),
  );
  if (bucketViewDemo[0].c < 1)
    fail(
      `R-A VIEW DEMO-VISIBLE: anon saw ${bucketViewDemo[0].c} demo row(s) in public.${GOAL_DEMO_VIEW} ` +
        `(expected >= 1; seed not run?). The mart JOINs reference tables — anon needs their SELECT ` +
        `policy (0013/0014) or it collapses to zero rows.`,
    );
  const bucketViewReal = await asAnon((tx) =>
    tx.unsafe(
      `select cost_center, abs(costs)::numeric(14,2) as money
         from public.${GOAL_DEMO_VIEW}
        where is_demo = false
        order by money desc
        limit 1`,
    ),
  );
  const bWorst = bucketViewReal[0];
  // bWorst is undefined if anon sees zero is_demo=false rows at all — also a pass (no row = no leak).
  if (bWorst && Number(bWorst.money) !== 0)
    fail(
      `R-A VIEW NO-LEAK: anon read a NON-ZERO real (is_demo=false) row in public.${GOAL_DEMO_VIEW} — ` +
        `cost_center=${bWorst.cost_center} has |costs| = €${bWorst.money} (expected €0 zero-fill). ` +
        `A non-zero value means a reference table is exposing REAL bucket spend to the anon role.`,
    );

  // ===========================================================================
  // PHASE-6 (0015) HEALTH-SCORECARD SURFACE — the new insight_thresholds settings table.
  //
  // Same discipline as the household block above: NO-LEAK (anon sees 0 real is_demo=false rows) +
  // COOKIE-ESCALATION (anon + explicit is_demo=false filter still 0) + WRITE-DENY (no anon write
  // policy → RLS rejects). insight_thresholds is NOT required demo-visible — the demo uses the
  // DEFAULT_BANDS fallback, so a seeded is_demo=true row is optional (mirrors transfer_overrides).
  // A wrong anon predicate here would leak the real household's band config publicly. RED until
  // 0015 lands (the pre-check above gates this) — the intended staged state for this plan.
  // ===========================================================================
  let itId = null;
  try {
    // A minimal real (is_demo=false) settings row the anon role must NOT see. Band columns carry
    // seeded defaults (0015), so only the partition literal is supplied.
    [{ id: itId }] = await sql`
      insert into public.insight_thresholds (is_demo) values (false) returning id`;
    const itLeak = await asAnon((tx) => tx`
      select count(*)::int as c from public.insight_thresholds where id = ${itId}`);
    if (itLeak[0].c !== 0)
      fail(`R-A NO-LEAK: anon saw ${itLeak[0].c} real (is_demo=false) insight_thresholds row(s) (expected 0)`);
    const itForged = await asAnon((tx) => tx`
      select count(*)::int as c from public.insight_thresholds where is_demo = false`);
    if (itForged[0].c !== 0)
      fail(`R-A COOKIE-ESCALATION: anon + is_demo=false saw ${itForged[0].c} insight_thresholds row(s) (expected 0)`);

    // Write-deny: anon cannot INSERT (no anon write policy → RLS rejects). A successful insert fails.
    let wroteIt = false;
    try {
      await asAnon((tx) => tx`insert into public.insight_thresholds (is_demo) values (true)`);
      wroteIt = true;
    } catch {
      // expected — RLS denies the anon insert.
    }
    if (wroteIt)
      fail('R-A WRITE-DENY: anon INSERT into insight_thresholds SUCCEEDED (expected RLS denial)');
  } finally {
    if (itId) await sql`delete from public.insight_thresholds where id = ${itId}`;
  }

  console.log('anon-no-leak gate passed (R-A): both directions + write-deny + cookie-escalation + view.');
  console.log(
    `  demo_tables=${DEMO_TABLES.length} anon: real-leak=0 demo-visible>=1/table forged-filter=0 write-deny=enforced`,
  );
  console.log(
    `  view=${DEMO_VIEW} anon: demo-visible=${viewDemo[0].c} real-money-leak=€${worst ? worst.money : 0} ` +
      `(every is_demo=false row is €0 zero-fill; app reads marts, not tables)`,
  );
  console.log(
    `  goal-journey (0014): tables=${GOAL_DEMO_TABLES.join('/')} no-leak=0 write-deny=enforced ` +
      `demo-visible>=1(${GOAL_DEMO_VISIBLE_TABLES.join('/')}) reference=${GOAL_REFERENCE_TABLES.join('/')} ` +
      `view=${GOAL_DEMO_VIEW} real-money-leak=€${bWorst ? bWorst.money : 0}`,
  );
} catch (err) {
  if (process.exitCode !== 1) {
    console.error('FATAL:', err.message);
    process.exitCode = 1;
  }
} finally {
  await sql.end({ timeout: 5 });
}
