import { PiggyBank, Users, Wallet } from "lucide-react";
import type { ReactNode } from "react";

import { AccountCard } from "@/components/accounts/account-card";
import { costCenterDisplayName } from "@/lib/cost-center-display";
import {
  toSparklineSeries,
  type BalanceSnapshot,
  type SparklinePoint,
} from "@/lib/accounts/summary";
import { isDemoForReads } from "@/lib/demo/mode";
import { formatEUR } from "@/lib/format";
import { foldAllocation, type AllocationEvent } from "@/lib/goal/allocation";
import { getGoalTotal } from "@/lib/goal/getGoalTotal";
import { readHouseholdConfig, type HouseholdReadClient } from "@/lib/goal/household";
import { createClient } from "@/lib/supabase/server";

// /accounts — the ACC-01 per-account view: one balance card per account (Lorenzo · Fernanda · Shared
// · Investing), each with the current CLBD balance + a compact sparkline trend. Reads the
// `v_account_summary` mart (latest-CLBD-per-account) + `balances` (the sparkline series) under RLS
// through the is_demo chokepoint — NEVER src/lib/db/marts (T-02-11 / FND-03). The Investing card's
// figure is the accumulated cost basis via getGoalTotal (Pitfall 8) — NOT a balances snapshot (the
// ETF pocket isn't PSD2-exposed) — labelled "cost basis".
//
// Every demo-bearing read threads `.eq("is_demo", demoFilter)`: the anon public demo's RLS cap pins
// each read to is_demo=true, so /accounts renders the 4 seeded demo cards and never the silent-empty
// trap (accounts.spec.ts) nor a demo↔real blend (demo-read-filter guard). All €/labels via formatEUR
// + costCenterDisplayName (person accounts render Alice/Bob on the demo — display-only).

/** numeric columns arrive from supabase-js as strings; parse to a finite number (0 fallback). */
function num(v: string | number | null | undefined): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

// The stable display order (UI): the two people, Shared, then the virtual Investing account last.
const ORDER: Record<string, number> = { lorenzo: 0, fernanda: 1, compartilhado: 2, shared: 2 };

/** The card glyph per account: people get a wallet, Shared the pair, Investing the piggy bank. */
function iconFor(costCenter: string | null, isInvestment: boolean): ReactNode {
  if (isInvestment) return <PiggyBank />;
  if (costCenter === "compartilhado" || costCenter === "shared") return <Users />;
  return <Wallet />;
}

export default async function AccountsPage() {
  const supabase = await createClient();
  // The demo-mode partition selector (D4-12) — resolved FIRST; every read below filters to this one
  // partition so demo and real rows are NEVER summed (no blend; the anon demo caps to is_demo=true).
  const demoFilter = await isDemoForReads();

  // 1. The latest-CLBD-per-account summary (the mart mirroring src/lib/accounts/summary.ts).
  const { data: summaryRows, error: summaryError } = await supabase
    .from("v_account_summary")
    .select("account_id, name, default_cost_center, is_investment, current_balance")
    .eq("is_demo", demoFilter);

  // 2. The per-account balance history for the mini-trends (ordered oldest → newest).
  const { data: balanceRows, error: balanceError } = await supabase
    .from("balances")
    .select("account_id, as_of_date, balance_eur, is_demo")
    .eq("is_demo", demoFilter)
    .order("as_of_date", { ascending: true });

  // A hard read error bubbles to error.tsx (never a partition blend / silent-empty render).
  if (summaryError) throw summaryError;
  if (balanceError) throw balanceError;

  // 3. The Investing cost basis = the Wealth cost basis via getGoalTotal (Pitfall 8 / A1) — the SAME
  //    launch-gated fold Home + the bucket pages use, NOT a balances snapshot. Read the household
  //    launch_date (demo-partitioned via the seam) + the monthly investimento, fold the waterfall.
  const household = await readHouseholdConfig(
    supabase as unknown as HouseholdReadClient,
    demoFilter,
  );
  const { data: pnlRows } = await supabase
    .from("v_pnl_monthly")
    .select("period_key, investimento")
    .eq("is_demo", demoFilter);

  const investEvents: AllocationEvent[] = (pnlRows ?? [])
    .slice()
    .sort((a, b) => Number(a.period_key) - Number(b.period_key))
    .filter((r) => num(r.investimento) > 0)
    .map((r) => {
      const key = Number(r.period_key);
      const mm = String(key % 100).padStart(2, "0");
      return {
        kind: "transfer" as const,
        amount: num(r.investimento),
        bookingDate: `${Math.floor(key / 100)}-${mm}-01`,
        id: key,
      };
    });
  const goalState = foldAllocation(investEvents, { launchDate: household.launchDate });
  const costBasis = getGoalTotal(goalState);

  // The raw balance snapshots typed for the pure sparkline shaper (Money string → number).
  const snapshots: BalanceSnapshot[] = (balanceRows ?? []).map((r) => ({
    account_id: r.account_id,
    as_of_date: r.as_of_date,
    balance_eur: num(r.balance_eur),
    is_demo: r.is_demo,
  }));

  // Order the accounts: Lorenzo · Fernanda · Shared · Investing (Investing always last).
  const ordered = (summaryRows ?? []).slice().sort((a, b) => {
    const ra = a.is_investment ? 99 : (ORDER[a.default_cost_center ?? ""] ?? 50);
    const rb = b.is_investment ? 99 : (ORDER[b.default_cost_center ?? ""] ?? 50);
    return ra - rb;
  });

  const cards = ordered.map((row) => {
    const points: SparklinePoint[] = toSparklineSeries(snapshots, row.account_id, demoFilter);

    if (row.is_investment) {
      // The virtual Investing account: value = cost basis (getGoalTotal), labelled — never a snapshot.
      return {
        key: row.account_id,
        name: "Investing",
        icon: iconFor(row.default_cost_center, true),
        valueLabel: formatEUR(costBasis, 0),
        subLabel: "Cost basis",
        points,
      };
    }

    // Person / Shared account: the label routes through costCenterDisplayName (Alice/Bob on the demo).
    const name = costCenterDisplayName(row.default_cost_center ?? row.name, row.name, demoFilter);
    const current = num(row.current_balance);
    return {
      key: row.account_id,
      name,
      icon: iconFor(row.default_cost_center, false),
      valueLabel: row.current_balance === null ? "—" : formatEUR(current, 0),
      subLabel: undefined,
      points,
    };
  });

  return (
    <div className="@container/main space-y-6">
      <header className="flex items-center gap-2">
        <Wallet aria-hidden="true" className="size-5 text-[var(--brand)]" />
        <h1 className="text-xl font-semibold">Accounts</h1>
      </header>

      {cards.length === 0 ? (
        <p className="rounded-xl bg-card p-6 text-sm text-[var(--neutral-data)] ring-1 ring-foreground/10">
          No accounts yet — connect a bank on the Config page and your accounts appear here.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
          {cards.map((c) => (
            <AccountCard
              key={c.key}
              name={c.name}
              icon={c.icon}
              valueLabel={c.valueLabel}
              subLabel={c.subLabel}
              points={c.points}
            />
          ))}
        </div>
      )}
    </div>
  );
}
