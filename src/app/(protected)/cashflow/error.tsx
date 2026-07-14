"use client";

// /cashflow route error boundary — Next requires error.tsx to be a Client Component (it receives the
// `reset` callback). Shown when the recurring-series read throws, instead of a blank page. Non-shame
// copy: the couple's numbers are safe — only this view failed to load.

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
      <div role="alert" className="max-w-md rounded-xl border bg-card p-6 text-center shadow-sm">
        <p className="font-semibold text-card-foreground">
          We couldn&apos;t load your cashflow right now.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Your numbers are safe and up to date — try again in a moment.
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
