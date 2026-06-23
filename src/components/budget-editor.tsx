"use client";

// BudgetEditor — the Config budgets write surface (UI-SPEC §6, BI-06, D2-12/13).
//
// One editable € input per cost center (and category, D2-14), STARTING empty/€0 — no hardcoded
// amounts are ever committed (D2-12; the source-cleanliness guard stays green). Saving calls
// the `setBudget` Server Action under the allowlist RLS; "Set from history" calls
// `setBudgetFromHistory` to prefill last month's actual (D2-13) rather than invent a cap.
//
// The input uses `useOptimistic` so the saved value reflects instantly; the Server Action's
// `revalidatePath` then reconciles the RSC. Copy follows the Copywriting Contract
// ("Save budget" / "Set from history").

import { useOptimistic, useState, useTransition } from "react";

import { setBudget, setBudgetFromHistory } from "@/lib/actions/budgets";
import { formatEUR } from "@/lib/format";

export interface BudgetRow {
  costCenter: string;
  /** Display name (e.g. "Lorenzo", "Shared"). */
  name: string;
  /** null = cost-center-grain budget (D2-14). */
  categoryId: string | null;
  /** The current saved budget € amount (0 when not set — rendered as the empty state). */
  amount: number;
  /** Whether a budget row exists for this key (distinguishes "not set" from a real €0). */
  isSet: boolean;
}

export interface BudgetEditorProps {
  rows: BudgetRow[];
  /** The selected period (YYYYMM) the budgets apply to. */
  periodKey: number;
  /** The prior period (YYYYMM) "Set from history" reads its actual from. */
  priorPeriodKey: number;
}

export function BudgetEditor({ rows, periodKey, priorPeriodKey }: BudgetEditorProps) {
  return (
    <ul className="flex flex-col divide-y divide-border">
      {rows.map((row) => (
        <BudgetEditorItem
          key={`${row.costCenter}:${row.categoryId ?? "cc"}`}
          row={row}
          periodKey={periodKey}
          priorPeriodKey={priorPeriodKey}
        />
      ))}
    </ul>
  );
}

function BudgetEditorItem({
  row,
  periodKey,
  priorPeriodKey,
}: {
  row: BudgetRow;
  periodKey: number;
  priorPeriodKey: number;
}) {
  // The text field — starts empty when no budget is set (D2-12: no hardcoded amount).
  const [draft, setDraft] = useState<string>(row.isSet ? String(row.amount) : "");
  const [pending, startTransition] = useTransition();
  const [optimisticAmount, setOptimisticAmount] = useOptimistic(
    row.isSet ? row.amount : null,
  );
  const [error, setError] = useState<string | null>(null);

  function save() {
    const amount = Number(draft);
    if (!Number.isFinite(amount) || amount < 0) {
      setError("Enter a valid amount (€0 or more).");
      return;
    }
    setError(null);
    startTransition(async () => {
      setOptimisticAmount(amount);
      await setBudget({
        costCenter: row.costCenter,
        categoryId: row.categoryId,
        periodKey,
        amount,
      });
    });
  }

  function fromHistory() {
    setError(null);
    startTransition(async () => {
      const { suggestedAmount } = await setBudgetFromHistory(
        row.costCenter,
        row.categoryId,
        priorPeriodKey,
      );
      setDraft(String(suggestedAmount));
    });
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-4">
      <div className="min-w-32">
        <span className="text-sm font-medium">{row.name}</span>
        <span className="ml-2 text-xs text-[var(--neutral-data)]">
          {optimisticAmount === null ? "Budget not set" : formatEUR(optimisticAmount)}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <label className="sr-only" htmlFor={`budget-${row.costCenter}-${row.categoryId ?? "cc"}`}>
          {row.name} budget amount in euros
        </label>
        <div className="flex items-center rounded-md border border-border px-2">
          <span aria-hidden="true" className="text-sm text-muted-foreground">
            €
          </span>
          <input
            id={`budget-${row.costCenter}-${row.categoryId ?? "cc"}`}
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            value={draft}
            placeholder="0"
            onChange={(e) => setDraft(e.target.value)}
            className="w-24 bg-transparent py-1.5 pl-1 font-mono text-sm tabular-nums outline-none"
          />
        </div>
        <button
          type="button"
          onClick={fromHistory}
          disabled={pending}
          className="rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          Set from history
        </button>
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          Save budget
        </button>
      </div>

      {error && (
        <p role="alert" className="w-full text-xs text-[var(--loss)]">
          {error}
        </p>
      )}
    </li>
  );
}
