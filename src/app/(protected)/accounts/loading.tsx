import { Skeleton } from "@/components/ui/skeleton";

// /accounts route skeleton boundary (DSN-06d) — the Suspense fallback while the v_account_summary +
// balances + household + P&L reads resolve. Mirrors the page shape (header + 4-card grid) so the
// swap to real content causes no layout shift. Theme-aware.

export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <div className="flex items-center gap-2">
        <Skeleton className="size-5 rounded-full" />
        <Skeleton className="h-8 w-40" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl bg-card p-6 ring-1 ring-foreground/10">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-3 h-9 w-32" />
            <Skeleton className="mt-4 h-10 w-full rounded-md" />
          </div>
        ))}
      </div>

      <span className="sr-only">Loading accounts…</span>
    </div>
  );
}
