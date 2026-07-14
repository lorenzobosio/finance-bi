"use client";

import { useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { format } from "date-fns";
import { ArrowDown, ArrowUp, ChevronsUpDown, TriangleAlert } from "lucide-react";
import {
  type ColumnDef,
  type SortingState,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";

import { MerchantAvatar } from "@/components/transactions/merchant-avatar";
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

// Transactions dense table (UI-SPEC §5) — now a @tanstack/react-table v8 SERVER-DRIVEN island
// (TXN-01). `manualPagination + manualSorting + manualFiltering` with the CORE row model only: the
// server (buildTxQuery under RLS) owns pagination/sort/filter/search, so we must NOT add the
// client sorted/filtered/pagination models (they would re-process the authoritative page —
// Pattern 1). `rowCount` is left undefined (keyset has no page count — Pitfall 3).
//
// Sort is limited to booking_date + amount_eur; a sortable header pushes `?sort=&dir=` to the URL
// (and clears the keyset cursor). The Category + Cost-center cells still host the inline EditPopover
// with the SAME props → recategorize / create-rule / re-apply are preserved unchanged (Pitfall 6).
// Desktop-primary; on mobile the same rows stack as cards (Fernanda).

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

function fmtDate(iso: string): string {
  try {
    return format(new Date(iso), "d MMM yyyy");
  } catch {
    return iso;
  }
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
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Reflect the URL sort into TanStack's controlled state (column id === the DB sort column).
  const sortCol = searchParams.get("sort") === "amount_eur" ? "amount_eur" : "booking_date";
  const desc = (searchParams.get("dir") ?? "desc") !== "asc";
  const sorting: SortingState = [{ id: sortCol, desc }];

  const columns = useMemo<ColumnDef<TxRow>[]>(
    () => [
      {
        id: "booking_date",
        header: "Date",
        enableSorting: true,
        cell: ({ row }) => (
          <span className="font-mono text-sm tabular-nums whitespace-nowrap">
            {fmtDate(row.original.bookingDate)}
          </span>
        ),
      },
      {
        id: "merchant",
        header: "Merchant",
        enableSorting: false,
        cell: ({ row }) => {
          const r = row.original;
          const isExcluded = r.flowType !== null && EXCLUDED_FLOWS.has(r.flowType);
          return (
            <div className="flex items-center gap-2">
              <MerchantAvatar name={r.merchant} />
              <span className="truncate">{r.merchant}</span>
              {isExcluded && <ExcludedChip />}
            </div>
          );
        },
      },
      {
        id: "account",
        header: "Account",
        enableSorting: false,
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground whitespace-nowrap">
            {row.original.accountName ?? "—"}
          </span>
        ),
      },
      {
        id: "category",
        header: "Category",
        enableSorting: false,
        cell: ({ row }) => {
          const r = row.original;
          return (
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
                r.categoryId === null ? <UncategorizedPill /> : <span>{r.categoryName}</span>
              }
            />
          );
        },
      },
      {
        id: "cost_center",
        header: "Cost center",
        enableSorting: false,
        cell: ({ row }) => {
          const r = row.original;
          return (
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
          );
        },
      },
      {
        id: "amount_eur",
        header: "Amount",
        enableSorting: true,
        cell: ({ row }) => (
          <span className="font-mono text-sm tabular-nums whitespace-nowrap">
            {formatEUR(row.original.amountEur)}
          </span>
        ),
      },
    ],
    [categories, costCenters],
  );

  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true, // server paginates (keyset) — TanStack must not slice
    manualSorting: true, // server sorts — reflect state, do not sort locally
    manualFiltering: true, // server filters — reflect state, do not filter locally
    enableSortingRemoval: false, // two-state sort (asc↔desc), never "none"
    state: { sorting },
    onSortingChange: (updater) => {
      const next = typeof updater === "function" ? updater(sorting) : updater;
      const s = next[0] ?? sorting[0];
      const params = new URLSearchParams(searchParams.toString());
      params.set("sort", s.id);
      params.set("dir", s.desc ? "desc" : "asc");
      params.delete("after"); // sort change resets the keyset cursor
      router.replace(`${pathname}?${params.toString()}`);
    },
    // rowCount intentionally omitted (undefined) — keyset pagination has no total page count.
  });

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-border px-6 py-12 text-center">
        <h2 className="text-base font-semibold">No transactions match</h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          Try clearing a filter or widening the date range. The daily sync runs each morning — new
          transactions appear here automatically.
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Desktop / tablet (≥sm): the dense TanStack table — sticky header, sortable Date + Amount
          headers (push ?sort=&dir=), zebra striping, inherited row-hover. */}
      <div className="hidden overflow-x-auto sm:block">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-card [&_tr]:border-b-2 [&_tr]:border-border">
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id} className="hover:bg-transparent">
                {hg.headers.map((h) => {
                  const sortable = h.column.getCanSort();
                  const isAmount = h.column.id === "amount_eur";
                  const dir = h.column.getIsSorted();
                  return (
                    <TableHead key={h.id} className={cn(isAmount && "text-right")}>
                      {sortable ? (
                        <button
                          type="button"
                          onClick={h.column.getToggleSortingHandler()}
                          className={cn(
                            "inline-flex items-center gap-1 rounded px-1 -mx-1 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                            isAmount && "flex-row-reverse",
                          )}
                          aria-label={`Sort by ${String(h.column.columnDef.header)}`}
                        >
                          {flexRender(h.column.columnDef.header, h.getContext())}
                          {dir === "asc" ? (
                            <ArrowUp className="size-3.5" aria-hidden />
                          ) : dir === "desc" ? (
                            <ArrowDown className="size-3.5" aria-hidden />
                          ) : (
                            <ChevronsUpDown className="size-3.5 opacity-50" aria-hidden />
                          )}
                        </button>
                      ) : (
                        flexRender(h.column.columnDef.header, h.getContext())
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow key={row.id} className="h-14 even:bg-muted/40">
                {row.getVisibleCells().map((cell) => (
                  <TableCell
                    key={cell.id}
                    className={cn(
                      cell.column.id === "merchant" && "max-w-[16rem]",
                      cell.column.id === "amount_eur" && "text-right",
                    )}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Mobile (<sm): the SAME rows stacked as cards (UI-SPEC §5 — Fernanda). The inline edit
          popover is kept; the Category cell hosts it. */}
      <ul className="divide-y divide-border sm:hidden">
        {rows.map((r) => {
          const isUncategorized = r.categoryId === null;
          const isExcluded = r.flowType !== null && EXCLUDED_FLOWS.has(r.flowType);
          return (
            <li key={r.id} className="space-y-2 px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <MerchantAvatar name={r.merchant} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{r.merchant}</span>
                      {isExcluded && <ExcludedChip />}
                    </div>
                    <p className="mt-0.5 font-mono text-xs tabular-nums text-muted-foreground">
                      {fmtDate(r.bookingDate)}
                      {r.accountName ? ` · ${r.accountName}` : ""}
                    </p>
                  </div>
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
          );
        })}
      </ul>
    </>
  );
}
