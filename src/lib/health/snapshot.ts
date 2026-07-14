// src/lib/health/snapshot.ts — the PURE Pattern-2 snapshot builder + the AI-04 PII FIREWALL.
//
// THE load-bearing invariant (AI-04): `buildInsightSnapshot` is the SINGLE object the AI model ever
// sees. It is a PURE builder over ALREADY-COMPUTED aggregates only — the caller injects the mart
// rows (as `kpis`/`pnl`/`goal`), the `assembleScorecard` output, and the `detectAnomalies` flags;
// this module performs NO I/O, no clock, no DB import, and carries NO raw-`transactions` field
// (entry_reference / counterparty / booking_date / description / iban / remittance). Raw
// transactions are therefore structurally unreachable from the model's input — the code-level wall
// that gives the token cap + the (future) cost cap + the PII firewall together (RESEARCH Pattern 2).
//
// The types are deliberately STRUCTURAL/loose (band/tone as string, basis optional) so BOTH the
// strongly-typed reader (`scripts/insight-snapshot.ts`, which passes the real `Scorecard`/`Flag[]`)
// AND the pure unit test's synthetic literal satisfy the same contract. Synthetic € only; no PII.

/** The comparability window: the current period, its predecessor, and the (optional) launch gate. */
export interface SnapshotPeriod {
  current: number;
  previous: number | null;
  launchDate: string | null;
}

/** The 4 headline KPIs (from `v_home_kpis`) — aggregates only, no row-grain field. */
export interface SnapshotKpis {
  revenue: number;
  costs: number;
  investimento: number;
  result: number;
  margin: number | null;
}

/** One period's P&L row (from `v_pnl_monthly`) — aggregates only. */
export interface SnapshotPnlRow {
  revenue: number;
  costs: number;
  investimento: number;
  subletNet: number;
  result: number;
}

/** The current + previous P&L rows (the MoM comparison the `whats_changed` memo narrates). */
export interface SnapshotPnl {
  current: SnapshotPnlRow;
  previous: SnapshotPnlRow | null;
}

/** The €100k-progress aggregates (from `getGoalTotal` — the Wealth cost basis, D5-02). */
export interface SnapshotGoal {
  wealthCostBasis: number;
  pctTo100k: number;
  growthMoM: number;
}

/** One resolved scorecard metric read — structurally loose so the real `MetricRead` is assignable. */
export interface SnapshotMetricRead {
  value: number | null;
  band: string;
  tone: string;
  /** Only investmentGrowth carries a basis (D-08 contributions, never market). */
  basis?: string;
}

/** The five narrated scorecard reads (the `assembleScorecard` output; HEALTH-02). */
export interface SnapshotScorecard {
  savingsRate: SnapshotMetricRead;
  monthsOfReserve: SnapshotMetricRead;
  budgetAdherence: SnapshotMetricRead;
  investmentGrowth: SnapshotMetricRead;
  streak: SnapshotMetricRead;
}

/** One deterministic overspend flag (the `detectAnomalies` `Flag` shape) — scope, never a name/IBAN. */
export interface SnapshotAnomaly {
  scope: string;
  actual: number;
  budget: number;
  remaining: number;
  onPace: boolean;
}

/** The full aggregate input the caller assembles from the marts + the pure helpers. */
export interface InsightSnapshotInputs {
  period: SnapshotPeriod;
  kpis: SnapshotKpis;
  pnl: SnapshotPnl;
  goal: SnapshotGoal;
  scorecard: SnapshotScorecard;
  anomalies: SnapshotAnomaly[];
}

/** The bounded Pattern-2 snapshot — the ONLY object the model sees (AI-04). */
export interface InsightSnapshot {
  period: SnapshotPeriod;
  kpis: SnapshotKpis;
  pnl: SnapshotPnl;
  goal: SnapshotGoal;
  scorecard: SnapshotScorecard;
  anomalies: SnapshotAnomaly[];
}

/** The small anomalies cap that keeps every prose run tiny (bounded token/cost). */
export const MAX_SNAPSHOT_ANOMALIES = 3;

/**
 * buildInsightSnapshot — assemble the bounded Pattern-2 JSON `{ period, kpis, pnl, goal, scorecard,
 * anomalies }` from already-computed aggregates (AI-04). PURE: no I/O, no clock, no recompute — a
 * passthrough that only BOUNDS the anomalies to the top `MAX_SNAPSHOT_ANOMALIES` (the detector
 * already ordered them worst-first). Carries NO raw-transaction field, so raw `transactions` is
 * structurally unreachable from the model's input — the code-level PII firewall.
 */
export function buildInsightSnapshot(inputs: InsightSnapshotInputs): InsightSnapshot {
  return {
    period: inputs.period,
    kpis: inputs.kpis,
    pnl: inputs.pnl,
    goal: inputs.goal,
    scorecard: inputs.scorecard,
    anomalies: inputs.anomalies.slice(0, MAX_SNAPSHOT_ANOMALIES),
  };
}
