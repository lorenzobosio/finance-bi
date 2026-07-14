import { Skeleton } from "@/components/ui/skeleton";

// /cashflow route skeleton boundary — the Suspense fallback while the page resolves the demo
// partition + the recurring-series read. Mirrors the page shape (header + section stacks) so the swap
// to real content causes no layout shift. Theme-aware.

export default function Loading() {
  return (
    <div className="space-y-8" aria-busy="true" aria-live="polite">
      <div className="flex items-center gap-2">
        <Skeleton className="size-5 rounded-full" />
        <Skeleton className="h-8 w-40" />
      </div>

      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="rounded-xl bg-card p-6 ring-1 ring-foreground/10">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="mt-3 h-10 w-full" />
          <Skeleton className="mt-2 h-10 w-full" />
        </div>
      ))}

      <span className="sr-only">Loading…</span>
    </div>
  );
}
