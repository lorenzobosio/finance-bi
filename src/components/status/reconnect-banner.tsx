"use client";

import { useEffect, useState } from "react";
import { PlugZap, X } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ReconnectState } from "@/lib/status/connection-status";

// ReconnectBanner (REM-01, D-01/D-02) — the TWO-STATE reconnect escalation.
//
// Renders EITHER the calm amber "expiring soon" surface (reconnectState==="expiring", ≤14 days
// out — the pre-expiry countdown) OR the loud destructive "expired" surface
// (reconnectState==="expired", the daily sync is paused) — NEVER both. `expired` supersedes
// `expiring` upstream (deriveReconnectState), so a single element covers UI-SPEC stack slots 1 & 3.
// Renders nothing when reconnectState==="none" or the notice was soft-dismissed this session.
//
// Fernanda-first "Reconnect now" CTA: POSTs the owner-gated /api/eb/reconnect start route and, on a
// 200 `{ url }`, navigates the browser to the bank's authorization page. On a 503 (the EB Vercel env
// is not configured yet) — or any non-URL result — it reveals the calm CLI fallback text instead of
// breaking (D-03). The CTA is the DEFAULT --primary Button (greyscale), NOT the brand accent. A
// "Prefer the terminal?" disclosure always offers `pnpm eb:connect` (D-02).
//
// Soft-dismiss per session (unchanged idiom): `dismissed` starts false so SSR/CSR agree (no hydration
// mismatch); the effect reads sessionStorage after mount; the banner REAPPEARS on the next load while
// the reconnect state persists — never permanently dismissible. aria-live is assertive for expired
// (action required) and polite for expiring (a gentle heads-up). Icons are aria-hidden — meaning is
// always carried by text. Every touch target is ≥44px (min-h-11 / min-w-11).

const DISMISS_KEY = "reconnect-banner-dismissed";

/**
 * The locked expiring-soon body copy (UI-SPEC §1). `{n}` = expiresInDays; the 14-day threshold is a
 * named upstream constant, never surfaced as a number. n≤0 (today / just overdue but not yet the
 * expired state) reads "today"; n===1 reads "tomorrow"; n>1 reads "in {n} days".
 */
function expiringBody(expiresInDays: number | null): string {
  if (expiresInDays === null || expiresInDays <= 0) {
    return "Your bank link expires today. Reconnect now to keep the daily sync running.";
  }
  if (expiresInDays === 1) {
    return "Your bank link expires tomorrow. Reconnect now to keep the daily sync running.";
  }
  return `Your bank link expires in ${expiresInDays} days. Reconnect now to keep the daily sync running.`;
}

export function ReconnectBanner({
  reconnectState,
  expiresInDays,
}: {
  reconnectState: ReconnectState;
  expiresInDays: number | null;
}) {
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showCliFallback, setShowCliFallback] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.sessionStorage.getItem(DISMISS_KEY) === "1") {
      setDismissed(true);
    }
  }, []);

  if (reconnectState === "none" || dismissed) return null;

  function handleDismiss() {
    try {
      window.sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // sessionStorage may be unavailable (private mode); collapse for this render anyway.
    }
    setDismissed(true);
  }

  async function handleReconnect() {
    setBusy(true);
    try {
      const res = await fetch("/api/eb/reconnect", { method: "POST" });
      if (res.ok) {
        const data = (await res.json().catch(() => null)) as { url?: string } | null;
        if (data?.url) {
          // Navigate to the bank's authorization page (the /eb/callback exchange closes the loop).
          window.location.assign(data.url);
          return;
        }
      }
      // 503 (EB env absent) or any non-URL result → reveal the calm CLI fallback (never break, D-03).
      setShowCliFallback(true);
    } catch {
      setShowCliFallback(true);
    } finally {
      setBusy(false);
    }
  }

  const isExpired = reconnectState === "expired";

  return (
    <Alert
      role="alert"
      aria-live={isExpired ? "assertive" : "polite"}
      className={cn(
        "w-full items-start rounded-none border-x-0 border-t-0 px-4 py-2 pr-12 sm:px-6",
        isExpired
          ? "border-destructive/30 bg-destructive/10 text-destructive"
          : "border-[var(--warning)]/25 bg-[var(--warning)]/10 text-[var(--warning)]",
      )}
    >
      <PlugZap aria-hidden="true" />
      <AlertTitle
        className={cn(
          "text-sm font-semibold",
          isExpired ? "text-destructive" : "text-[var(--warning)]",
        )}
      >
        {isExpired ? "Reconnect needed" : "Bank connection renews soon"}
      </AlertTitle>
      <AlertDescription
        className={cn("text-sm", isExpired ? "text-foreground" : "text-[var(--warning)]")}
      >
        {isExpired
          ? "The bank connection has expired — the daily sync is paused. Reconnect to resume it."
          : expiringBody(expiresInDays)}

        <span className="mt-2 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            className="min-h-11"
            onClick={handleReconnect}
            disabled={busy}
            aria-busy={busy}
          >
            {busy ? "Reconnecting…" : "Reconnect now"}
          </Button>
        </span>

        {showCliFallback && (
          <span className="mt-2 block text-sm text-muted-foreground">
            In-app reconnect isn&apos;t set up in this environment yet. Reconnect from your terminal
            with{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.8rem]">
              pnpm eb:connect
            </code>
            .
          </span>
        )}

        <details className="mt-2">
          <summary className="min-h-11 cursor-pointer list-none py-1 text-sm underline-offset-2 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
            Prefer the terminal?
          </summary>
          <span className="mt-1 block text-sm text-muted-foreground">
            Run{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.8rem]">
              pnpm eb:connect
            </code>{" "}
            to reconnect from your machine.
          </span>
        </details>
      </AlertDescription>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dismiss reconnect notice"
        className="absolute top-2 right-2 flex min-h-11 min-w-11 items-center justify-center text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <X aria-hidden="true" className="size-4" />
      </button>
    </Alert>
  );
}
