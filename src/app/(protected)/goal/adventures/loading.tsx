import { Skeleton } from "@/components/ui/skeleton";

// Adventures bucket route skeleton boundary (DSN-06d) — the Suspense fallback while the household +
// investimento + v_bucket_spend reads resolve. Mirrors the page shape (header + two-number lock card
// + epic-trip row + donut + list) so the swap to real content causes no layout shift. Theme-aware.

export default function Loading() {
  return (
    <div className="space-y-8" aria-busy="true" aria-live="polite">
      <div className="flex items-center gap-2">
        <Skeleton className="size-5 rounded-full" />
        <Skeleton className="h-7 w-40" />
      </div>

      {/* The two-number lock card: eyebrow + spendable + accruing row. */}
      <div className="rounded-xl bg-card p-6 ring-1 ring-foreground/10">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="mt-3 h-9 w-40" />
        <div className="mt-6 flex items-center justify-between">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-6 w-24" />
        </div>
      </div>

      <div className="flex items-center justify-between rounded-xl bg-card p-6 ring-1 ring-foreground/10">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-11 w-36" />
      </div>

      <div className="rounded-xl bg-card p-6 ring-1 ring-foreground/10">
        <Skeleton className="mx-auto size-[240px] rounded-full" />
      </div>

      <span className="sr-only">Loading…</span>
    </div>
  );
}
