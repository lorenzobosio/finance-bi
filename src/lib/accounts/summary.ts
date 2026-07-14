// src/lib/accounts/summary.ts — the PURE latest-per-account read shaper (ACC-01, D-01/D-02).
//
// This is the TS mirror of the `v_account_summary` SQL (RESEARCH: `row_number() over (partition by
// account_id, is_demo order by as_of_date desc)`): the app can either read the view directly OR
// re-derive the same pick from the raw `balances` rows, and the two can NEVER diverge because both
// obey this one function. The frozen contract lives in test/account-summary.test.ts (08-01 RED).
//
// THE #1 correctness invariant (the is_demo chokepoint): a demo snapshot must NEVER feed a real
// account's summary and vice-versa. Every pick below filters snapshots to the requested partition
// FIRST, so demo↔real can never cross even when a stray snapshot shares an account_id.
//
// PURE: no DB, no clock, no next/headers — node-testable like partitionByDemo.

/** An account row carrying its partition flag + the virtual-account marker (Pitfall 8). */
export interface AccountRow {
  account_id: string;
  name: string;
  is_demo: boolean;
  is_investment: boolean;
}

/** A daily CLBD balance snapshot for one account, in one partition. */
export interface BalanceSnapshot {
  account_id: string;
  as_of_date: string;
  balance_eur: number;
  is_demo: boolean;
}

/** The picked per-account summary: the latest CLBD balance, or null when the account has none. */
export interface AccountSummary {
  account_id: string;
  name: string;
  is_investment: boolean;
  current_balance: number | null;
}

/** One point of the ascending-by-date mini-trend series for a single account partition. */
export interface SparklinePoint {
  date: string;
  value: number;
}

/**
 * summarizeAccounts — the latest-per-account pick, partition-isolated.
 *
 * Given the accounts and the raw balance snapshots (both partitions may be present), returns ONE
 * summary per account in the requested `isDemo` partition, each carrying the balance of its MAX
 * `as_of_date` snapshot (from the SAME partition only). An account with no matching snapshot yields
 * a null `current_balance` (the virtual Investing account — its card value is substituted from the
 * Goal engine in 08-03, Pitfall 8).
 */
export function summarizeAccounts(
  accounts: AccountRow[],
  snapshots: BalanceSnapshot[],
  isDemo: boolean,
): AccountSummary[] {
  // Partition the snapshots FIRST — a wrong-partition snapshot can never win a pick (the chokepoint).
  const partitionSnaps = snapshots.filter((s) => s.is_demo === isDemo);

  return accounts
    .filter((a) => a.is_demo === isDemo)
    .map((a) => {
      const latest = pickLatest(partitionSnaps, a.account_id);
      return {
        account_id: a.account_id,
        name: a.name,
        is_investment: a.is_investment,
        current_balance: latest === null ? null : latest.balance_eur,
      };
    });
}

/** The MAX-as_of_date snapshot for one account within an already-partitioned set, or null. */
function pickLatest(
  partitionSnaps: BalanceSnapshot[],
  accountId: string,
): BalanceSnapshot | null {
  let latest: BalanceSnapshot | null = null;
  for (const s of partitionSnaps) {
    if (s.account_id !== accountId) continue;
    if (latest === null || s.as_of_date > latest.as_of_date) latest = s;
  }
  return latest;
}

/**
 * toSparklineSeries — the ascending-by-date `{date, value}[]` mini-trend for ONE account partition.
 * Filters to the requested partition + account, then sorts oldest → newest (the Sparkline island
 * expects chronological points). Demo↔real never cross (partition-isolated like the pick above).
 */
export function toSparklineSeries(
  snapshots: BalanceSnapshot[],
  accountId: string,
  isDemo: boolean,
): SparklinePoint[] {
  return snapshots
    .filter((s) => s.is_demo === isDemo && s.account_id === accountId)
    .slice()
    .sort((a, b) => (a.as_of_date < b.as_of_date ? -1 : a.as_of_date > b.as_of_date ? 1 : 0))
    .map((s) => ({ date: s.as_of_date, value: s.balance_eur }));
}
