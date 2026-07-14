// AccountCard — one per-account balance card (ACC-01). Composes the existing KpiCard elevation
// card with the compact <Sparkline> in its mini-viz slot: the eyebrow = the account label (the page
// routes person accounts through costCenterDisplayName so they render Alice/Bob on the demo), the
// big value = the current balance via formatEUR (the de-DE central formatter — no new Intl), and the
// mini-trend underneath.
//
// The Investing variant shows the accumulated cost basis (via getGoalTotal upstream) with an explicit
// "cost basis" sub-label — NEVER a `balances` snapshot (Pitfall 8). Carries the E2E contract
// `data-testid="account-card"` (accounts.spec.ts asserts ≥1 card on the anon demo — the anti-
// Pitfall-2 silent-empty guard).

import type { ReactNode } from "react";

import { KpiCard } from "@/components/kpi-card";
import { Sparkline } from "@/components/accounts/sparkline";
import type { SparklinePoint } from "@/lib/accounts/summary";

export interface AccountCardProps {
  /** The account label already resolved to its display persona (Alice/Bob on the demo). */
  name: string;
  /** A RENDERED lucide glyph (KpiCard cannot serialize a bare component across the RSC boundary). */
  icon: ReactNode;
  /** The headline value ALREADY formatted via formatEUR — or "—" when there is no balance. */
  valueLabel: string;
  /** The ascending-by-date mini-trend points for this account (may be empty). */
  points: SparklinePoint[];
  /** An explicit value sub-label — e.g. "Cost basis" for the Investing card (Pitfall 8). */
  subLabel?: string;
}

export function AccountCard({ name, icon, valueLabel, points, subLabel }: AccountCardProps) {
  return (
    <div data-testid="account-card">
      <KpiCard
        label={name}
        icon={icon}
        value={valueLabel}
        status={subLabel ? { label: subLabel, tone: "neutral" } : undefined}
      >
        <Sparkline data={points} />
      </KpiCard>
    </div>
  );
}
