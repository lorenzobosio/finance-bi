"use client";

// Spending route error boundary (DSN-06d / D3-14) — Next requires `error.tsx` to be a Client
// Component (it receives the `reset` callback that re-renders the segment). Shown when the
// Spending mart reads (v_category_breakdown / v_pct_of_revenue) throw, instead of a blank page.
//
// Copy is the verbatim UI-SPEC §Copywriting "Couldn't load this view." string, on a calm
// `bg-card` surface — never alarming. Theme-aware via named tokens.

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-1 items-center justify-center py-12">
      <div
        role="alert"
        className="max-w-md rounded-xl border bg-card p-6 text-center shadow-sm"
      >
        <p className="font-semibold text-card-foreground">
          Couldn&apos;t load this view.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          The data sync may be in progress. Refresh in a moment; if it persists,
          check the connection on Config.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-4 inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
