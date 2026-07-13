import { Skeleton } from "@/components/ui/skeleton";

// Brazil bucket route skeleton boundary (DSN-06d) — the Suspense fallback while the household +
// investimento + v_bucket_spend reads resolve. Mirrors the page shape (header + accumulated card +
// CTA row + donut + list) so the swap to real content causes no layout shift. Theme-aware.

export default function Loading() {
  return (
    <div className="space-y-8" aria-busy="true" aria-live="polite">
      <div className="flex items-center gap-2">
        <Skeleton className="size-5 rounded-full" />
        <Skeleton className="h-7 w-32" />
      </div>

      <div className="rounded-xl bg-card p-6 ring-1 ring-foreground/10">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="mt-3 h-9 w-40" />
        <Skeleton className="mt-3 h-4 w-64" />
      </div>

      <div className="rounded-xl bg-card p-6 ring-1 ring-foreground/10">
        <Skeleton className="h-11 w-full max-w-md" />
      </div>

      <div className="rounded-xl bg-card p-6 ring-1 ring-foreground/10">
        <Skeleton className="mx-auto size-[240px] rounded-full" />
      </div>

      <span className="sr-only">Loading…</span>
    </div>
  );
}
