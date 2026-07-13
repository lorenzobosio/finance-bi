import { Skeleton } from "@/components/ui/skeleton";

// /health route skeleton boundary (DSN-06d) — the Suspense fallback while the household + KPI +
// P&L + budget reads resolve. Mirrors the page shape (header + chip row + detail grid) so the swap
// to real content causes no layout shift. Theme-aware.

export default function Loading() {
  return (
    <div className="space-y-8" aria-busy="true" aria-live="polite">
      <div className="flex items-center gap-2">
        <Skeleton className="size-5 rounded-full" />
        <Skeleton className="h-8 w-48" />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-lg" />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="rounded-xl bg-card p-6 ring-1 ring-foreground/10">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="mt-3 h-9 w-32" />
            <Skeleton className="mt-3 h-4 w-24" />
          </div>
        ))}
      </div>

      <span className="sr-only">Loading…</span>
    </div>
  );
}
