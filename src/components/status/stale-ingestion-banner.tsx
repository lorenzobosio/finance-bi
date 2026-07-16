"use client";

import { useEffect, useState } from "react";
import { TriangleAlert, X } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import type { StaleIngestionView } from "@/lib/status/stale-ingestion-view";

// StaleIngestionBanner (REM-03, D-06) — the ONE loud-but-honest surface (the dead-man's-switch).
//
// A dumb client component over the pure buildStaleIngestionView (14-03): renders nothing when
// view.show === false. When ingestion has silently stopped it is the loudest banner short of the
// destructive expired-reconnect notice — role="alert" aria-live="assertive" — but the tone stays
// honest, not alarmist (Phase-5 voice). Uses the SAME calm-amber token surface as the other Phase-14
// banners (dark+light safe) — amber is the loudest allowed here (D-06 reserves red for expired).
//
// Copy is LOCKED verbatim to UI-SPEC section 4 ("Data sync has stopped"). No user number in the copy —
// the >36h threshold is the upstream INGEST_STALE_HOURS constant, never inlined here.
//
// sessionStorage soft-dismiss cloned VERBATIM from reconnect-banner.tsx: `dismissed` starts false so
// SSR and the first client render agree (no hydration mismatch); the effect reads sessionStorage after
// mount and collapses if already dismissed this session; the banner REAPPEARS on the next load while
// ingestStale still holds — it is NEVER permanently dismissible. Icons are aria-hidden.

const DISMISS_KEY = "stale-ingestion-banner-dismissed";

export function StaleIngestionBanner({ view }: { view: StaleIngestionView }) {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.sessionStorage.getItem(DISMISS_KEY) === "1") {
      setDismissed(true);
    }
  }, []);

  if (!view.show || dismissed) return null;

  function handleDismiss() {
    try {
      window.sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // sessionStorage may be unavailable (private mode); collapse for this render anyway.
    }
    setDismissed(true);
  }

  return (
    <Alert
      role="alert"
      aria-live="assertive"
      className={cn(
        "w-full items-start rounded-none border-x-0 border-t-0",
        "border-[var(--warning)]/25 bg-[var(--warning)]/10 px-4 py-2 pr-12 text-[var(--warning)] sm:px-6",
      )}
    >
      <TriangleAlert aria-hidden="true" />
      <AlertTitle className="text-sm font-semibold text-[var(--warning)]">
        Data sync has stopped
      </AlertTitle>
      <AlertDescription className="text-sm text-[var(--warning)]">
        Automatic updates haven&apos;t run recently — the figures may be out of
        date.
      </AlertDescription>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dismiss sync-stopped notice"
        className="absolute top-2 right-2 flex min-h-11 min-w-11 items-center justify-center text-[var(--warning)] transition-colors hover:opacity-80 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <X aria-hidden="true" className="size-4" />
      </button>
    </Alert>
  );
}
