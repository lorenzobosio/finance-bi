// src/lib/pwa/financial-cache.ts — the PURE financial NetworkFirst matcher + descriptor
// (PWA-02, D-04/D-07). Frozen contract: test/pwa.cache-routes.test.ts.
//
// PURE + zero-IO: imports NOTHING from serwist/next (its strategy classes reference web APIs and
// need the `webworker` lib), so this module runs in vitest's `node` env. src/app/sw.ts maps the
// `FINANCIAL_CACHE` descriptor onto the real `NetworkFirst` instance (mirrors the pure-descriptor
// convention of src/lib/cashflow/safe-to-spend.ts).
//
// D-07 (money never stale): FINANCIAL_CACHE is NetworkFirst with `networkTimeoutSeconds` explicitly
// undefined — online ALWAYS re-fetches fresh; the cache is only an offline fallback with a short,
// bounded retention. A later config that adds a timeout would serve a stale figure and fails the suite.

/** The 8 protected financial routes (D-04). "/" covers the home dashboard; the rest are page prefixes. */
const PROTECTED_PREFIXES = [
  "/",
  "/accounts",
  "/cashflow",
  "/goal",
  "/health",
  "/spending",
  "/transactions",
  "/cost-centers",
] as const;

export interface FinancialMatcherArgs {
  request: Request;
  url: URL;
  sameOrigin: boolean;
}

/**
 * financialRouteMatcher — true for a same-origin navigation/RSC request to a protected financial
 * route (never /api/*, never a cross-origin or static-asset request). Pure boolean over the
 * (request, url, sameOrigin) triad.
 */
export function financialRouteMatcher({ request, url, sameOrigin }: FinancialMatcherArgs): boolean {
  if (!sameOrigin) return false;
  if (url.pathname.startsWith("/api/")) return false;

  const isRsc = request.headers.get("RSC") === "1";
  const isDoc =
    (request.headers.get("Content-Type")?.includes("text/html") ?? false) ||
    request.destination === "document";
  // Only navigation/RSC traffic is a financial route — static assets keep defaultCache.
  if (!isRsc && !isDoc) return false;

  return PROTECTED_PREFIXES.some(
    (p) => url.pathname === p || url.pathname.startsWith(p === "/" ? "/" : `${p}/`),
  );
}

export interface FinancialCacheDescriptor {
  cacheName: string;
  strategy: "NetworkFirst";
  /** Explicitly undefined — NO network timeout, so online always hits the network first (D-07). */
  networkTimeoutSeconds: number | undefined;
  maxEntries: number;
  maxAgeSeconds: number;
}

/** The frozen NetworkFirst descriptor for the financial routes (mapped onto a real NetworkFirst in sw.ts). */
export const FINANCIAL_CACHE: FinancialCacheDescriptor = {
  cacheName: "financial-network-first",
  strategy: "NetworkFirst",
  networkTimeoutSeconds: undefined, // D-07: never serve stale while online
  maxEntries: 32, // bounded — the offline-fallback copy is small
  maxAgeSeconds: 60 * 60, // 1h short retention (figures are volatile)
};
