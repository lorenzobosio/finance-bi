"use client";

import { useEffect, useReducer, useState } from "react";
import { RefreshCw, X } from "lucide-react";
import { useSerwist } from "@serwist/next/react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  initialUpdatePromptState,
  updatePromptReducer,
} from "@/lib/pwa/update-prompt-model";

// SwUpdatePrompt (PWA-03, D-06) — the ONE calm interaction of the PWA phase.
//
// A new service worker only ever `waiting`s when the user is running old code (skipWaiting is
// UNSET in sw.ts by design). This island surfaces that as a NON-nagging "Update available — Reload"
// prompt. It clones the reconnect-banner.tsx soft-dismiss idiom but is deliberately CALM, not an
// alarm:
//   • role="status" aria-live="polite" (informational) — NEVER alert/assertive.
//   • the Reload Button is the default/--primary variant — NEVER --destructive.
//   • bottom-anchored, mobile-first, 44px (min-h-11) touch targets, honors reduced-motion,
//     and has NO auto-dismiss timer.
//
// Visibility is driven by the PURE updatePromptReducer (from @/lib/pwa/update-prompt-model); this
// component owns only the side effects the reducer forbids itself (the serwist events + the
// sessionStorage soft-dismiss). Soft-dismiss ("Later"/X) hides the prompt for the session but it
// REAPPEARS on the next `waiting` worker (D-06) — the effect clears the flag on each new waiting.
//
// D-07: imports no server client, no service_role, no env secret — only the SW lifecycle events.

const DISMISS_KEY = "sw-update-prompt-dismissed";

export function SwUpdatePrompt() {
  const { serwist } = useSerwist();
  const [state, dispatch] = useReducer(
    updatePromptReducer,
    initialUpdatePromptState,
  );
  // Start dismissed=false so SSR and the first client render agree (no hydration mismatch); the
  // effect reads sessionStorage after mount and collapses if already dismissed this session.
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.sessionStorage.getItem(DISMISS_KEY) === "1") {
      setDismissed(true);
    }
  }, []);

  useEffect(() => {
    if (!serwist) return;
    const onWaiting = () => {
      // A fresh waiting worker → reveal again, clearing any prior soft-dismiss (D-06). The pure
      // reducer models the visibility; the sessionStorage flag survives remounts within a session.
      try {
        window.sessionStorage.removeItem(DISMISS_KEY);
      } catch {
        // sessionStorage may be unavailable (private mode); reveal anyway.
      }
      setDismissed(false);
      dispatch({ type: "waiting" });
    };
    serwist.addEventListener("waiting", onWaiting);
    return () => serwist.removeEventListener("waiting", onWaiting);
  }, [serwist]);

  if (!state.visible || dismissed) return null;

  function handleDismiss() {
    try {
      window.sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // sessionStorage may be unavailable (private mode); collapse for this render anyway.
    }
    setDismissed(true);
    dispatch({ type: "dismiss" });
  }

  function handleReload() {
    if (!serwist) return;
    // Pitfall 4 order: register the `controlling` listener → reload the page AFTER the new SW
    // takes control, THEN message skip-waiting so the waiting worker activates. The worker-side
    // Serwist auto-handles the {type:"SKIP_WAITING"} message (skipWaiting is unset in sw.ts).
    serwist.addEventListener("controlling", () => window.location.reload());
    dispatch({ type: "reload" });
    serwist.messageSkipWaiting();
  }

  return (
    <div
      className={cn(
        // Bottom-anchored. Mobile: full-width minus px-4, offset ABOVE the fixed BottomNav and the
        // iOS safe area so it never collides with the tab bar or the top status strip. Desktop
        // (≥lg, where BottomNav is hidden): a max-w-sm card floating bottom-right.
        "fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-50 px-4",
        "lg:inset-x-auto lg:right-4 lg:bottom-4 lg:left-auto lg:max-w-sm lg:px-0",
        // Entrance gated by reduced-motion (instant appear under prefers-reduced-motion).
        "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2",
      )}
    >
      <Alert
        role="status"
        aria-live="polite"
        className="items-start border-border bg-card pr-12 shadow-lg"
      >
        <RefreshCw aria-hidden="true" />
        <AlertTitle className="text-sm font-semibold">
          Update available
        </AlertTitle>
        <AlertDescription className="text-foreground">
          A new version is ready.
          <span className="mt-2 flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              onClick={handleReload}
              disabled={state.reloading}
              className="min-h-11"
            >
              Reload
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleDismiss}
              className="min-h-11"
            >
              Later
            </Button>
          </span>
        </AlertDescription>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss update notice"
          className="absolute top-2 right-2 flex min-h-11 min-w-11 items-center justify-center text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      </Alert>
    </div>
  );
}
