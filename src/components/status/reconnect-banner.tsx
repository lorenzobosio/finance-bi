"use client";

import { useEffect, useState } from "react";
import { PlugZap, X } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Reconnect-needed banner (D-16 / ING-05) — the loudest passive (non-blocking) state.
//
// Shown ONLY when needsReconnect (connections.consent_status='expired' / a recorded 403).
// Destructive palette (the only place --destructive is used in Phase 1). It informs and
// points to the fix (`pnpm eb:connect`) — it does NOT modal-block or disable the app.
//
// Soft-dismiss per session: the X collapses it for the current session (sessionStorage,
// client-only) and it REAPPEARS on next load while the expired/403 state persists — never
// permanently dismissible (D-16 requires it stay visible until consent is actually
// restored). role="alert" aria-live="assertive" (action required). Icons are aria-hidden.

const DISMISS_KEY = "reconnect-banner-dismissed";

export function ReconnectBanner({ needsReconnect }: { needsReconnect: boolean }) {
  // Start dismissed=false so SSR and the first client render agree (no hydration mismatch);
  // the effect reads sessionStorage after mount and collapses if already dismissed this session.
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.sessionStorage.getItem(DISMISS_KEY) === "1") {
      setDismissed(true);
    }
  }, []);

  if (!needsReconnect || dismissed) return null;

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
        "w-full items-start rounded-none border-x-0 border-t-0 border-destructive/30",
        "bg-destructive/10 px-4 py-2 pr-12 text-destructive",
      )}
    >
      <PlugZap aria-hidden="true" />
      <AlertTitle className="text-sm font-semibold text-destructive">
        Reconnect needed
      </AlertTitle>
      <AlertDescription className="text-sm text-foreground">
        The bank connection has expired. Run{" "}
        <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.8rem]">
          pnpm eb:connect
        </code>{" "}
        to restore the daily sync.
        <span className="mt-1 block">
          <Button
            asChild
            variant="link"
            size="sm"
            className="h-auto px-0 text-destructive"
          >
            <a
              href="https://enablebanking.com/docs/api/quick-start/"
              target="_blank"
              rel="noreferrer"
            >
              How to reconnect
            </a>
          </Button>
        </span>
      </AlertDescription>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dismiss reconnect notice"
        className="absolute top-2 right-2 text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <X aria-hidden="true" className="size-4" />
      </button>
    </Alert>
  );
}
