import { format } from "date-fns";
import { TriangleAlert } from "lucide-react";

import {
  EditPopover,
  type CategoryOption,
  type CostCenterOption,
} from "@/components/transactions/edit-popover";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { formatEUR } from "@/lib/format";
import { cn } from "@/lib/utils";

// Transactions dense table (UI-SPEC §5). Desktop-primary; on mobile the same rows stack as
// cards. Columns: Date · Merchant/memo · Account · Category · Cost center · Amount (mono;
// outflows neutral with a `−` — red is reserved for over-budget, NOT every expense).
//
// Uncategorized rows are surfaced FIRST (the page orders them ahead) and flagged with an amber
// TriangleAlert + an "Uncategorized" pill. investimento/transferência rows carry a muted
// `excluded` chip so the table reconciles visibly with the P&L (CAT-06).
//
// Fixed row height (h-14) → no layout shift as data streams. The Category + Cost-center cells
// host the inline EditPopover (the client island) wired to the recategorize action.

export interface TxRow {
  id: string;
  bookingDate: string;
  merchant: string;
  accountName: string | null;
  categoryId: string | null;
  categoryName: string | null;
  costCenter: string | null;
  costCenterLabel: string | null;
  amountEur: number;
  flowType: string | null;
  /** Past rows matching this row's merchant (drives the re-apply count in the popover). */
  matchingPastCount: number;
}

const EXCLUDED_FLOWS = new Set(["investimento", "transferencia"]);

function ExcludedChip() {
  return (
    <Badge variant="secondary" className="text-[var(--neutral-data)]">
      excluded
    </Badge>
  );
}

function UncategorizedPill() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-[var(--neutral-data)]">
      <TriangleAlert className="size-3 text-[var(--warning)]" aria-hidden />
      Uncategorized
    </span>
  );
}

/** Skeleton rows while the page query is in flight (no layout shift — same fixed height). */
export function TxTableSkeleton({ rows = 10 }: { rows?: number }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead>Merchant</TableHead>
          <TableHead>Account</TableHead>
          <TableHead>Category</TableHead>
          <TableHead>Cost center</TableHead>
          <TableHead className="text-right">Amount</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: rows }).map((_, i) => (
          <TableRow key={i} className="h-14">
            {Array.from({ length: 6 }).map((__, j) => (
              <TableCell key={j}>
                <Skeleton className="h-4 w-20" />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function TxTable({
  rows,
  categories,
  costCenters,
}: {
  rows: TxRow[];
  categories: CategoryOption[];
  costCenters: CostCenterOption[];
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-border px-6 py-12 text-center">
        <h2 className="text-base font-semibold">No transactions yet</h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          The daily sync runs each morning — your first month of data will appear here
          automatically. No manual import needed.
        </p>
      </div>
    );
  }

  const decorated = rows.map((r) => {
    const isUncategorized = r.categoryId === null;
    const isExcluded = r.flowType !== null && EXCLUDED_FLOWS.has(r.flowType);
    let date: string;
    try {
      date = format(new Date(r.bookingDate), "d MMM yyyy");
    } catch {
      date = r.bookingDate;
    }
    return { r, isUncategorized, isExcluded, date };
  });

  return (
    <>
      {/* Desktop / tablet (≥sm): the dense table SHELL — sticky header, a stronger header rule,
          zebra striping (even:bg-muted/40), and the inherited row-hover. Re-skin only; no
          TanStack sort/filter/CSV/logos (Phase 8). */}
      <div className="hidden overflow-x-auto sm:block">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-card [&_tr]:border-b-2 [&_tr]:border-border">
            <TableRow className="hover:bg-transparent">
              <TableHead>Date</TableHead>
              <TableHead>Merchant</TableHead>
              <TableHead>Account</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Cost center</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {decorated.map(({ r, isUncategorized, isExcluded, date }) => (
              <TableRow key={r.id} className="h-14 even:bg-muted/40">
                <TableCell className="font-mono text-sm tabular-nums whitespace-nowrap">
                  {date}
                </TableCell>

                <TableCell className="max-w-[16rem]">
                  <div className="flex items-center gap-2">
                    <span className="truncate">{r.merchant}</span>
                    {isExcluded && <ExcludedChip />}
                  </div>
                </TableCell>

                <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                  {r.accountName ?? "—"}
                </TableCell>

                {/* Category cell — opens the inline edit popover. */}
                <TableCell>
                  <EditPopover
                    txId={r.id}
                    merchant={r.merchant}
                    currentCategoryId={r.categoryId}
                    currentCostCenter={r.costCenter}
                    categories={categories}
                    costCenters={costCenters}
                    matchingPastCount={r.matchingPastCount}
                    field="category"
                    triggerLabel={
                      isUncategorized ? <UncategorizedPill /> : <span>{r.categoryName}</span>
                    }
                  />
                </TableCell>

                {/* Cost-center cell — same popover, focused on the cost-center select. */}
                <TableCell>
                  <EditPopover
                    txId={r.id}
                    merchant={r.merchant}
                    currentCategoryId={r.categoryId}
                    currentCostCenter={r.costCenter}
                    categories={categories}
                    costCenters={costCenters}
                    matchingPastCount={r.matchingPastCount}
                    field="costCenter"
                    triggerLabel={
                      <span className={cn(!r.costCenter && "text-[var(--neutral-data)]")}>
                        {r.costCenterLabel ?? r.costCenter ?? "—"}
                      </span>
                    }
                  />
                </TableCell>

                {/* Amount — mono, tabular; outflows neutral with the leading minus (formatEUR). */}
                <TableCell className="text-right font-mono text-sm tabular-nums whitespace-nowrap">
                  {formatEUR(r.amountEur)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Mobile (<sm): the SAME rows stacked as cards (UI-SPEC §5 — Fernanda). The desktop edit
          popover is kept (no vaul this phase); the Category cell hosts it inline. */}
      <ul className="divide-y divide-border sm:hidden">
        {decorated.map(({ r, isUncategorized, isExcluded, date }) => (
          <li key={r.id} className="space-y-2 px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium">{r.merchant}</span>
                  {isExcluded && <ExcludedChip />}
                </div>
                <p className="mt-0.5 font-mono text-xs tabular-nums text-muted-foreground">
                  {date}
                  {r.accountName ? ` · ${r.accountName}` : ""}
                </p>
              </div>
              <span className="shrink-0 font-mono text-sm tabular-nums whitespace-nowrap">
                {formatEUR(r.amountEur)}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <EditPopover
                txId={r.id}
                merchant={r.merchant}
                currentCategoryId={r.categoryId}
                currentCostCenter={r.costCenter}
                categories={categories}
                costCenters={costCenters}
                matchingPastCount={r.matchingPastCount}
                field="category"
                triggerLabel={
                  isUncategorized ? <UncategorizedPill /> : <span>{r.categoryName}</span>
                }
              />
              <span className={cn("text-xs", !r.costCenter && "text-[var(--neutral-data)]")}>
                {r.costCenterLabel ?? r.costCenter ?? "—"}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
