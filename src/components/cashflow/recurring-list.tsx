"use client";

// RecurringList — the FLOW-01 managed recurring-series surface (UI-SPEC §2). A plain-DOM `<ul>`/`<li>`
// list (the accessible `bar-list` pattern; no Recharts), the whole list `aria-label`led. Each row:
// merchant-avatar + label (`text-sm`) + cadence `Badge` + amount (`font-mono tabular-nums`) +
// next-date (muted) + a two-action cluster wired to the LOCKED confirm/dismiss Server Action.
//
//   • active (confirmed)  → a check + "Recurring" badge; a ghost "Dismiss" reverses it (reversible).
//   • dismissed           → collapsed/muted with an inline "Undo" (re-activates — no modal, D-Copy).
//   • candidate (detected, not yet persisted) → advisory row, no write action (surfaces on next sync).
//
// Actions run through `useTransition`: the pair disables while the action resolves (optimistic pending),
// then `revalidatePath("/cashflow")` inside the action refreshes the RSC list. `Confirm` = default
// `Button` (NOT brand-colored — brand is reserved); `Dismiss`/`Undo` = `ghost`. Both ≥44px tall on
// mobile. All money via `formatEUR` (no hand-rolled Intl).

import { format, parseISO } from "date-fns";
import { Check, TrendingUp } from "lucide-react";
import { useTransition } from "react";

import { MerchantAvatar } from "@/components/transactions/merchant-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { confirmSeries, dismissSeries } from "@/lib/actions/recurring-series";
import { formatEUR } from "@/lib/format";

export interface RecurringListItem {
  /** The persisted recurring_series row id, or null for an advisory detected candidate. */
  id: string | null;
  /** The case-folded counterparty (the detection key; scopes the is_recurring stamp). */
  seriesKey: string;
  label: string;
  /** Signed EUR (negative = outflow / bill, positive = income). */
  amount: number;
  /** 'weekly' | 'monthly' | 'yearly'. */
  cadence: string;
  /** Projected next occurrence, YYYY-MM-DD, or null. */
  nextExpectedDate: string | null;
  status: "active" | "dismissed" | "candidate";
  isIncome?: boolean;
}

const CADENCE_LABEL: Record<string, string> = {
  weekly: "Weekly",
  monthly: "Monthly",
  yearly: "Yearly",
};

function RecurringRow({ item }: { item: RecurringListItem }) {
  const [pending, startTransition] = useTransition();

  const runConfirm = () => {
    if (!item.id) return;
    const id = item.id;
    startTransition(async () => {
      await confirmSeries({ id, seriesKey: item.seriesKey });
    });
  };

  const runDismiss = () => {
    if (!item.id) return;
    const id = item.id;
    startTransition(async () => {
      await dismissSeries({ id });
    });
  };

  const cadenceLabel = CADENCE_LABEL[item.cadence] ?? item.cadence;
  const amountLabel = formatEUR(Math.abs(item.amount), 2);
  const dismissed = item.status === "dismissed";

  return (
    <li
      className={
        "flex flex-wrap items-center gap-3 py-3" + (dismissed ? " opacity-60" : "")
      }
    >
      <MerchantAvatar name={item.label} />

      <div className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-center gap-2 text-sm">
          <span className="truncate font-medium">{item.label}</span>
          <Badge variant="secondary">{cadenceLabel}</Badge>
          {item.isIncome && (
            <span className="inline-flex items-center gap-1 text-xs text-[var(--gain)]">
              <TrendingUp aria-hidden="true" className="size-3" /> Income
            </span>
          )}
          {item.status === "active" && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Check aria-hidden="true" className="size-3" /> Recurring
            </span>
          )}
        </span>
        {item.nextExpectedDate && (
          <span className="text-sm text-muted-foreground">
            {dismissed
              ? "Dismissed"
              : `Next ${format(parseISO(item.nextExpectedDate), "d MMM yyyy")}`}
          </span>
        )}
      </div>

      <span className="shrink-0 font-mono text-sm tabular-nums">{amountLabel}</span>

      {/* Action cluster — id-scoped writes on the LOCKED plane; advisory candidates have no action. */}
      <div className="flex shrink-0 items-center gap-2">
        {item.status === "candidate" ? (
          <span className="text-xs text-muted-foreground">Detected</span>
        ) : dismissed ? (
          <Button
            type="button"
            variant="ghost"
            className="min-h-11"
            disabled={pending}
            onClick={runConfirm}
          >
            Undo
          </Button>
        ) : (
          <>
            <Button
              type="button"
              className="min-h-11"
              disabled={pending}
              onClick={runConfirm}
              aria-label={`Confirm ${item.label} as recurring`}
            >
              Confirm
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="min-h-11"
              disabled={pending}
              onClick={runDismiss}
              aria-label={`Dismiss ${item.label}`}
            >
              Dismiss
            </Button>
          </>
        )}
      </div>
    </li>
  );
}

export function RecurringList({ items }: { items: RecurringListItem[] }) {
  if (items.length === 0) {
    return (
      <div className="rounded-xl bg-card p-6 ring-1 ring-foreground/10">
        <p className="text-sm font-medium">No recurring payments yet</p>
        <p className="mt-1 text-sm text-muted-foreground">
          We&apos;ll surface subscriptions and regular bills automatically as more of your history
          syncs.
        </p>
      </div>
    );
  }

  return (
    <ul
      aria-label="Recurring payments"
      className="flex flex-col divide-y divide-border rounded-xl bg-card px-4 ring-1 ring-foreground/10"
    >
      {items.map((item) => (
        <RecurringRow key={item.id ?? `candidate-${item.seriesKey}`} item={item} />
      ))}
    </ul>
  );
}
