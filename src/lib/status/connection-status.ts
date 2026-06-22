// Server-side connection-status derivation for the global status banners (ING-05/ING-06).
//
// READ PLANE ONLY. getConnectionStatus() reads the latest `connections` row via the
// @supabase/ssr SERVER client under the user's JWT, so RLS enforces the 2-email allowlist
// (mirrors src/lib/supabase/server.ts). It NEVER imports the elevated service_role
// chokepoint (src/lib/supabase/service.ts) nor the postgres driver — that write plane
// belongs to the cron (scripts/ingest.ts) only. Keeping this strictly on @supabase/ssr is
// what keeps FND-03 intact (the Phase-0 ESLint guard + the CI .next/static bundle-grep
// stay green).
//
// The fresh/stale/unknown + needsReconnect logic is factored into PURE helpers
// (deriveFreshness / deriveNeedsReconnect) so it is unit-tested with no DB or network.

import { createClient } from "@/lib/supabase/server";

/**
 * The freshness window. A successful daily pull within this many hours is "fresh"; older is
 * "stale". 36h = one daily cron cycle (~06:00 Europe/Berlin, D-11) plus a half-day grace, so
 * a single late/failed run flips the banner to stale. Kept as a named constant and NEVER
 * inlined into user-facing copy (the UI-SPEC copy mentions no number).
 */
export const STALE_THRESHOLD_HOURS = 36;

export type Freshness = "fresh" | "stale" | "unknown";

/**
 * Pure freshness derivation: "unknown" when never synced (null), "fresh" within the 36h
 * threshold (inclusive at the boundary), "stale" beyond it. `now` is injected so the test
 * is deterministic.
 */
export function deriveFreshness(lastSyncAt: Date | null, now: Date): Freshness {
  if (lastSyncAt === null) return "unknown";
  const ageHours = (now.getTime() - lastSyncAt.getTime()) / (3600 * 1000);
  return ageHours <= STALE_THRESHOLD_HOURS ? "fresh" : "stale";
}

/**
 * Pure reconnect derivation: the bank consent has lapsed when consent_status is 'expired'
 * (the 403/auth-expired state scripts/ingest.ts records on a fail-soft 403). Anything else
 * (active / null / unknown) is not a reconnect prompt.
 */
export function deriveNeedsReconnect(consentStatus: string | null): boolean {
  return consentStatus === "expired";
}

export interface ConnectionStatus {
  freshness: Freshness;
  /** The last successful pull time, for the banner to render "d MMM yyyy" via date-fns. */
  lastSyncAt: Date | null;
  /** True when the bank connection has expired and a `pnpm eb:connect` re-run is needed. */
  needsReconnect: boolean;
}

/**
 * Read the latest connections row (last_pull_at, consent_status) under the user JWT (RLS)
 * and derive the banner state. Returns a safe default (unknown / no reconnect) when there is
 * no connections row yet or the read errors — the banners degrade to the "no data synced
 * yet" empty state rather than crashing the shell.
 */
export async function getConnectionStatus(now: Date = new Date()): Promise<ConnectionStatus> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("connections")
    .select("last_pull_at, consent_status")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return { freshness: "unknown", lastSyncAt: null, needsReconnect: false };
  }

  const lastSyncAt = data.last_pull_at ? new Date(data.last_pull_at as string) : null;

  return {
    freshness: deriveFreshness(lastSyncAt, now),
    lastSyncAt,
    needsReconnect: deriveNeedsReconnect((data.consent_status as string | null) ?? null),
  };
}
