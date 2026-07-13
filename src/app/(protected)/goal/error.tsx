"use client";

// Goal route error boundary (D3-14) — Next requires `error.tsx` to be a Client Component (it
// receives the `reset` callback that re-renders the segment). Shown when the household /
// investimento reads throw, instead of a blank page. Copy is the UI-SPEC §Copywriting data-safe
// reassurance (the couple's PROGRESS is never at risk — only this view failed to load).

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
          We couldn&apos;t load your goal data just now.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Your progress is safe — pull to refresh, or try again in a moment.
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
