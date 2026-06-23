import { TxTableSkeleton } from "@/components/transactions/tx-table";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// Transactions route skeleton boundary (DSN-06d / D3-14) — the Suspense fallback shown while
// the keyset-paginated transactions read resolves. It mirrors the page shape (header + the
// Card-wrapped dense table) reusing TxTableSkeleton so the swap to real rows causes NO layout
// shift (the skeleton rows share the table's fixed row height).
//
// Theme-aware automatically via the Skeleton primitive's `bg-muted` token (light + dark).

export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <div className="flex items-center gap-3">
        <Skeleton className="h-7 w-40" />
      </div>
      <Card className="py-0 [--card-spacing:0px] overflow-x-auto">
        <TxTableSkeleton rows={10} />
      </Card>
      <span className="sr-only">Loading…</span>
    </div>
  );
}
