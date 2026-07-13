import { Skeleton } from "@/components/ui/skeleton";

// Goal route skeleton boundary (D3-14) — the Suspense fallback while the household + investimento
// reads resolve. Mirrors the page shape (header + hero number + streak chain + ladder/why split)
// so the swap to real content causes NO layout shift. Theme-aware via the Skeleton primitive.

export default function Loading() {
  return (
    <div className="space-y-8" aria-busy="true" aria-live="polite">
      {/* Header line (h1 + tenure + couple identity). */}
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-4 w-40" />
        </div>
        <Skeleton className="h-8 w-24 rounded-full" />
      </div>

      {/* Hero card: eyebrow + big number + streak chain. */}
      <div className="rounded-xl bg-card p-6 ring-1 ring-foreground/10">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="mt-3 h-9 w-48" />
        <div className="mt-5 flex gap-1.5">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="size-2.5 rounded-full" />
          ))}
        </div>
      </div>

      {/* Ladder + why split. */}
      <div className="grid grid-cols-1 gap-6 @3xl/main:grid-cols-2">
        <div className="rounded-xl bg-card p-6 ring-1 ring-foreground/10">
          <Skeleton className="h-5 w-48" />
          <div className="mt-6 space-y-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-5 w-full" />
            ))}
          </div>
        </div>
        <div className="rounded-xl bg-card p-6 ring-1 ring-foreground/10">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-3 h-16 w-full" />
        </div>
      </div>

      <span className="sr-only">Loading…</span>
    </div>
  );
}
