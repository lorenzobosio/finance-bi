import { describe, expect, it } from "vitest";

// Wave-0 TDD RED (ACC-01, D-01/D-02) — freezes the PURE latest-per-account contract for the
// not-yet-existent `@/lib/accounts/summary` (built GREEN in 08-02, the pure mirror of the
// `v_account_summary` SQL). RED at RUNTIME only; the import specifier is COMPUTED so `tsc --noEmit`
// stays green while the module is absent (STATE.md 07-01 KEY MECHANISM).
//
// The view picks the latest CLBD balance per account per partition (RESEARCH: `row_number() over
// (partition by account_id, is_demo order by as_of_date desc)`). This suite pins that same pick as a
// pure TS function so the SQL and the app never diverge:
//   - the max as_of_date snapshot per (account_id, is_demo) partition wins;
//   - a demo snapshot NEVER feeds a real account's summary and vice-versa (the is_demo chokepoint);
//   - an account with NO snapshot yields a null current balance (the Investing/virtual account —
//     its card value is substituted from the Goal engine in 08-03, Pitfall 8).
//
// Synthetic € only; no PII.

const MODULE = "@/lib/accounts/summary";

interface AccountRow {
  account_id: string;
  name: string;
  is_demo: boolean;
  is_investment: boolean;
}

interface BalanceSnapshot {
  account_id: string;
  as_of_date: string;
  balance_eur: number;
  is_demo: boolean;
}

interface AccountSummary {
  account_id: string;
  name: string;
  is_investment: boolean;
  current_balance: number | null;
}

interface SummaryModule {
  summarizeAccounts: (
    accounts: AccountRow[],
    snapshots: BalanceSnapshot[],
    isDemo: boolean,
  ) => AccountSummary[];
}

async function load(): Promise<SummaryModule> {
  const mod = (await import(/* @vite-ignore */ MODULE)) as Record<string, unknown>;
  return { summarizeAccounts: mod.summarizeAccounts as SummaryModule["summarizeAccounts"] };
}

function byId(rows: AccountSummary[], id: string): AccountSummary {
  const r = rows.find((x) => x.account_id === id);
  if (!r) throw new Error(`no summary for ${id}`);
  return r;
}

describe("account-summary — latest-per-account pick (ACC-01)", () => {
  it("selects the snapshot with the MAX as_of_date per account", async () => {
    const { summarizeAccounts } = await load();
    const accounts: AccountRow[] = [
      { account_id: "a", name: "Lorenzo", is_demo: false, is_investment: false },
    ];
    const snaps: BalanceSnapshot[] = [
      { account_id: "a", as_of_date: "2026-06-01", balance_eur: 100, is_demo: false },
      { account_id: "a", as_of_date: "2026-07-14", balance_eur: 250, is_demo: false },
      { account_id: "a", as_of_date: "2026-05-01", balance_eur: 50, is_demo: false },
    ];
    expect(byId(summarizeAccounts(accounts, snaps, false), "a").current_balance).toBe(250);
  });

  it("only returns the accounts of the requested is_demo partition", async () => {
    const { summarizeAccounts } = await load();
    const accounts: AccountRow[] = [
      { account_id: "real", name: "Lorenzo", is_demo: false, is_investment: false },
      { account_id: "demo", name: "Alice", is_demo: true, is_investment: false },
    ];
    const snaps: BalanceSnapshot[] = [
      { account_id: "real", as_of_date: "2026-07-14", balance_eur: 300, is_demo: false },
      { account_id: "demo", as_of_date: "2026-07-14", balance_eur: 900, is_demo: true },
    ];
    const real = summarizeAccounts(accounts, snaps, false);
    expect(real.map((r) => r.account_id)).toEqual(["real"]);
    const demo = summarizeAccounts(accounts, snaps, true);
    expect(demo.map((r) => r.account_id)).toEqual(["demo"]);
  });
});

describe("account-summary — partition isolation (ACC-01, is_demo chokepoint)", () => {
  it("a demo snapshot NEVER feeds a real account's summary", async () => {
    const { summarizeAccounts } = await load();
    const accounts: AccountRow[] = [
      { account_id: "a", name: "Lorenzo", is_demo: false, is_investment: false },
    ];
    // A stray demo snapshot on the SAME account_id must be ignored for the real partition,
    // even though its as_of_date is newer than the real snapshot.
    const snaps: BalanceSnapshot[] = [
      { account_id: "a", as_of_date: "2026-07-01", balance_eur: 100, is_demo: false },
      { account_id: "a", as_of_date: "2026-12-31", balance_eur: 99999, is_demo: true },
    ];
    expect(byId(summarizeAccounts(accounts, snaps, false), "a").current_balance).toBe(100);
  });
});

describe("account-summary — no-snapshot account (ACC-01, Pitfall 8)", () => {
  it("yields a null current_balance for an account with no matching snapshot (the Investing/virtual account)", async () => {
    const { summarizeAccounts } = await load();
    const accounts: AccountRow[] = [
      { account_id: "invest", name: "Investing", is_demo: false, is_investment: true },
    ];
    const summary = byId(summarizeAccounts(accounts, [], false), "invest");
    expect(summary.current_balance).toBeNull();
    expect(summary.is_investment).toBe(true);
  });
});
