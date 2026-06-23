// Budgets write-plane INPUT CONTRACT (BI-06, D2-12/13/14, V5).
//
// Split out of `budgets.ts` because a Next 15 FILE-level `'use server'` module may export ONLY
// async functions — the zod schema + types (non-functions) live here, a plain module the
// Server Action, the editor, and the unit test all import. This is the locked validation
// boundary every budget write flows through.

import { z } from "zod";

/**
 * The budget-edit input contract. A budget targets a (costCenter, categoryId, periodKey) key:
 *   • `categoryId: null` → a cost-center-grain budget (the per-person / shared budget).
 *   • `categoryId: <uuid>` → a finer category-grain budget (D2-14).
 * `amount` is the € cap, a finite non-negative number (€0 is a valid "no spend" budget; a
 * negative or NaN cap is rejected). `periodKey` is the YYYYMM int the budget applies to.
 */
export const BudgetInputSchema = z.object({
  costCenter: z.string().min(1),
  categoryId: z.uuid().nullable(),
  periodKey: z.number().int(),
  amount: z.number().finite().nonnegative(),
});

export type BudgetInput = z.infer<typeof BudgetInputSchema>;

/** Plan-frontmatter alias: the input type the editor passes to `setBudget`. */
export type SetBudgetInput = BudgetInput;
