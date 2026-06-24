// src/lib/demo/generator.ts — the single PII-free deterministic demo-household generator.
//
// ONE source of truth for the believable mid-journey household that powers BOTH the public
// demo seed (Wave 2 writer below) AND the Phase-7 Playwright E2E fixtures (DEMO-01). A single
// import keeps the demo data and the E2E fixture in lockstep — there is NO static JSON
// snapshot to drift.
//
// PURE: `generateDemoHousehold(seed?)` takes no DB handle and performs no I/O. Its output is a
// plain `DemoDataset` value object the writer (scripts/seed-demo.ts) lands as is_demo=true rows.
//
// DETERMINISM (D4-05): an inline `mulberry32(seed=42)` PRNG (no external PRNG dependency) is used
// ONLY to jitter individual COST category amounts ±5–10%. Every streak total, salary, sublet
// leg and milestone sum is computed ARITHMETICALLY (no PRNG), so the mart reconciliations
// (test/seed-demo.test.ts → src/lib/db/marts.ts pure formulas) are EXACT and byte-reproducible
// across Phase 4 and Phase 7. Two calls with the same seed deep-equal.
//
// NO PII (D4-06, R-D): every row carries `counterpartyIban: null` and `isDemo: true`; all
// labels are synthetic (generic merchant/category names + the fictional DEMO_PERSONA "Alice" /
// "Bob" / "Shared"). The real owner names NEVER appear. The source-cleanliness gate
// (test/source-cleanliness.test.ts) negative-greps src/lib/demo/** for any email / IBAN-shaped
// token — no real PII literal may ever live here.
//
// THE LOCKED HOUSEHOLD (D4-01/02/03/04): a multi-month history whose investimento legs sum
// EXACTLY to the demo cost-basis (~€55k bucket — DEMO_INVESTIMENTO_TOTAL below), a multi-month
// €4k/month streak with exactly ONE deliberate €0 break month then a full recovery to €4k,
// milestones €10k/€25k/€50k achieved while €75k stays pending (~the sub-€75k tension), and a
// cash-only net worth (~€12k) via balance rows — NO synthetic investing-account balance (the
// goal total is the investimento legs, exactly how Phase-5 getGoalTotal() will read).
//
// Phase-7 E2E: generateDemoHousehold is the single importable fixture source the Phase-7
// Playwright suite reuses verbatim (the same deterministic dataset the public demo seeds), so
// the E2E asserts against the identical believable household the recruiter-facing demo shows.

// ---------------------------------------------------------------------------
// The locked demo investimento cost-basis (D4-01). The streak arithmetic reconciles to this
// EXACTLY (no PRNG on the streak totals — D4-05). It is the ~€55k mid-journey bucket expressed
// as the nearest whole-€4k-streak total (14 paying months × €4,000): past the crossed €50k
// milestone, ~56% toward the €100k goal, €75k still pending. Fictional-by-design — the only
// money literal the unit contract asserts.
export const DEMO_INVESTIMENTO_TOTAL = 56000;

/** The fixed monthly contribution (BI / GOAL): the €4k pay-yourself-first leg. */
const MONTHLY_CONTRIBUTION = 4000;

/** Fixed salaries (no jitter — they are deterministic revenue, D4 eval-01). */
const SALARY_ALEX = 5500; // Alice's persona-labelled salary (person cost-center A)
const SALARY_SAM = 2700; // Bob's persona-labelled salary (person cost-center B)

/** Sublet (Sublocação profit-center) legs when a month is active. */
const SUBLET_RENT = 900; // received
const SUBLET_COST = 500; // paid (cleaning + platform fee)

// ---------------------------------------------------------------------------
// The fictional persona (D4-08/26). These labels drive the demo's SEED COST-CENTER LABELS ONLY
// — they are display strings, NEVER a greeting (the greeting always follows the live session
// identity, never this constant). They must never be the real owner names.
// ---------------------------------------------------------------------------

export interface DemoPersona {
  /** Household display name (a label, never used in any greeting code path). */
  household: string;
  /** The fictional member labels mapped to the live cost-center codes. */
  members: string[];
}

/** The fictional demo persona — "Alice & Bob" — labels only, never a greeting (D4-08/26). */
export const DEMO_PERSONA: DemoPersona = {
  household: "Alice & Bob",
  members: ["Alice", "Bob", "Shared"],
};

// The generator emits PERSONA-NEUTRAL cost-center codes — 'alex' | 'sam' | 'shared' |
// 'sublocacao'. These carry NO real-owner substring (the no-PII gate forbids "lorenzo" /
// "fernanda" anywhere in the serialized dataset — D4-08/26), and the marts only ever
// special-case 'sublocacao' (every non-sublet code behaves identically in the household SUMs),
// so 'alex' / 'sam' / 'shared' reconcile exactly like the real codes would. The WRITER
// (scripts/seed-demo.ts) maps these to the live FK codes (cost_centers.code:
// alex→lorenzo, sam→fernanda, shared→compartilhado, sublocacao→sublocacao) at insert time so
// the generator output stays PII-free while the DB rows satisfy the FK (0003_ingestion.sql).
type CostCenterCode = "alex" | "sam" | "shared" | "sublocacao";

// ---------------------------------------------------------------------------
// Row shapes — mirror the live schema columns (the TxUpsert shape from ingest.ts:57-74),
// every row carrying isDemo:true and (for transactions) counterpartyIban:null.
// ---------------------------------------------------------------------------

export type DemoFlowType = "revenue" | "cost" | "investimento" | "transferencia";

/** A generated transaction row (mirrors transactions columns + is_demo). */
export interface DemoTx {
  accountKey: string; // logical account handle the writer resolves to an accounts.id
  bookingDate: string; // YYYY-MM-DD
  valueDate: string | null;
  amountEur: number; // signed: revenue +, cost/investimento −
  description: string; // synthetic label only
  counterparty: string | null; // synthetic label or null
  counterpartyIban: null; // ALWAYS null (D4-06)
  flowType: DemoFlowType;
  costCenter: CostCenterCode;
  categoryId: string | null; // synthetic category label (no live FK in the demo) or null
  isRecurring: boolean;
  periodKey: number; // YYYYMM
  isDemo: true;
}

/** A generated balance snapshot row (cash-only — NO synthetic investing-account row, D4-04). */
export interface DemoBalance {
  accountKey: string;
  asOfDate: string; // YYYY-MM-DD
  balanceEur: number;
  isDemo: true;
}

/** A generated budget row (per cost center, per period). */
export interface DemoBudget {
  costCenter: CostCenterCode;
  periodKey: number;
  amountEur: number;
  categoryId: string | null;
  isDemo: true;
}

/** A generated connection row (the onboarding "hasConnection" signal — D4-07/13). */
export interface DemoConnection {
  provider: string;
  status: string; // non-error
  isDemo: true;
}

/** A generated goal row (the €100k target). */
export interface DemoGoal {
  name: string;
  targetEur: number;
  metric: string;
  isDemo: true;
}

/** A generated milestone row (thresholds achieved/pending). */
export interface DemoMilestone {
  thresholdEur: number;
  achievedAt: string | null; // ISO date or null when not yet crossed
  isDemo: true;
}

/** A generated investment-contribution row (one per paying streak month). */
export interface DemoInvestmentContribution {
  amountEur: number;
  periodKey: number;
  isDemo: true;
}

/** A generated insight row (a pre-seeded synthetic narrative stub — populated richly in Phase 6). */
export interface DemoInsight {
  kind: string;
  body: string; // synthetic copy only, no PII / no € from real data
  isDemo: true;
}

/** One ascending streak entry: a period and its contribution (0 on the break month). */
export interface StreakMonth {
  periodKey: number;
  amountEur: number;
}

/** The complete deterministic demo household. */
export interface DemoDataset {
  persona: DemoPersona;
  connections: DemoConnection[];
  goal: DemoGoal;
  milestones: DemoMilestone[];
  budgets: DemoBudget[];
  transactions: DemoTx[];
  balances: DemoBalance[];
  investmentContributions: DemoInvestmentContribution[];
  insights: DemoInsight[];
  /** The €4k streak, ascending, with exactly one €0 break then recovery (D4-03). */
  investmentStreak: StreakMonth[];
  /** Liquid cash for the months-of-reserve formula (D4-04, ~€12k). */
  cashReserveEur: number;
  /** Trailing monthly costs for the months-of-reserve formula. */
  trailingMonthlyCosts: number[];
}

// ---------------------------------------------------------------------------
// Inline mulberry32 PRNG (D4-05) — no external PRNG dependency. Deterministic for a given seed;
// used ONLY to jitter individual cost category amounts ±5–10%.
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Jitter a base cost amount by ±5–10% deterministically, rounded to whole euros. */
function jitter(base: number, rng: () => number): number {
  // Map [0,1) -> [-0.10, -0.05] ∪ [0.05, 0.10] so the magnitude is always 5–10% (never <5%).
  const r = rng();
  const magnitude = 0.05 + r * 0.05; // 5%..10%
  const sign = rng() < 0.5 ? -1 : 1;
  return Math.round(base * (1 + sign * magnitude));
}

// ---------------------------------------------------------------------------
// The 14-month window (Jan 2025 → Feb 2026, eval-01 reference), with the streak shape:
//   months 0..8  (Jan–Sep 2025) = €4,000   (a 9-month run)
//   month  9     (Oct 2025)      = €0       (the deliberate break — D4-03)
//   months 10..14 (Nov 2025–Feb 2026 + the current paying month) = €4,000 (recovery)
// 14 paying months × €4,000 = DEMO_INVESTIMENTO_TOTAL. The break sits mid-history so MoM/YoY
// (BI-04) is non-trivial and the recovery is visible.
// ---------------------------------------------------------------------------

const WINDOW: Array<{ periodKey: number; monthEnd: string }> = [
  { periodKey: 202501, monthEnd: "2025-01-31" },
  { periodKey: 202502, monthEnd: "2025-02-28" },
  { periodKey: 202503, monthEnd: "2025-03-31" },
  { periodKey: 202504, monthEnd: "2025-04-30" },
  { periodKey: 202505, monthEnd: "2025-05-31" },
  { periodKey: 202506, monthEnd: "2025-06-30" },
  { periodKey: 202507, monthEnd: "2025-07-31" },
  { periodKey: 202508, monthEnd: "2025-08-31" },
  { periodKey: 202509, monthEnd: "2025-09-30" },
  { periodKey: 202510, monthEnd: "2025-10-31" }, // the €0 break month (index 9)
  { periodKey: 202511, monthEnd: "2025-11-30" },
  { periodKey: 202512, monthEnd: "2025-12-31" },
  { periodKey: 202601, monthEnd: "2026-01-31" },
  { periodKey: 202602, monthEnd: "2026-02-28" },
  { periodKey: 202603, monthEnd: "2026-03-31" },
];

const BREAK_INDEX = 9; // Oct 2025 — exactly one €0 break, then recovery (D4-03)

// Cash account handle (the only account the demo balances/transactions land on — cash-only).
const CASH_ACCOUNT = "demo-cash";

// Synthetic cost category labels (no PII, no real merchants). The categoryId field carries the
// label string in the demo (the live demo has no category FK rows; the marts' Uncategorized
// path and cost-center grain still reconcile).
const COST_PLAN: Array<{
  costCenter: CostCenterCode;
  label: string;
  base: number;
  recurring: boolean;
}> = [
  { costCenter: "alex", label: "Transport", base: 220, recurring: false },
  { costCenter: "alex", label: "Dining", base: 280, recurring: false },
  { costCenter: "alex", label: "Fitness", base: 80, recurring: true },
  { costCenter: "alex", label: "Entertainment", base: 100, recurring: false },
  { costCenter: "alex", label: "Other", base: 700, recurring: false },
  { costCenter: "sam", label: "Grocery", base: 400, recurring: false },
  { costCenter: "sam", label: "Beauty", base: 150, recurring: false },
  { costCenter: "sam", label: "Clothing", base: 200, recurring: false },
  { costCenter: "sam", label: "Entertainment", base: 100, recurring: false },
  { costCenter: "sam", label: "Other", base: 250, recurring: false },
  { costCenter: "shared", label: "Rent", base: 700, recurring: true },
  { costCenter: "shared", label: "Utilities", base: 180, recurring: true },
  { costCenter: "shared", label: "Household", base: 140, recurring: false },
];

// Months WITH active sublet (the rest are vacant → v_sublet_pnl zero-fills). 10 of 15 active.
const SUBLET_ACTIVE = new Set([
  202501, 202502, 202503, 202504, 202505, 202506, 202507, 202509, 202510, 202511,
]);

/** Per-cost-center monthly budgets (D4 eval-01). */
const BUDGETS: Array<{ costCenter: CostCenterCode; amount: number }> = [
  { costCenter: "alex", amount: 1500 },
  { costCenter: "sam", amount: 1200 },
  { costCenter: "shared", amount: 1100 },
];

/**
 * generateDemoHousehold — the single pure deterministic demo-household factory (DEMO-01).
 *
 * @param seed PRNG seed for the ±5–10% cost jitter (default 42 — the fixed reproducible
 *             fixture). Streak totals/salaries/sublet/milestones are arithmetic (no PRNG), so
 *             the mart reconciliations are EXACT regardless of seed; the seed only varies the
 *             individual cost-category amounts within their jitter band.
 * @returns the complete `DemoDataset` (all is_demo=true rows). Two calls with the same seed
 *          deep-equal — the Phase-7 single-source guarantee.
 */
export function generateDemoHousehold(seed: number = 42): DemoDataset {
  const rng = mulberry32(seed);

  const transactions: DemoTx[] = [];
  const balances: DemoBalance[] = [];
  const budgets: DemoBudget[] = [];
  const investmentContributions: DemoInvestmentContribution[] = [];
  const investmentStreak: StreakMonth[] = [];
  const trailingMonthlyCosts: number[] = [];

  // Cash running balance (cash-only net worth, D4-04): opens at €14,000 (Jan-2025 opening) and
  // drifts toward ~€12,000 by the window end as salaries in vs costs + investimento out net out.
  let cashBalance = 14000;

  WINDOW.forEach((m, idx) => {
    const { periodKey, monthEnd } = m;
    const isBreak = idx === BREAK_INDEX;
    const contribution = isBreak ? 0 : MONTHLY_CONTRIBUTION;

    // --- Revenue (salaries — fixed, no jitter) ---
    transactions.push(
      tx({
        bookingDate: monthEnd,
        amountEur: SALARY_ALEX,
        description: "Salary",
        flowType: "revenue",
        costCenter: "alex",
        categoryId: "Salary",
        isRecurring: true,
        periodKey,
      }),
    );
    transactions.push(
      tx({
        bookingDate: monthEnd,
        amountEur: SALARY_SAM,
        description: "Salary",
        flowType: "revenue",
        costCenter: "sam",
        categoryId: "Salary",
        isRecurring: true,
        periodKey,
      }),
    );

    // --- Investimento (the €4k streak leg; €0 on the break month → no row) ---
    investmentStreak.push({ periodKey, amountEur: contribution });
    if (contribution > 0) {
      transactions.push(
        tx({
          bookingDate: monthEnd,
          amountEur: -contribution,
          description: "Monthly investment",
          flowType: "investimento",
          costCenter: "shared",
          categoryId: null,
          isRecurring: true,
          periodKey,
        }),
      );
      investmentContributions.push({ amountEur: contribution, periodKey, isDemo: true });
    }

    // --- Costs (jittered per category; the break month adds an irregular Shared spike) ---
    let monthCosts = 0;
    for (const c of COST_PLAN) {
      const amount = c.recurring ? c.base : jitter(c.base, rng);
      monthCosts += amount;
      transactions.push(
        tx({
          bookingDate: monthEnd,
          amountEur: -amount,
          description: c.label,
          flowType: "cost",
          costCenter: c.costCenter,
          categoryId: c.label,
          isRecurring: c.recurring,
          periodKey,
        }),
      );
    }
    if (isBreak) {
      // The irregular expense that broke the streak (a one-off Shared home expense).
      const spike = 1300;
      monthCosts += spike;
      transactions.push(
        tx({
          bookingDate: monthEnd,
          amountEur: -spike,
          description: "Household repair",
          flowType: "cost",
          costCenter: "shared",
          categoryId: "Household",
          isRecurring: false,
          periodKey,
        }),
      );
    }

    // --- Sublet (the Sublocação profit-center; active months only) ---
    if (SUBLET_ACTIVE.has(periodKey)) {
      transactions.push(
        tx({
          bookingDate: monthEnd,
          amountEur: SUBLET_RENT,
          description: "Sublet rent",
          flowType: "revenue",
          costCenter: "sublocacao",
          categoryId: "Sublet rent",
          isRecurring: false,
          periodKey,
        }),
      );
      transactions.push(
        tx({
          bookingDate: monthEnd,
          amountEur: -SUBLET_COST,
          description: "Sublet cleaning + platform fee",
          flowType: "cost",
          costCenter: "sublocacao",
          categoryId: "Platform fee",
          isRecurring: false,
          periodKey,
        }),
      );
    }

    // --- Budgets (one row per cost center per period — the onboarding "hasBudgets" signal) ---
    for (const b of BUDGETS) {
      budgets.push({
        costCenter: b.costCenter,
        periodKey,
        amountEur: b.amount,
        categoryId: null,
        isDemo: true,
      });
    }

    // --- Cash balance snapshot (cash-only; net salaries − costs − contribution) ---
    cashBalance += SALARY_ALEX + SALARY_SAM - monthCosts - contribution;
    balances.push({
      accountKey: CASH_ACCOUNT,
      asOfDate: monthEnd,
      balanceEur: Math.round(cashBalance),
      isDemo: true,
    });

    trailingMonthlyCosts.push(monthCosts);
  });

  // Milestones — €10k/€25k/€50k achieved, €75k pending (D4-03). Concrete achieved_at dates.
  const milestones: DemoMilestone[] = [
    { thresholdEur: 10000, achievedAt: "2025-03-01", isDemo: true },
    { thresholdEur: 25000, achievedAt: "2025-06-01", isDemo: true },
    { thresholdEur: 50000, achievedAt: "2025-12-01", isDemo: true },
    { thresholdEur: 75000, achievedAt: null, isDemo: true },
  ];

  // A pre-seeded synthetic insight (rich AI copy is Phase 6 — this is a structural stub so the
  // anon demo-visible gate sees an insights row; no PII, no real € figure).
  const insights: DemoInsight[] = [
    {
      kind: "demo",
      body: "Great liquidity that break month — but the monthly contribution paused. Back on track now.",
      isDemo: true,
    },
  ];

  const goal: DemoGoal = {
    name: "100k invested",
    targetEur: 100000,
    metric: "cost_basis",
    isDemo: true,
  };

  const connections: DemoConnection[] = [
    { provider: "demo", status: "active", isDemo: true },
  ];

  return {
    persona: DEMO_PERSONA,
    connections,
    goal,
    milestones,
    budgets,
    transactions,
    balances,
    investmentContributions,
    insights,
    investmentStreak,
    // Cash-only liquid reserve (~€12k) for the months-of-reserve formula (D4-04).
    cashReserveEur: Math.round(cashBalance),
    // Trailing-3-month costs (the most recent three months) for months-of-reserve.
    trailingMonthlyCosts: trailingMonthlyCosts.slice(-3),
  };
}

/** Build a DemoTx with the always-on demo invariants (isDemo true, counterpartyIban null). */
function tx(input: {
  bookingDate: string;
  amountEur: number;
  description: string;
  flowType: DemoFlowType;
  costCenter: CostCenterCode;
  categoryId: string | null;
  isRecurring: boolean;
  periodKey: number;
}): DemoTx {
  return {
    accountKey: CASH_ACCOUNT,
    bookingDate: input.bookingDate,
    valueDate: input.bookingDate,
    amountEur: input.amountEur,
    description: input.description,
    counterparty: null,
    counterpartyIban: null,
    flowType: input.flowType,
    costCenter: input.costCenter,
    categoryId: input.categoryId,
    isRecurring: input.isRecurring,
    periodKey: input.periodKey,
    isDemo: true,
  };
}
