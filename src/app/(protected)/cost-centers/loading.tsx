import { Skeleton } from "@/components/ui/skeleton";

// Cost Centers route skeleton boundary (DSN-06d / D3-14) — the Suspense fallback shown while
// the budget-vs-actual, Sublet P&L, and household waterfall mart reads resolve. It mirrors the
// page shape (header → a 3-up grid of budget SectionCards → the Sublet Card → the waterfall
// Card) so the swap to real content causes NO layout shift.
//
// Theme-aware automatically via the Skeleton primitive's `bg-muted` token (light + dark).

export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      {/* Page header line (h1 + provisional pill slot). */}
      <div className="flex items-center gap-3">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-5 w-24 rounded-full" />
      </div>

      {/* 3-up budget SectionCards (Lorenzo / Fernanda / Shared). */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-xl bg-card p-6 ring-1 ring-foreground/10">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="mt-4 h-6 w-32" />
            <Skeleton className="mt-4 h-2 w-full rounded-full" />
          </div>
        ))}
      </div>

      {/* Sublet profit-center Card + household P&L waterfall Card. */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="rounded-xl bg-card p-6 ring-1 ring-foreground/10">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="mt-4 h-40 w-full rounded-md" />
          </div>
        ))}
      </div>

      <span className="sr-only">Loading…</span>
    </div>
  );
}
