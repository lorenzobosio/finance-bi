import { Skeleton } from "@/components/ui/skeleton";

// Spending route skeleton boundary (DSN-06d / D3-14) — the Suspense fallback shown while the
// breakdown + %-of-revenue mart reads resolve. It mirrors the page's Card shape (header + the
// grain ToggleGroup + a Card-wrapped BarList, then the share-of-revenue Card) so the swap to
// real content causes NO layout shift. Refines the shell-level skeleton for this leaf route.
//
// Theme-aware automatically via the Skeleton primitive's `bg-muted` token (light + dark).

export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      {/* Page header line (h1 + provisional pill slot). */}
      <div className="flex items-center gap-3">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-5 w-24 rounded-full" />
      </div>

      {/* Spending-breakdown Card: header + grain toggle + a stack of bars. */}
      <div className="rounded-xl bg-card p-6 ring-1 ring-foreground/10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-8 w-56 rounded-lg" />
        </div>
        <div className="mt-6 space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-7 w-full rounded-md" />
          ))}
        </div>
      </div>

      {/* Share-of-net-revenue Card. */}
      <div className="rounded-xl bg-card p-6 ring-1 ring-foreground/10">
        <Skeleton className="h-4 w-36" />
        <div className="mt-4 space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-5 w-full" />
          ))}
        </div>
      </div>

      <span className="sr-only">Loading…</span>
    </div>
  );
}
