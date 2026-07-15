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
//
// PHASE-5 EXTENSION (GOAL-04/07/08/10, D5-16): the demo now also carries a fully-alive
// POST-LAUNCH journey. An early `household.launchDate` opens the game over the whole history; a
// few SURPLUS (>€4.000) transfer months spill past the €4k Wealth cap so the allocation waterfall
// funds Brazil (€200/mo) and Adventures, and a €10.000 Wealth gate RELEASES an Adventures-small
// tranche (spendable > 0). The bucket balances + level celebrations are DERIVED by folding the
// generated transfers through the SAME pure engine (`src/lib/goal/allocation.ts`) —
// correctness-by-construction, never hand-typed. The break-and-recover €4k streak (D4-03) is
// preserved untouched; the €100k-progress Wealth figure stays €56.000 (surplus spills to the
// life-goal buckets, not Wealth), so €50k stays crossed and €75k stays pending.

// The pure allocation engine — the demo folds its OWN generated transfers through this SAME fold
// so the seeded bucket balances / tranche unlocks / level events are believable by construction
// (the seed-demo contract asserts the folded outcome, not a hand-typed number).
import {
  allocate,
  foldAllocation,
  spendableAdventuresSmall,
  EMPTY_STATE,
  type AllocationEvent,
  type BucketState,
} from "@/lib/goal/allocation";
import { LEVEL_STEP_EUR, WEALTH_ISIN } from "@/lib/goal/constants";

// ---------------------------------------------------------------------------
// The demo TOTAL-INVESTED cost-basis across ALL buckets (D4-01, extended by Plan-09). The streak
// arithmetic reconciles to this EXACTLY (no PRNG on the streak totals — D4-05): 12 paying months ×
// €4.000 + 2 SURPLUS months × €8.000 = €64.000 total invested. Of this, the €100k-progress WEALTH
// cost-basis is €56.000 (each paying month contributes min(transfer, €4.000) to Wealth — the
// surplus spills into Brazil/Adventures, never Wealth): past the crossed €50k milestone, ~56%
// toward the €100k goal, €75k still pending. Fictional-by-design — the money literal the unit
// contract asserts as `sumInvestimento` (the whole investimento leg, i.e. total invested).
export const DEMO_INVESTIMENTO_TOTAL = 64000;

// The WEALTH cost-basis == the €100k-progress figure (getGoalTotal): Σ min(transfer, €4.000) over
// paying months = 14 × €4.000. NEVER equal to DEMO_INVESTIMENTO_TOTAL after buckets (that is the
// larger total-across-all-buckets; conflating them is the locked anti-pattern — RESEARCH Pitfall 1).
export const DEMO_WEALTH_TOTAL = 56000;

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
// 'brazil' / 'adventures' are the REAL bucket cost-center codes (seeded in 0014, like cost_centers);
// they carry no PII, so the writer maps them to themselves. They tag the demo's discretionary bucket
// SPEND so the Brazil/Adventures pages + the v_bucket_spend mart render tagged spend (GOAL-13).
type CostCenterCode =
  | "alex"
  | "sam"
  | "shared"
  | "sublocacao"
  | "brazil"
  | "adventures";

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

/** A generated recurring-series row (FLOW-01, mirrors `recurring_series`). PII-free by construction:
 *  persona-neutral merchant labels (no real merchant / IBAN / owner name), is_demo=true. `cadence`
 *  = 'weekly' | 'monthly' | 'yearly'; `nextDate` is anchored INSIDE the calendar's 60-day / the
 *  projection's 6-month windows (measured from DEMO_NOW_ISO = 2026-03-31) so the anon demo renders
 *  populated with ZERO external calls (Pitfall 2). `isIncome` lanes a salary income series apart from
 *  a bill (D-08). `category` is the optional per-series taxonomy label (A6) — null for the income leg. */
export interface DemoRecurringSeries {
  seriesKey: string; // stable cluster key (persona-neutral) — confirm/dismiss idempotency
  label: string; // synthetic merchant/bill label only (no PII)
  amountEur: number; // positive magnitude
  cadence: "weekly" | "monthly" | "yearly";
  nextDate: string; // YYYY-MM-DD, anchored inside the demo windows
  status: "active"; // the demo seeds only confirmed-active series
  category: string | null; // optional taxonomy label (null for the income leg)
  isIncome: boolean; // D-08: income series (salary) vs a bill
  isDemo: true;
}

/** A generated ETF price row (ETF-01, mirrors `prices` 0019). PII-free by construction: instrument
 *  ISIN + date + numeric close + quote currency only (no email / IBAN / owner name — D-08), is_demo=true.
 *  The demo series is ASCENDING (a calm rising USD close ~100 → ~130 across the demo months) so units ×
 *  latest close > cost basis → a positive but calm P/L (D-07). `priceDate` aligns to the demo's
 *  contribution month-ends so the units derivation finds a near-period on-or-before close for every leg
 *  (no bootstrap gap — Pitfall 2). `currency` is the ETF quote ccy (USD for the MVP instrument). */
export interface DemoPrice {
  isin: string; // the pinned WEALTH_ISIN
  priceDate: string; // YYYY-MM-DD, aligned to a demo contribution month-end
  close: number; // per-unit close (positive, ascending)
  currency: string; // 'USD' — the ETF quote ccy
  isDemo: true;
}

/** A generated FX reference-rate row (ETF-03 / BRL-01, mirrors `fx_rates` 0020). PII-free by
 *  construction: base + quote + date + numeric rate only, is_demo=true. quote-per-EUR (base 'EUR';
 *  A5) so the demo renders EUR≈USD/BRL with ZERO external call (D-07). */
export interface DemoFxRate {
  base: string; // 'EUR'
  quote: string; // 'USD' | 'BRL'
  rateDate: string; // YYYY-MM-DD
  rate: number; // quote-per-EUR (positive)
  isDemo: true;
}

/** A generated cash-flow projection month (FLOW-04, the balance-forward position the demo chart
 *  renders). `opening` steps from the prior month's `close`; all rows are `isProjected: true` (the
 *  projection is forward of the demo's latest data month — the dashed "Expected" segment, D-10). */
export interface DemoCashflowProjection {
  periodKey: number; // YYYYMM
  opening: number;
  close: number;
  isProjected: boolean;
}

/** A generated insight row (a pre-seeded synthetic narrative stub — populated richly in Phase 6). */
export interface DemoInsight {
  kind: string;
  body: string; // synthetic copy only, no PII / no € from real data
  isDemo: true;
}

/** A reconciliation-ledger flag (mirrors `reconciliation_flags`, D-01). The public demo is authored
 *  FULLY-RECONCILED — the non-shame demo (DAT-01/02): the data-trust chip reads "All reconciled ✓",
 *  never "N discrepancies — review". So the generator seeds ZERO open flags. Any flag it ever emits
 *  MUST be `status: "resolved"` and `isDemo: true`; NO PII (numeric deltas + period + kind only). */
export interface DemoReconciliationFlag {
  periodKey: number;
  kind: string; // 'balance_delta' | 'mart_vs_ledger'
  expectedEur: number;
  actualEur: number;
  deltaEur: number;
  status: "resolved"; // NEVER "open" in the demo — the non-shame invariant
  isDemo: true;
}

/** One ascending streak entry: a period and its contribution (0 on the break month). */
export interface StreakMonth {
  periodKey: number;
  amountEur: number;
}

/** The singleton household settings row (D5-01/17). DEMO-BEARING — the demo renders launch_date
 *  + the shared "why". `launchDate` is EARLY (window start) so the whole journey is post-launch. */
export interface DemoHousehold {
  launchDate: string; // YYYY-MM-DD (early — the demo journey is fully post-launch)
  why: string; // shared editable statement — synthetic, no PII
  epicTripActive: boolean;
  isDemo: true;
}

/** A once-only celebration row (GOAL-11, D5-14). DEMO-BEARING. Kind is 'level' | 'milestone' |
 *  'streak_best'; the level rows are DERIVED from the folded €10k Wealth-gate crossings. */
export interface DemoGoalEvent {
  kind: string;
  threshold: number | null;
  periodKey: number | null;
  achievedAt: string; // ISO timestamp
  dedupeKey: string; // unique per (dedupeKey, isDemo)
  seen: boolean; // recorded trophy — already played (no confetti replay on the public demo)
  isDemo: true;
}

/** A per-transfer manual split (D5-04). DEMO-BEARING but MAY be empty for the demo (the demo's
 *  splits are all the automatic waterfall — no manual override to showcase). Kept as a typed,
 *  empty surface so the writer + future E2E can populate it without a shape change. */
export interface DemoTransferOverride {
  transactionDedupeHash: string; // the writer resolves this to the transaction_id FK
  wealthEur: number;
  brazilEur: number;
  advSmallEur: number;
  advBigEur: number;
  isDemo: true;
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
  /** The reconciliation ledger surface (DAT-01/02). The public demo is authored FULLY-RECONCILED —
   *  the non-shame demo: ZERO open flags, so this is empty (the data-trust chip reads "All
   *  reconciled ✓"). Any flag ever seeded here is `status: "resolved"`, `isDemo: true`, PII-free. */
  reconciliationFlags: DemoReconciliationFlag[];
  /** The €4k streak, ascending, with exactly one €0 break then recovery (D4-03). */
  investmentStreak: StreakMonth[];
  /** Liquid cash for the months-of-reserve formula (D4-04, ~€12k). */
  cashReserveEur: number;
  /** Trailing monthly costs for the months-of-reserve formula. */
  trailingMonthlyCosts: number[];
  // --- Phase-5 goal-journey surface (GOAL-04/07/08/10, D5-16) ---
  /** The demo household settings (early launch_date + shared why). DEMO-BEARING. */
  household: DemoHousehold;
  /** Once-only celebrations — level crossings DERIVED from the fold + a milestone + best-streak. */
  goalEvents: DemoGoalEvent[];
  /** Per-transfer manual splits — empty for the demo (all splits are the automatic waterfall). */
  transferOverrides: DemoTransferOverride[];
  /** The final bucket balances FOLDED from the generated transfers through the pure engine
   *  (correctness-by-construction, never hand-typed): Brazil > 0, an unlocked Adventures-small
   *  tranche > 0, Wealth == DEMO_WEALTH_TOTAL. */
  bucketState: BucketState;
  /** The SPENDABLE Adventures-small amount (the unlocked tranche only, D5-11) at the fold's end. */
  adventuresSmallSpendableEur: number;
  // --- Phase-9 cashflow-forecasting surface (FLOW-01/04, D-11) ---
  /** The PII-free `active` recurring series the anon /cashflow demo renders (managed list + bills
   *  calendar): persona-neutral bill labels + ≥1 salary income leg (isIncome=true), next_date anchored
   *  inside the demo windows so the calendar/projection land on data. is_demo=true, zero external call. */
  recurringSeries: DemoRecurringSeries[];
  /** The 6-month balance-forward cash-flow projection the demo chart renders (all isProjected=true). */
  cashflowProjection: DemoCashflowProjection[];
  // --- Phase-12 ETF-valuation + multicurrency surface (ETF-01/03, BRL-01, D-07) ---
  /** The PII-free ascending demo ETF price series (isin=WEALTH_ISIN, USD, is_demo=true) the anon /goal
   *  demo reads to render market value + P/L ALIVE with ZERO external call. One close per demo month,
   *  aligned to the contribution month-ends (no bootstrap gap — Pitfall 2). */
  priceSeries: DemoPrice[];
  /** The PII-free static demo FX rates (EUR/USD + EUR/BRL, quote-per-EUR, is_demo=true) the anon /goal
   *  demo reads to render the EUR≈BRL remittance ALIVE with ZERO external call. */
  fxRates: DemoFxRate[];
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
// The 15-month window (Jan 2025 → Mar 2026, eval-01 reference), with the streak shape:
//   months 0..8  (Jan–Sep 2025) = €4,000, EXCEPT two SURPLUS months (Feb + Jun 2025) = €8,000
//   month  9     (Oct 2025)      = €0       (the deliberate break — D4-03)
//   months 10..14 (Nov 2025–Mar 2026) = €4,000 (recovery)
// 12 paying months × €4,000 + 2 surplus months × €8,000 = €64,000 = DEMO_INVESTIMENTO_TOTAL
// (total invested across all buckets). Each paying month still contributes min(transfer, €4,000)
// = the €56,000 Wealth cost-basis (DEMO_WEALTH_TOTAL); the €4,000 surplus in each surplus month
// spills through the waterfall into Brazil/Adventures and its accrual is RELEASED at the next €10k
// Wealth gate → a funded Brazil balance + an unlocked Adventures-small tranche (GOAL-07/08/10). The
// break sits mid-history so MoM/YoY (BI-04) is non-trivial and the recovery is visible.
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

// The SURPLUS transfer months (Feb + Jun 2025): the couple invested €8,000 instead of the €4,000
// pay-yourself-first cap. Only the first €4,000 reaches Wealth (the €100k engine); the €4,000
// surplus spills through the waterfall (Brazil €200 → Adventures 50/50), and the accrued
// Adventures-small LOCKED tranche is RELEASED at the next €10k Wealth gate → spendable > 0.
const SURPLUS_MONTHS = new Set<number>([202502, 202506]);
const SURPLUS_CONTRIBUTION = 8000;

// The EARLY demo launch date (D5-16): the window START, so the ENTIRE journey is post-launch and
// the streak/waterfall/celebrations all run over the full history (the real app stays pre-launch).
const DEMO_LAUNCH_DATE = "2025-01-01";

// The shared "why" statement (PERS-04, D5-01/17). Synthetic — no PII, no @, no owner name.
const DEMO_WHY =
  "Build a €100.000 safety base first, then fund Brazil visits and shared adventures.";

// Discretionary bucket SPEND (GOAL-13, D5-09): a couple of late-window transactions tagged to the
// Brazil / Adventures cost-centers so the bucket pages + the v_bucket_spend mart render tagged
// spend. Each amount is well under its folded bucket balance (Brazil €400 / Adventures-small
// unlocked €3,800) so the rendered balances stay positive. These are COST legs (never investimento
// → they do not touch the streak, the €4k total, or the Wealth cost-basis).
const BUCKET_SPEND: Array<{
  periodKey: number;
  costCenter: "brazil" | "adventures";
  label: string;
  amount: number;
}> = [
  // Brazil: two distinct believable labels so the Brazil pie reads as real categories, not one slice
  // (G4/VIZ-01). Sum €270 stays well under the folded Brazil balance (~€400) so the bucket reads healthy.
  { periodKey: 202601, costCenter: "brazil", label: "Flights", amount: 150 },
  { periodKey: 202602, costCenter: "brazil", label: "Hotels", amount: 120 },
  // Adventures: one clearly-labelled trip so its donut renders a named slice (G4). €300 « €3.800 spendable.
  { periodKey: 202602, costCenter: "adventures", label: "Europe trip", amount: 300 },
];

// Cash account handle (the only account the demo balances/transactions land on — cash-only).
const CASH_ACCOUNT = "demo-cash";

// ---------------------------------------------------------------------------
// Phase-9 cashflow-forecasting demo surface (FLOW-01/04, D-11). The PII-free `active` recurring
// series that light up the anon /cashflow demo (managed list + bills calendar + safe-to-spend) with
// ZERO external calls. Persona-neutral labels only (no real merchant / IBAN / owner name — the
// no-PII gate greps the serialized dataset). next_date is anchored to APRIL 2026 so it lands inside
// BOTH the calendar's 60-day and the projection's 6-month windows measured from DEMO_NOW_ISO
// (2026-03-31, the demo's latest data month) — Pitfall 2 (a wall-clock/off-window anchor renders the
// demo dead). ≥1 salary INCOME series (isIncome=true) is laned apart from the bills (D-08).
const DEMO_RECURRING_SERIES: DemoRecurringSeries[] = [
  {
    seriesKey: "demo-salary",
    label: "Monthly Salary",
    amountEur: SALARY_ALEX + SALARY_SAM, // 8200 — the combined household income leg
    cadence: "monthly",
    nextDate: "2026-04-30",
    status: "active",
    category: null, // income legs carry no cost taxonomy
    isIncome: true, // D-08: the income lane
    isDemo: true,
  },
  {
    seriesKey: "demo-housing",
    label: "Rent",
    amountEur: 700,
    cadence: "monthly",
    nextDate: "2026-04-01",
    status: "active",
    category: "Housing",
    isIncome: false,
    isDemo: true,
  },
  {
    seriesKey: "demo-utilities",
    label: "Utilities",
    amountEur: 180,
    cadence: "monthly",
    nextDate: "2026-04-05",
    status: "active",
    category: "Utilities",
    isIncome: false,
    isDemo: true,
  },
  {
    seriesKey: "demo-streaming",
    label: "Streaming Service",
    amountEur: 80,
    cadence: "monthly",
    nextDate: "2026-04-15",
    status: "active",
    category: "Entertainment",
    isIncome: false,
    isDemo: true,
  },
];

// The projection horizon: 6 months forward of the demo's latest data month (202603). The first
// projected month is Apr 2026. A monthly discretionary estimate rounds out the balance-forward step
// (income − recurring bills − the €4k pay-yourself-first contribution − discretionary).
const DEMO_PROJECTION_HORIZON = 6;
const DEMO_PROJECTION_START_PERIOD = 202604; // Apr 2026 — the first month past DEMO_NOW_ISO
const DEMO_MONTHLY_DISCRETIONARY = 2500; // a plausible flat discretionary lane (synthetic)

/** Advance a YYYYMM period key by one month (Dec → next-year Jan). */
function nextPeriodKey(periodKey: number): number {
  const year = Math.floor(periodKey / 100);
  const month = periodKey % 100;
  return month === 12 ? (year + 1) * 100 + 1 : periodKey + 1;
}

/** Build the 6-month balance-forward projection (FLOW-04) the demo chart renders. Deterministic —
 *  pure arithmetic over the seeded recurring series + the fixed contribution, opening at the demo's
 *  closing cash reserve. Every month is isProjected=true (forward of the latest data month, D-10). */
function buildDemoProjection(openingCashEur: number): DemoCashflowProjection[] {
  const monthlyIncome = DEMO_RECURRING_SERIES.filter((s) => s.isIncome).reduce(
    (acc, s) => acc + s.amountEur,
    0,
  );
  const monthlyRecurringOutflows = DEMO_RECURRING_SERIES.filter((s) => !s.isIncome).reduce(
    (acc, s) => acc + s.amountEur,
    0,
  );
  const monthlyNet =
    monthlyIncome - monthlyRecurringOutflows - MONTHLY_CONTRIBUTION - DEMO_MONTHLY_DISCRETIONARY;

  const rows: DemoCashflowProjection[] = [];
  let opening = Math.round(openingCashEur);
  let periodKey = DEMO_PROJECTION_START_PERIOD;
  for (let i = 0; i < DEMO_PROJECTION_HORIZON; i++) {
    const close = opening + monthlyNet;
    rows.push({ periodKey, opening, close, isProjected: true });
    opening = close;
    periodKey = nextPeriodKey(periodKey);
  }
  return rows;
}

// Synthetic cost category labels (no PII, no real merchants). The categoryId field carries the
// label string in the demo (the live demo has no category FK rows; the marts' Uncategorized
// path and cost-center grain still reconcile).
const COST_PLAN: Array<{
  costCenter: CostCenterCode;
  label: string;
  base: number;
  recurring: boolean;
}> = [
  // Labels aligned to the seeded taxonomy (Groceries / Utilities / Transport / Entertainment /
  // Dining Out / Housing / Shopping / Travel / Other) so the seed writer reuses the existing
  // categories rows instead of creating near-duplicates (G4 — labels ONLY; every base / recurring
  // flag / row count is unchanged, so monthCosts, the cash balance, and the jitter stay identical).
  { costCenter: "alex", label: "Transport", base: 220, recurring: false },
  { costCenter: "alex", label: "Dining Out", base: 280, recurring: false },
  { costCenter: "alex", label: "Entertainment", base: 80, recurring: true },
  { costCenter: "alex", label: "Entertainment", base: 100, recurring: false },
  { costCenter: "alex", label: "Other", base: 700, recurring: false },
  { costCenter: "sam", label: "Groceries", base: 400, recurring: false },
  { costCenter: "sam", label: "Shopping", base: 150, recurring: false },
  { costCenter: "sam", label: "Shopping", base: 200, recurring: false },
  { costCenter: "sam", label: "Entertainment", base: 100, recurring: false },
  { costCenter: "sam", label: "Other", base: 250, recurring: false },
  { costCenter: "shared", label: "Housing", base: 700, recurring: true },
  { costCenter: "shared", label: "Utilities", base: 180, recurring: true },
  { costCenter: "shared", label: "Housing", base: 140, recurring: false },
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

// ---------------------------------------------------------------------------
// Phase-12 ETF-valuation + multicurrency demo surface (ETF-01/03, BRL-01, D-07). A PII-free ascending
// ETF price series + static ECB-style FX rates so the anon /goal demo renders market value + P/L +
// EUR≈BRL remittance ALIVE with ZERO external call. The series is keyed to the pinned WEALTH_ISIN and
// quoted in USD; each close aligns to a WINDOW month-end so the units derivation (12-04) finds an
// on-or-before close for every contribution leg (no bootstrap gap — Pitfall 2). The rising close
// (~100 → ~130) keeps market value > cost basis → a positive but calm P/L.
const DEMO_PRICE_BASE_USD = 100; // the first demo month's per-unit close
const DEMO_PRICE_STEP_USD = 2; // a calm +$2/month rise (≈+30% over the 15-month window)

// Static demo FX rates (quote-per-EUR, A5) — synthetic, close to real ECB reference values. Emitted at
// the two most recent demo month-ends so latestRate (12-03) has a newest-date to select.
const DEMO_FX_EUR_USD = 1.14;
const DEMO_FX_EUR_BRL = 5.84;

/** Build the ascending PII-free demo ETF price series (one close per WINDOW month-end, keyed to the
 *  pinned WEALTH_ISIN, USD). Ascending so units × latest close > cost basis → a calm positive P/L. */
function buildDemoPriceSeries(): DemoPrice[] {
  return WINDOW.map((m, idx) => ({
    isin: WEALTH_ISIN,
    priceDate: m.monthEnd,
    close: DEMO_PRICE_BASE_USD + idx * DEMO_PRICE_STEP_USD,
    currency: "USD",
    isDemo: true as const,
  }));
}

/** Build the static PII-free demo FX rates (EUR/USD + EUR/BRL, quote-per-EUR) at the two most recent
 *  demo month-ends so latestRate selects the newest date (last-known fallback still resolves). */
function buildDemoFxRates(): DemoFxRate[] {
  const dates = WINDOW.slice(-2).map((m) => m.monthEnd); // [2026-02-28, 2026-03-31]
  const rows: DemoFxRate[] = [];
  for (const rateDate of dates) {
    rows.push({ base: "EUR", quote: "USD", rateDate, rate: DEMO_FX_EUR_USD, isDemo: true });
    rows.push({ base: "EUR", quote: "BRL", rateDate, rate: DEMO_FX_EUR_BRL, isDemo: true });
  }
  return rows;
}

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
    // The break month is €0; a surplus month invests €8,000; every other paying month €4,000.
    const contribution = isBreak
      ? 0
      : SURPLUS_MONTHS.has(periodKey)
        ? SURPLUS_CONTRIBUTION
        : MONTHLY_CONTRIBUTION;

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

    // --- Discretionary bucket SPEND (GOAL-13, D5-09): Brazil / Adventures tagged cost legs ---
    for (const bs of BUCKET_SPEND) {
      if (bs.periodKey !== periodKey) continue;
      monthCosts += bs.amount;
      transactions.push(
        tx({
          bookingDate: monthEnd,
          amountEur: -bs.amount,
          description: bs.label,
          flowType: "cost",
          costCenter: bs.costCenter,
          categoryId: bs.label,
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

  // Authored PII-free demo insights (AI-05, Phase 6): the demo voice is ALIVE with ZERO model call.
  // Three hand-written rows in the owner's warm, true, non-shame CFO-memo tone — a weekly_report (the
  // lead voice), a whats_changed monthly MoM note, and one non-shame overspend flag. Synthetic copy
  // only: no @, no IBAN-shaped token, no real-owner name, no € tied to real data (the figures echo the
  // demo's own locked narrative — ~56% to €100k, the €4k streak, the crossed €50k milestone).
  const insights: DemoInsight[] = [
    {
      kind: "weekly_report",
      body:
        "You're about 44 thousand from the 100k invested goal, and this month behaved like a healthy business: four thousand went to future-you before anything else, and the operating margin stayed positive. The cash reserve still covers more than seven months of costs. A steady, calm week — keep the rhythm going.",
      isDemo: true,
    },
    {
      kind: "whats_changed",
      body:
        "Compared with last month, revenue held steady while shared costs eased a little, nudging the margin up. The four-thousand contribution landed on schedule again, so the invested total keeps climbing past the fifty-thousand milestone toward the next one. Nothing needs your attention this month.",
      isDemo: true,
    },
    {
      kind: "overspend",
      body:
        "One flag worth a glance: the shared cost center ran a bit ahead of its budget this month. It looks like a normal seasonal bump rather than a problem, and everything else stayed comfortably inside its lines. Worth a quick look together next week, nothing more.",
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

  // --- The goal-journey surface (GOAL-04/07/08/10, D5-16): DERIVE the bucket balances + the level
  // celebrations by FOLDING the generated transfers through the SAME pure engine the app reads
  // (correctness-by-construction — never hand-typed). The seed-demo contract asserts THIS fold. ---
  const household: DemoHousehold = {
    launchDate: DEMO_LAUNCH_DATE,
    why: DEMO_WHY,
    epicTripActive: false,
    isDemo: true,
  };
  const { goalEvents, bucketState, milestones } = deriveGoalJourney(investmentStreak);
  const transferOverrides: DemoTransferOverride[] = []; // no manual split to showcase (all waterfall)

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
    // The public demo is authored FULLY-RECONCILED (DAT-01/02): the non-shame demo seeds ZERO
    // open flags so the data-trust chip reads "All reconciled ✓". Emitting an empty ledger here is
    // the correct clean/zero reconciliation state (the schema comment: the demo "seeds NONE").
    reconciliationFlags: [],
    investmentStreak,
    // Cash-only liquid reserve (~€12k) for the months-of-reserve formula (D4-04).
    cashReserveEur: Math.round(cashBalance),
    // Trailing-3-month costs (the most recent three months) for months-of-reserve.
    trailingMonthlyCosts: trailingMonthlyCosts.slice(-3),
    household,
    goalEvents,
    transferOverrides,
    bucketState,
    adventuresSmallSpendableEur: spendableAdventuresSmall(bucketState),
    // The Phase-9 cashflow demo surface (FLOW-01/04, D-11): PII-free active series + the
    // balance-forward projection opening at the demo's closing cash reserve. ZERO external calls.
    recurringSeries: DEMO_RECURRING_SERIES,
    cashflowProjection: buildDemoProjection(cashBalance),
    // The Phase-12 ETF-valuation + multicurrency demo surface (ETF-01/03, BRL-01, D-07): an ascending
    // priced ETF series + static EUR/USD + EUR/BRL rates so the anon /goal renders market value + P/L +
    // remittance ALIVE with ZERO external call. All is_demo=true, PII-free (numeric/date/isin/ccy only).
    priceSeries: buildDemoPriceSeries(),
    fxRates: buildDemoFxRates(),
  };
}

/** Map a YYYYMM period key to a booking date (the 15th) — the deterministic ordering key the fold
 *  uses; the 15th keeps every transfer strictly after the `2025-01-01` launch gate. */
function periodKeyToTransferDate(periodKey: number): string {
  const year = Math.floor(periodKey / 100);
  const month = String(periodKey % 100).padStart(2, "0");
  return `${year}-${month}-15`;
}

/** Map a YYYYMM period key to its month-end ISO timestamp (the celebration's achieved_at). */
function periodKeyToAchievedAt(periodKey: number): string {
  const entry = WINDOW.find((w) => w.periodKey === periodKey);
  const date = entry ? entry.monthEnd : periodKeyToTransferDate(periodKey);
  return `${date}T12:00:00.000Z`;
}

/**
 * Fold the demo's monthly investimento transfers through the pure allocation engine to DERIVE both
 * the final {@link BucketState} (Brazil > 0, an unlocked Adventures-small tranche > 0, Wealth ==
 * DEMO_WEALTH_TOTAL) AND the once-only `level` celebrations (one per €10k Wealth gate crossed).
 * Correctness-by-construction: the seeded balances are the engine's output, not a hand-typed guess.
 * A `milestone` (the crossed €50k headline) and a `streak_best` (the pre-break run length) round out
 * the trophy case. Every event is `seen: true` (a recorded trophy — the public demo never replays
 * confetti on load).
 */
// The named milestone ladder the trophy shelf renders (D5-18). Their achieved_at dates are DERIVED
// from the SAME fold the ladder walks so the ladder rung and the trophy seal show ONE reached-month
// (G2 — the UAT caught the €50k ladder "Feb 2026" disagreeing with a hand-typed trophy "Dec 2025").
const MILESTONE_THRESHOLDS = [10000, 25000, 50000, 75000] as const;

function deriveGoalJourney(streak: StreakMonth[]): {
  goalEvents: DemoGoalEvent[];
  bucketState: BucketState;
  milestones: DemoMilestone[];
} {
  // Build the ordered transfer events (post-launch, > €0) — the exact shape the fold consumes and
  // the seed-demo contract rebuilds from `investmentStreak`.
  const transfers: AllocationEvent[] = streak
    .filter((m) => m.amountEur > 0)
    .map((m) => ({
      kind: "transfer" as const,
      amount: m.amountEur,
      bookingDate: periodKeyToTransferDate(m.periodKey),
    }));

  // Step the fold month-by-month to detect each newly-crossed €10k Wealth gate (a `level` event).
  const goalEvents: DemoGoalEvent[] = [];
  let state: BucketState = { ...EMPTY_STATE };
  let milestone50Period: number | null = null;
  // The FIRST paying period whose running Wealth reaches each named milestone (G2/D5-18). Derived
  // from the same fold, so the milestone achieved_at can never disagree with the ladder crossing.
  const milestoneCrossedAt = new Map<number, number>();
  for (const m of streak) {
    if (m.amountEur <= 0) continue;
    const before = Math.floor(state.wealth / LEVEL_STEP_EUR);
    state = allocate(m.amountEur, state);
    const after = Math.floor(state.wealth / LEVEL_STEP_EUR);
    for (const threshold of MILESTONE_THRESHOLDS) {
      if (!milestoneCrossedAt.has(threshold) && state.wealth >= threshold) {
        milestoneCrossedAt.set(threshold, m.periodKey);
      }
    }
    for (let gate = before + 1; gate <= after; gate++) {
      const threshold = gate * LEVEL_STEP_EUR;
      goalEvents.push({
        kind: "level",
        threshold,
        periodKey: m.periodKey,
        achievedAt: periodKeyToAchievedAt(m.periodKey),
        dedupeKey: `level:${threshold}`,
        seen: true,
        isDemo: true,
      });
      if (threshold === 50000) milestone50Period = m.periodKey;
    }
  }

  // The named-milestone rows with fold-derived achieved_at (truthy when crossed, null otherwise —
  // €75k stays pending, preserving the sub-€75k tension / fact 3). Same-month as the ladder rung (G2).
  const milestones: DemoMilestone[] = MILESTONE_THRESHOLDS.map((threshold) => {
    const period = milestoneCrossedAt.get(threshold);
    return {
      thresholdEur: threshold,
      achievedAt: period !== undefined ? periodKeyToAchievedAt(period) : null,
      isDemo: true,
    };
  });

  // The final state MUST equal foldAllocation over the same events (the fold IS the balance) — this
  // ties the derivation to the canonical engine entry-point the app + the contract use.
  const bucketState = foldAllocation(transfers, { launchDate: DEMO_LAUNCH_DATE });

  // The crossed €50k milestone celebration (the headline milestone — distinct dedupe_key from the
  // level event at the same threshold so both partitions/kinds coexist under the composite unique).
  if (milestone50Period !== null) {
    goalEvents.push({
      kind: "milestone",
      threshold: 50000,
      periodKey: milestone50Period,
      achievedAt: periodKeyToAchievedAt(milestone50Period),
      dedupeKey: "milestone:50000",
      seen: true,
      isDemo: true,
    });
  }

  // The best streak run BEFORE the break (D4-03) — the longest consecutive paying-month run.
  const bestRun = longestPayingRun(streak);
  if (bestRun.length > 0) {
    goalEvents.push({
      kind: "streak_best",
      threshold: bestRun.length,
      periodKey: bestRun.lastPeriodKey,
      achievedAt: periodKeyToAchievedAt(bestRun.lastPeriodKey),
      dedupeKey: `streak_best:${bestRun.length}`,
      seen: true,
      isDemo: true,
    });
  }

  return { goalEvents, bucketState, milestones };
}

/** The longest consecutive run of paying (≥ €4,000) streak months + the period it ends on. */
function longestPayingRun(streak: StreakMonth[]): {
  length: number;
  lastPeriodKey: number;
} {
  let best = 0;
  let bestLastPeriodKey = streak.length > 0 ? streak[0].periodKey : 0;
  let run = 0;
  for (const m of streak) {
    if (m.amountEur >= MONTHLY_CONTRIBUTION) {
      run += 1;
      if (run > best) {
        best = run;
        bestLastPeriodKey = m.periodKey;
      }
    } else {
      run = 0;
    }
  }
  return { length: best, lastPeriodKey: bestLastPeriodKey };
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
