import { Skeleton } from "@/components/ui/skeleton";

// Config route skeleton boundary (DSN-06d / D3-14) — the Suspense fallback shown while the
// budgets read resolves. It mirrors the page shape (header + the Tabs bar + a Card) so the
// swap to the real editor causes NO layout shift.
//
// Theme-aware automatically via the Skeleton primitive's `bg-muted` token (light + dark).

export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <Skeleton className="h-7 w-24" />

      {/* Tabs bar (Budgets · Rules · Connection). */}
      <Skeleton className="h-8 w-64 rounded-lg" />

      {/* Active tab Card. */}
      <div className="rounded-xl bg-card p-6 ring-1 ring-foreground/10">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="mt-2 h-4 w-3/4" />
        <div className="mt-6 space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </div>

      <span className="sr-only">Loading…</span>
    </div>
  );
}
