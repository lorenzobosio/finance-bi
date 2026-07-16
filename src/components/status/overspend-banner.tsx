"use client";

import { useEffect, useState } from "react";
import { CircleAlert, X } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  isOverspendDismissed,
  type OverspendView,
} from "@/lib/status/overspend-view";

// OverspendBanner (REM-02, D-05) — the CALM, non-shame budget nudge.
//
// A dumb client component: ALL selection lives in the pure buildOverspendView (14-03); this
// only renders the already-decided view and owns the per-period dismiss side effect. Renders
// nothing when view.show === false (surface-only — no "all good" chrome, UI-SPEC section 3).
//
// NEVER red, never guilt (D-05): the canonical calm-amber token surface (dark+light safe,
// mirroring reconcile-chip's text-[var(--warning)] idiom) — NOT the hard-coded amber-50/900.
// role="status" aria-live="polite" (informational, not an alarm). Copy is LOCKED verbatim to
// UI-SPEC section 3 ("passed its budget this month — worth a look").
//
// Per-period soft-dismiss (D-05): localStorage keyed by `overspend-dismissed:{periodKey}` storing
// the dismissed scopes[]. On mount the banner hides ONLY while the current over-budget scopes are a
// SUBSET of the dismissed set (isOverspendDismissed) — so a NEW cost center flipping over budget is
// not a subset and the banner RE-SHOWS; a fresh month is a fresh key and re-shows too. `dismissed`
// starts false so SSR and the first client render agree (no hydration mismatch); the effect reads
// storage after mount. Icons are aria-hidden — meaning is always carried by text.

export function OverspendBanner({
  view,
  periodKey,
}: {
  view: OverspendView;
  periodKey: string;
}) {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(
        `overspend-dismissed:${periodKey}`,
      );
      if (!raw) return;
      const stored = JSON.parse(raw) as unknown;
      if (
        Array.isArray(stored) &&
        isOverspendDismissed(view.scopes, stored as string[])
      ) {
        setDismissed(true);
      }
    } catch {
      // localStorage may be unavailable / unparseable (private mode); show the banner anyway.
    }
  }, [periodKey, view.scopes]);

  if (!view.show || dismissed) return null;

  function handleDismiss() {
    try {
      window.localStorage.setItem(
        `overspend-dismissed:${periodKey}`,
        JSON.stringify(view.scopes),
      );
    } catch {
      // localStorage may be unavailable (private mode); collapse for this render anyway.
    }
    setDismissed(true);
  }

  const message =
    view.extraCount > 0
      ? `${view.primaryLabel} and ${view.extraCount} more passed their budget this month — worth a look.`
      : `${view.primaryLabel} passed its budget this month — worth a look.`;

  return (
    <Alert
      role="status"
      aria-live="polite"
      className={cn(
        "w-full items-start rounded-none border-x-0 border-t-0",
        "border-[var(--warning)]/25 bg-[var(--warning)]/10 px-4 py-2 pr-12 text-[var(--warning)] sm:px-6",
      )}
    >
      <CircleAlert aria-hidden="true" />
      <AlertDescription className="flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm text-[var(--warning)]">
        <span>{message}</span>
        <Button
          asChild
          variant="link"
          size="sm"
          className="h-auto min-h-11 px-0 text-[var(--warning)]"
        >
          <a href="/cost-centers">View cost centers</a>
        </Button>
      </AlertDescription>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dismiss overspend notice"
        className="absolute top-2 right-2 flex min-h-11 min-w-11 items-center justify-center text-[var(--warning)] transition-colors hover:opacity-80 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <X aria-hidden="true" className="size-4" />
      </button>
    </Alert>
  );
}
