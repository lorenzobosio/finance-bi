"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";

import { recategorize } from "@/lib/actions/recategorize";
import { reapplyRuleToPast } from "@/lib/actions/reapply-rule.action";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Transações inline-edit popover (UI-SPEC §5 interaction + a11y).
//
// Clicking a row's Category / Cost-center cell opens a Radix popover (keyboard: Enter/Space
// opens, focus trapped inside, Esc closes and RESTORES focus to the trigger — Radix handles
// this). Changing a select + "Save change" calls `recategorize`, which updates THAT ONE row
// (D2-03). The "Also create a rule for future {merchant}" toggle sets `createRule` so a
// forward-only rule is written (D2-02) — past rows are NOT touched by the save.
//
// "Re-apply to {n} matching past transactions" is a SEPARATE control opening a confirm dialog
// (showing the count); it calls `reapplyRuleToPast` and surfaces the server-returned
// affected-count. It is NEVER on the save path (CAT-05).

export interface CategoryOption {
  id: string;
  name: string;
}

export interface CostCenterOption {
  code: string;
  label: string;
}

export interface EditPopoverProps {
  txId: string;
  merchant: string;
  /** The current category id (null = Uncategorized). */
  currentCategoryId: string | null;
  currentCostCenter: string | null;
  categories: CategoryOption[];
  costCenters: CostCenterOption[];
  /** Count of past rows matching this merchant — shown in the re-apply control + dialog. */
  matchingPastCount: number;
  /** The trigger label rendered in the cell (the current category or cost-center display). */
  triggerLabel: React.ReactNode;
  /** Which cell opened the popover — only affects which select is emphasised. */
  field: "category" | "costCenter";
}

const UNCATEGORIZED = "__uncategorized__";

export function EditPopover({
  txId,
  merchant,
  currentCategoryId,
  currentCostCenter,
  categories,
  costCenters,
  matchingPastCount,
  triggerLabel,
  field,
}: EditPopoverProps) {
  const [open, setOpen] = useState(false);
  const [categoryId, setCategoryId] = useState<string>(currentCategoryId ?? UNCATEGORIZED);
  const [costCenter, setCostCenter] = useState<string>(currentCostCenter ?? "");
  const [createRule, setCreateRule] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [affected, setAffected] = useState<number | null>(null);
  const [isSaving, startSaving] = useTransition();
  const [isReapplying, startReapply] = useTransition();

  function handleSave() {
    startSaving(async () => {
      await recategorize({
        txId,
        categoryId: categoryId === UNCATEGORIZED ? null : categoryId,
        costCenter,
        createRule,
        merchant,
      });
      setOpen(false);
    });
  }

  // Re-apply this merchant's forward rule to PAST rows. The confirm dialog passes the merchant
  // string; reapplyRuleToPast resolves it to the merchant's forward rule server-side and
  // returns the idempotent server-side affected-count (CAT-05). Never on the save path.
  function handleReapply() {
    startReapply(async () => {
      const result = await reapplyRuleToPast(merchant);
      setAffected(result.affected);
    });
  }

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="w-full rounded px-1 py-0.5 text-left hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            aria-label={`Edit ${field === "category" ? "category" : "cost center"} for ${merchant}`}
          >
            {triggerLabel}
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-72 space-y-3"
          onCloseAutoFocus={(e) => {
            // Radix restores focus to the trigger by default (UI-SPEC a11y). Keep default.
            void e;
          }}
        >
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground" htmlFor={`cat-${txId}`}>
              Category
            </label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger id={`cat-${txId}`} className="w-full" aria-label="Category">
                <SelectValue placeholder="Uncategorized" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNCATEGORIZED}>Uncategorized</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground" htmlFor={`cc-${txId}`}>
              Cost center
            </label>
            <Select value={costCenter} onValueChange={setCostCenter}>
              <SelectTrigger id={`cc-${txId}`} className="w-full" aria-label="Cost center">
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                {costCenters.map((cc) => (
                  <SelectItem key={cc.code} value={cc.code}>
                    {cc.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={createRule}
              onChange={(e) => setCreateRule(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              Also create a rule for future <span className="font-medium">{merchant}</span>
            </span>
          </label>

          <div className="flex items-center justify-between gap-2 pt-1">
            <Button size="sm" onClick={handleSave} disabled={isSaving || !costCenter}>
              {isSaving && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
              Save change
            </Button>
          </div>

          {matchingPastCount > 0 && (
            <div className="border-t border-border pt-2">
              <Button
                size="sm"
                variant="outline"
                className="w-full"
                onClick={() => setConfirmOpen(true)}
              >
                Re-apply to {matchingPastCount} matching past transactions
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>

      {/* SEPARATE explicit re-apply confirm dialog (never on the save path, CAT-05). */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Re-apply to {matchingPastCount} matching past transactions</DialogTitle>
            <DialogDescription>
              This updates {matchingPastCount} past transaction
              {matchingPastCount === 1 ? "" : "s"} matching{" "}
              <span className="font-medium">{merchant}</span>. It is idempotent — running it
              again changes nothing further.
            </DialogDescription>
          </DialogHeader>

          {affected !== null && (
            <p role="status" className="text-sm text-muted-foreground">
              {affected} transaction{affected === 1 ? "" : "s"} updated.
            </p>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Close
            </Button>
            <Button onClick={handleReapply} disabled={isReapplying}>
              {isReapplying && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
              Re-apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
