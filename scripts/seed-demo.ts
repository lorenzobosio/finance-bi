// scripts/seed-demo.ts
//
// The PII-free demo SEED writer (DEMO-01, D4-18). Lands the deterministic household produced by
// `generateDemoHousehold()` (src/lib/demo/generator.ts) into the LIVE DB as is_demo=true rows so
// the public demo surface (anon, RLS `using (is_demo = true)`) renders an alive, emotional
// mid-journey household — past €50k, ~56% to €100k, a €4k streak with one break-and-recover.
//
// CONTRACT, in one breath:
//   import the pure generator -> open a postgres-driver connection (DATABASE_URL) -> in ONE
//   transaction: DELETE every is_demo=true row (+ the synthetic demo account/member) so a re-run
//   adds ZERO net rows (idempotent, D4-18) -> INSERT a demo member + demo account (the FK parents
//   transactions/balances need; accounts/members carry NO is_demo column, so they are matched for
//   cleanup by the synthetic `gsd-demo-` name marker) -> INSERT is_demo=true rows into ALL the
//   demo-bearing tables (transactions, balances, budgets, goals, milestones,
//   investment_contributions, insights, connections + the Phase-5 goal-journey tables household,
//   goal_events, transfer_overrides) so the anon demo-VISIBLE gate (test/rls.demo.assert.mjs) sees
//   >= 1 demo row per demo-visible table (household/goal_events among them) and getOnboardingState
//   resolves complete:true in demo mode (D4-07) -> log COUNTS ONLY -> release the connection in
//   finally. transfer_overrides is demo-bearing but MAY be empty for the demo (all-waterfall splits).
//
// DB WRITES use the `postgres` driver via DATABASE_URL — the project's Node-side DB pattern,
// mirroring scripts/ingest.ts / scripts/eb-connect.ts. It deliberately avoids the supabase-js
// server client (its `import "server-only"` throws outside an RSC build and it eagerly inits a
// Realtime WebSocket Node lacks) and the privileged Supabase key (FND-03 write-plane discipline:
// the public bundle must never carry the write plane). A direct DB connection runs as the
// connection role (bypasses RLS — the privilege the seed needs to write is_demo=true rows).
//
// SERVER-PLANE ONLY (FND-03): never imported into the Next app/client bundle. Logs ONLY counts
// (V7) — never a € value, a label, a description, or the connection string.
//
// COST-CENTER MAPPING: the generator emits PII-free persona-neutral codes (alex/sam/shared) so
// its serialized output carries no real-owner substring (D4-08/26). This writer maps them to the
// live cost_centers(code) FK values (alex→lorenzo, sam→fernanda, shared→compartilhado,
// sublocacao→sublocacao) at insert time so the DB rows satisfy the FK (0003_ingestion.sql).
//
// GATING: run ONLY after the Wave-1 migrate checkpoint + the anon no-leak direction of
// `pnpm test:rls:demo` are green (the is_demo column + mart partition + anon RLS must already be
// live, 04-02). It is the operator-run step of this plan's [BLOCKING] checkpoint.

import { createHash } from "node:crypto";

import {
  generateDemoHousehold,
  type DemoDataset,
} from "@/lib/demo/generator";

/** Map the generator's persona-neutral cost-center code to the live cost_centers(code) FK. The
 *  bucket codes 'brazil'/'adventures' are REAL cost_centers rows (seeded in 0014) with no PII, so
 *  they map to themselves — they tag the demo's discretionary bucket spend (GOAL-13). */
const COST_CENTER_FK: Record<string, string> = {
  alex: "lorenzo",
  sam: "fernanda",
  shared: "compartilhado",
  sublocacao: "sublocacao",
  brazil: "brazil",
  adventures: "adventures",
};

/** The synthetic name marker for the demo member (members carry no is_demo column, so it is matched
 *  for the idempotent cleanup by this exact name). No PII. */
const DEMO_MEMBER_NAME = "gsd-demo-member";

/** The synthetic name PREFIX every demo account shares (ACC-01). accounts NOW carries is_demo (0017),
 *  so the cleanup matches on is_demo=true; the prefix is the belt-and-braces net that also catches a
 *  pre-0017 demo account (seeded before the column existed → is_demo=false default). No PII. */
const DEMO_ACCOUNT_PREFIX = "gsd-demo-account";

/** The 4 persona-neutral demo accounts the public /accounts demo renders (D-01 card set: two person
 *  cards, a Shared card, an Investing card). PERSONA-NEUTRAL synthetic names (no real owner name, no
 *  IBAN): the rendered LABEL is remapped from `default_cost_center` via costCenterDisplayName in demo
 *  mode (lorenzo→Alice, fernanda→Bob, compartilhado→Shared), so the DB row carries a valid FK code
 *  while the anon surface shows the anonymized persona. `costCenterCode` is a GENERATOR code
 *  (alex/sam/shared) mapped through COST_CENTER_FK to the live FK — so no real-owner substring is
 *  written into this seed file. The Investing account is the only is_investment=true one and gets NO
 *  balance snapshot (its card value is the accumulated cost basis, substituted by the Goal engine in
 *  08-03, Pitfall 8). `balanceShare` distributes the aggregate demo net worth across the 3 cash
 *  accounts (shares sum to 1.0 so the per-month total — and thus v_balance_trend/v_home_kpis — is
 *  UNCHANGED); the Investing account has no share (null). */
const DEMO_ACCOUNTS: ReadonlyArray<{
  nameSuffix: string;
  costCenterCode: string;
  isInvestment: boolean;
  balanceShare: number | null;
}> = [
  { nameSuffix: "personal-a", costCenterCode: "alex", isInvestment: false, balanceShare: 0.35 },
  { nameSuffix: "personal-b", costCenterCode: "sam", isInvestment: false, balanceShare: 0.25 },
  { nameSuffix: "shared", costCenterCode: "shared", isInvestment: false, balanceShare: 0.4 },
  { nameSuffix: "investing", costCenterCode: "shared", isInvestment: true, balanceShare: null },
];

/** The account the demo TRANSACTIONS attach to (the shared/primary account — the cards read
 *  v_account_summary/balances, not transactions, so a single carrier account is sufficient and keeps
 *  the mart account-grain breakdown stable). */
const PRIMARY_ACCOUNT_SUFFIX = "shared";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === "") {
    throw new Error(
      `Missing required env var ${name}. Load .env.local first: \`set -a; . ./.env.local; set +a\``,
    );
  }
  return v;
}

/** A deterministic, synthetic dedupe_hash for a demo transaction (NOT NULL + UNIQUE column).
 *  Derived from the row's stable fields so re-running the generator yields the same hashes; the
 *  pre-run DELETE WHERE is_demo=true removes the prior rows so the UNIQUE constraint never trips. */
function demoDedupeHash(parts: string): string {
  return "demo-" + createHash("sha256").update(parts).digest("hex").slice(0, 24);
}

export interface SeedCounts {
  member: number;
  account: number;
  connections: number;
  goals: number;
  milestones: number;
  budgets: number;
  transactions: number;
  balances: number;
  investmentContributions: number;
  insights: number;
  household: number;
  goalEvents: number;
  transferOverrides: number;
}

/**
 * Seed the demo household idempotently. Accepts an optional pre-built dataset (the default is the
 * deterministic generator output) so a future test can inject a fixture without a live DB.
 */
export async function seedDemo(
  dataset: DemoDataset = generateDemoHousehold(),
): Promise<SeedCounts> {
  const postgres = (await import("postgres")).default;
  const sql = postgres(requireEnv("DATABASE_URL"), { max: 1, onnotice: () => {} });

  const counts: SeedCounts = {
    member: 0,
    account: 0,
    connections: 0,
    goals: 0,
    milestones: 0,
    budgets: 0,
    transactions: 0,
    balances: 0,
    investmentContributions: 0,
    insights: 0,
    household: 0,
    goalEvents: 0,
    transferOverrides: 0,
  };

  try {
    await sql.begin(async (tx) => {
      // --- 1. Idempotent pre-run guard: remove every prior demo row (D4-18). ---
      // The 8 demo-bearing tables carry is_demo; delete those rows. transactions must go before
      // its FK children (investment_contributions.transaction_id) — but those are demo rows too,
      // so delete the children first.
      await tx`delete from public.investment_contributions where is_demo = true`;
      await tx`delete from public.insights where is_demo = true`;
      await tx`delete from public.milestones where is_demo = true`;
      await tx`delete from public.goals where is_demo = true`;
      await tx`delete from public.budgets where is_demo = true`;
      await tx`delete from public.balances where is_demo = true`;
      // transfer_overrides.transaction_id FKs a demo transaction — delete it BEFORE transactions.
      await tx`delete from public.transfer_overrides where is_demo = true`;
      await tx`delete from public.transactions where is_demo = true`;
      await tx`delete from public.connections where is_demo = true`;
      // The Phase-5 goal-journey demo-bearing singletons/events (no FK into transactions).
      await tx`delete from public.goal_events where is_demo = true`;
      await tx`delete from public.household where is_demo = true`;
      // The demo accounts (ACC-01): after 0017 they carry is_demo=true — delete on it, plus the
      // name-prefix net that also catches a pre-0017 demo account (is_demo=false default). The member
      // carries no is_demo column — match its exact synthetic name. Accounts go before the member
      // (accounts.member_id FK) and after their transactions/balances (deleted above as is_demo rows).
      await tx`delete from public.accounts where is_demo = true or name like ${DEMO_ACCOUNT_PREFIX + "%"}`;
      await tx`delete from public.members where display_name = ${DEMO_MEMBER_NAME}`;

      // --- 2. FK parents the demo facts need: a synthetic member + cash account. ---
      const [member] = await tx`
        insert into public.members (display_name) values (${DEMO_MEMBER_NAME})
        returning id`;
      counts.member = 1;
      const memberId = member.id as string;

      // The 4 persona-neutral demo accounts (ACC-01, D-01 card set). is_demo=true (0017) so the anon
      // demo policy surfaces them; the Investing account is is_investment=true. Names are synthetic
      // (prefix + suffix); the rendered label is remapped from default_cost_center in demo mode.
      const accountIds = new Map<string, string>();
      for (const acc of DEMO_ACCOUNTS) {
        const [row] = await tx`
          insert into public.accounts (member_id, name, kind, default_cost_center, currency, is_investment, is_demo)
          values (
            ${memberId},
            ${DEMO_ACCOUNT_PREFIX + "-" + acc.nameSuffix},
            ${acc.isInvestment ? "investment" : "cash"},
            ${COST_CENTER_FK[acc.costCenterCode]},
            ${"EUR"},
            ${acc.isInvestment},
            ${true}
          )
          returning id`;
        accountIds.set(acc.nameSuffix, row.id as string);
        counts.account += 1;
      }
      // The primary/shared account the transactions attach to (the cards read balances, not txns).
      const accountId = accountIds.get(PRIMARY_ACCOUNT_SUFFIX) as string;

      // --- 3. connections (the onboarding "hasConnection" signal — D4-07/13). ---
      for (const c of dataset.connections) {
        await tx`
          insert into public.connections (provider, status, is_demo)
          values (${c.provider}, ${c.status}, ${c.isDemo})`;
        counts.connections += 1;
      }

      // --- 4. goal + milestones (milestones.goal_id FK -> goals.id). ---
      const [goal] = await tx`
        insert into public.goals (name, target_eur, metric, is_demo)
        values (${dataset.goal.name}, ${dataset.goal.targetEur}, ${dataset.goal.metric}, ${dataset.goal.isDemo})
        returning id`;
      counts.goals = 1;
      const goalId = goal.id as string;

      for (const m of dataset.milestones) {
        await tx`
          insert into public.milestones (goal_id, threshold_eur, achieved_at, is_demo)
          values (${goalId}, ${m.thresholdEur}, ${m.achievedAt}, ${m.isDemo})`;
        counts.milestones += 1;
      }

      // --- 5. budgets (the onboarding "hasBudgets" signal — one row per cost center/period). ---
      for (const b of dataset.budgets) {
        await tx`
          insert into public.budgets (cost_center, period_key, amount_eur, category_id, is_demo)
          values (${COST_CENTER_FK[b.costCenter]}, ${b.periodKey}, ${b.amountEur}, ${b.categoryId}, ${b.isDemo})`;
        counts.budgets += 1;
      }

      // --- 6. transactions (the onboarding "hasTransactions" signal — the alive household). ---
      // G4: resolve a real categories.id for demo COST rows so the category donuts render believable
      // labels instead of all-"Uncategorized". Idempotent — reuses an existing row by NAME (the
      // seeded taxonomy) and only inserts genuinely-new discretionary labels (group 'desire'). Because
      // the pre-run DELETE clears only is_demo rows and this reuses categories by name, re-seeding
      // never duplicates categories (T-05-10-03). Counts-only logging — a label is NEVER logged (V7).
      const categoryIdCache = new Map<string, string>();
      const resolveCategoryId = async (name: string): Promise<string> => {
        const cached = categoryIdCache.get(name);
        if (cached) return cached;
        const [existing] = await tx`
          select id from public.categories where name = ${name} limit 1`;
        if (existing) {
          categoryIdCache.set(name, existing.id as string);
          return existing.id as string;
        }
        const [inserted] = await tx`
          insert into public.categories (name, "group") values (${name}, ${"desire"})
          returning id`;
        categoryIdCache.set(name, inserted.id as string);
        return inserted.id as string;
      };

      let txIndex = 0;
      for (const t of dataset.transactions) {
        const hash = demoDedupeHash(
          `${txIndex}|${t.bookingDate}|${t.amountEur}|${t.flowType}|${t.costCenter}|${t.description}`,
        );
        txIndex += 1;
        // Only COST rows carrying a generator category label get a real FK; revenue/investimento
        // rows stay null (they are cost-center-grain, not category-grain — matches the marts).
        const categoryId =
          t.flowType === "cost" && t.categoryId !== null
            ? await resolveCategoryId(t.categoryId)
            : null;
        await tx`
          insert into public.transactions (
            account_id, booking_date, value_date, amount_eur, description,
            counterparty, counterparty_iban, flow_type, cost_center, category_id,
            dedupe_hash, is_recurring, status, is_demo
          ) values (
            ${accountId}, ${t.bookingDate}, ${t.valueDate}, ${t.amountEur}, ${t.description},
            ${t.counterparty}, ${t.counterpartyIban}, ${t.flowType}, ${COST_CENTER_FK[t.costCenter]}, ${categoryId},
            ${hash}, ${t.isRecurring}, ${"BOOK"}, ${t.isDemo}
          )`;
        counts.transactions += 1;
      }

      // --- 7. balances (cash-only net worth — D4-04). Distribute each monthly snapshot across the 3
      //         cash accounts by a fixed share (shares sum to 1.0 → the per-month TOTAL net worth,
      //         and thus v_balance_trend/v_home_kpis, is UNCHANGED — the split is purely per-account
      //         presentation for the /accounts cards). The Investing account gets NO snapshot (its
      //         card value is the Goal-engine cost basis, Pitfall 8). Integer split: the last cash
      //         account absorbs the rounding remainder so the parts sum EXACTLY to the aggregate. ---
      const cashAccounts = DEMO_ACCOUNTS.filter((a) => a.balanceShare !== null);
      for (const bal of dataset.balances) {
        let allocated = 0;
        for (let i = 0; i < cashAccounts.length; i++) {
          const acc = cashAccounts[i];
          const isLast = i === cashAccounts.length - 1;
          const share = isLast
            ? bal.balanceEur - allocated
            : Math.round(bal.balanceEur * (acc.balanceShare as number));
          allocated += share;
          await tx`
            insert into public.balances (account_id, as_of_date, balance_eur, is_demo)
            values (${accountIds.get(acc.nameSuffix) as string}, ${bal.asOfDate}, ${share}, ${bal.isDemo})`;
          counts.balances += 1;
        }
      }

      // --- 8. investment_contributions (one per paying streak month). ---
      for (const ic of dataset.investmentContributions) {
        await tx`
          insert into public.investment_contributions (amount_eur, period_key, member_id, is_demo)
          values (${ic.amountEur}, ${ic.periodKey}, ${memberId}, ${ic.isDemo})`;
        counts.investmentContributions += 1;
      }

      // --- 9. insights (synthetic pre-seeded copy — rich AI voice is Phase 6). ---
      for (const ins of dataset.insights) {
        await tx`
          insert into public.insights (kind, body, is_demo)
          values (${ins.kind}, ${ins.body}, ${ins.isDemo})`;
        counts.insights += 1;
      }

      // --- 10. household (D5-01/17): the demo-visible launch_date + shared "why" singleton. The
      //         anon demo-visible RLS direction (rls.demo.assert) requires >= 1 is_demo=true row. ---
      {
        const h = dataset.household;
        await tx`
          insert into public.household (launch_date, why, epic_trip_active, is_demo)
          values (${h.launchDate}, ${h.why}, ${h.epicTripActive}, ${h.isDemo})`;
        counts.household = 1;
      }

      // --- 11. goal_events (GOAL-11): the once-only celebrations DERIVED from the fold (level
      //         crossings + the €50k milestone + best-streak). Demo-visible; unique per
      //         (dedupe_key, is_demo) so the demo partition never collides with the real one. ---
      for (const ge of dataset.goalEvents) {
        await tx`
          insert into public.goal_events
            (kind, threshold, period_key, achieved_at, dedupe_key, seen, is_demo)
          values
            (${ge.kind}, ${ge.threshold}, ${ge.periodKey}, ${ge.achievedAt}, ${ge.dedupeKey}, ${ge.seen}, ${ge.isDemo})`;
        counts.goalEvents += 1;
      }

      // --- 12. transfer_overrides (D5-04): per-transfer manual splits. EMPTY for the demo (all its
      //         splits are the automatic waterfall) — the loop is a no-op, but resolves the
      //         transaction_id FK by the synthetic dedupe_hash if a future dataset populates it. ---
      for (const to of dataset.transferOverrides) {
        const hash = demoDedupeHash(to.transactionDedupeHash);
        const [row] = await tx`
          select id from public.transactions where dedupe_hash = ${hash} limit 1`;
        if (!row) continue; // no matching demo transfer — skip (defensive; empty for the demo)
        await tx`
          insert into public.transfer_overrides
            (transaction_id, wealth_eur, brazil_eur, adv_small_eur, adv_big_eur, is_demo)
          values
            (${row.id as string}, ${to.wealthEur}, ${to.brazilEur}, ${to.advSmallEur}, ${to.advBigEur}, ${to.isDemo})`;
        counts.transferOverrides += 1;
      }
    });

    return counts;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

// Only seed when executed directly (`pnpm seed:demo` / `tsx scripts/seed-demo.ts`). When IMPORTED
// (a future test), seedDemo must NOT auto-run. CJS `require.main === module` is the portable
// direct-run check (same convention as scripts/ingest.ts / scripts/eb-connect.ts).
const invokedDirectly = typeof require !== "undefined" && require.main === module;

if (invokedDirectly) {
  seedDemo()
    .then((c) => {
      // Counts ONLY (V7) — never a € value, a label, or a description.
      console.log(
        `[seed-demo] member=${c.member} account=${c.account} connections=${c.connections} ` +
          `goals=${c.goals} milestones=${c.milestones} budgets=${c.budgets} ` +
          `transactions=${c.transactions} balances=${c.balances} ` +
          `investment_contributions=${c.investmentContributions} insights=${c.insights} ` +
          `household=${c.household} goal_events=${c.goalEvents} transfer_overrides=${c.transferOverrides}`,
      );
      process.exit(0);
    })
    .catch((err) => {
      console.error(`[seed-demo] fatal: ${err instanceof Error ? err.name : "UnknownError"}`);
      process.exit(1);
    });
}
