import { CalendarClock } from "lucide-react";
import { Suspense } from "react";

import { BillsSection } from "@/components/cashflow/bills-section";
import { ProjectionSection } from "@/components/cashflow/projection-section";
import { RecurringSection } from "@/components/cashflow/recurring-section";
import { SafeToSpendSection } from "@/components/cashflow/safe-to-spend-section";
import { Skeleton } from "@/components/ui/skeleton";
import { demoAwareNow, isDemoForReads } from "@/lib/demo/mode";

// /cashflow — the FLOW-01 forward-looking surface (Phase 9). This plan ships the page shell + the
// managed recurring-payments list; the safe-to-spend, bills, and projection sections are quiet stubs
// (return null) filled by 09-04/05/06 into the SAME mount points.
//
// The demo-mode partition selector + the demo-aware display clock are resolved ONCE here and threaded
// down to every section, so each read filters to a single partition and no engine reads the wall clock
// (Pitfall 2 — a wall-clock asOf renders the anon demo empty). Each section mounts inside its own
// <Suspense> so a slow read streams independently behind a layout-matching skeleton.

function SectionSkeleton() {
  return (
    <div className="rounded-xl bg-card p-6 ring-1 ring-foreground/10" aria-busy="true">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="mt-3 h-10 w-full" />
      <Skeleton className="mt-2 h-10 w-full" />
    </div>
  );
}

export default async function CashflowPage() {
  // Resolved ONCE (the single partition + display clock the whole page threads down).
  const demoFilter = await isDemoForReads();
  const asOf = demoAwareNow(demoFilter, new Date());

  return (
    <div className="@container/main space-y-8">
      <header className="flex items-center gap-2">
        <CalendarClock aria-hidden="true" className="size-5 text-[var(--brand)]" />
        <h1 className="text-xl font-semibold">Cashflow</h1>
      </header>

      {/* Safe-to-spend + runway KPIs (stub → filled by 09-04). */}
      <Suspense fallback={<SectionSkeleton />}>
        <SafeToSpendSection demoFilter={demoFilter} asOf={asOf} />
      </Suspense>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Recurring payments</h2>
        <Suspense fallback={<SectionSkeleton />}>
          <RecurringSection demoFilter={demoFilter} asOf={asOf} />
        </Suspense>
      </section>

      {/* Bills calendar (stub → filled by 09-05). */}
      <Suspense fallback={<SectionSkeleton />}>
        <BillsSection demoFilter={demoFilter} asOf={asOf} />
      </Suspense>

      {/* Cash-flow projection (stub → filled by 09-06). */}
      <Suspense fallback={<SectionSkeleton />}>
        <ProjectionSection demoFilter={demoFilter} asOf={asOf} />
      </Suspense>
    </div>
  );
}
