import { format } from "date-fns";
import { CircleCheck, CircleHelp, TriangleAlert } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { deriveFreshness, type Freshness } from "@/lib/status/connection-status";
import { cn } from "@/lib/utils";

// Freshness banner (D-15 / ING-06) — the global "data as of {date}" trust strip.
//
// ALWAYS shown (the fresh state is a passive trust signal — "every dashboard shows", not a
// notification, so it is never dismissible). Colors derive from globals.css tokens; the calm
// --warning token surface is reserved EXCLUSIVELY for stale/unknown (dark+light safe, matching
// overspend-banner — NOT the old hard-coded amber-50/900 which broke in dark mode).
// Icons are decorative (aria-hidden) — meaning is carried by text + label, never color alone.
//   role="status" aria-live="polite" (non-urgent).

/** Absolute date in the mono token, format "d MMM yyyy" (e.g. 21 Jun 2026). Never bare ISO. */
function formatSyncDate(d: Date): string {
  return format(d, "d MMM yyyy");
}

const FRESHNESS_ICON: Record<Freshness, typeof CircleCheck> = {
  fresh: CircleCheck,
  stale: TriangleAlert,
  unknown: CircleHelp,
};

export function FreshnessBanner({ lastSyncAt }: { lastSyncAt: Date | null }) {
  const state = deriveFreshness(lastSyncAt, new Date());
  const Icon = FRESHNESS_ICON[state];

  // fresh -> neutral muted surface; stale/unknown -> the reserved amber warning palette.
  const isWarning = state !== "fresh";

  return (
    <Alert
      role="status"
      aria-live="polite"
      className={cn(
        "w-full items-center rounded-none border-x-0 border-t-0 px-4 py-2",
        isWarning
          ? "border-[var(--warning)]/25 bg-[var(--warning)]/10 text-[var(--warning)]"
          : "border-border bg-muted text-foreground",
      )}
    >
      <Icon aria-hidden="true" />
      <AlertDescription
        className={cn("text-sm", isWarning ? "text-[var(--warning)]" : "text-foreground")}
      >
        {state === "fresh" && lastSyncAt && (
          <span>
            Data as of{" "}
            <span className="font-mono font-medium text-muted-foreground">
              {formatSyncDate(lastSyncAt)}
            </span>
            .
          </span>
        )}
        {state === "stale" && lastSyncAt && (
          <span>
            Data may be out of date — last successful sync was{" "}
            <span className="font-mono font-medium">{formatSyncDate(lastSyncAt)}</span>.
          </span>
        )}
        {state === "unknown" && (
          <span>
            No data synced yet. The first import will appear here once the daily sync runs.
          </span>
        )}
      </AlertDescription>
    </Alert>
  );
}
