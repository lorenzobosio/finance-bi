import { Skeleton } from "@/components/ui/skeleton";

// Shell-level loading boundary (DSN-06d / D3-14) — the RSC Suspense fallback shown while a
// protected route's mart reads resolve. It mirrors the Home card/grid shape (a header line + a
// 4-up KPI grid + a secondary 2-up row) so the swap to real content causes NO layout shift.
//
// Theme-aware automatically: every surface uses named tokens (`bg-card`, `bg-muted` via the
// Skeleton primitive), so it renders correctly in both light and dark with no theme branching.
// Plans 05/06 add per-page skeletons (spending/transactions/cost-centers/config) that refine
// this generic shape; this root pair covers all protected routes until then.

export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      {/* Page header line (h1 + provisional pill slot). */}
      <div className="flex items-center gap-3">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-5 w-24 rounded-full" />
      </div>

      {/* 4-up KPI grid — matches the Home grid (1 → 2 → 4 columns). */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border bg-card p-6">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="mt-4 h-8 w-32" />
            <Skeleton className="mt-4 h-2 w-full rounded-full" />
          </div>
        ))}
      </div>

      {/* Secondary 2-up row (Cash & reserves). */}
      <div className="space-y-3">
        <Skeleton className="h-4 w-28" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="rounded-xl border bg-card p-6">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="mt-4 h-8 w-28" />
            </div>
          ))}
        </div>
      </div>

      <span className="sr-only">Loading…</span>
    </div>
  );
}
