// src/app/sw.ts — the Serwist service-worker entry (PWA-01/02, D-04/D-05/D-07).
// Compiled to public/sw.js by @serwist/next's webpack plugin at `next build` (NOT by root tsc —
// this file is excluded from tsconfig.json and typed under tsconfig.sw.json / Pitfall 1).
//
// Runtime caching = [financialNetworkFirst, ...defaultCache]: the explicit financial NetworkFirst
// rule is PREPENDED so it wins the matcher race for the protected routes (a legible, unit-tested
// strict subset of what defaultCache already does — defaultCache already NetworkFirsts pages/RSC).
// No networkTimeoutSeconds → money is never served stale while online (D-07). A cold-offline
// document falls back to the precached /~offline route (D-05). skipWaiting is NOT set (D-06/Pitfall
// 4): the update prompt drives skip-waiting on user consent; the worker auto-handles SKIP_WAITING.

import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, RuntimeCaching, SerwistGlobalConfig } from "serwist";
import { ExpirationPlugin, NetworkFirst, Serwist } from "serwist";
import { FINANCIAL_CACHE, financialRouteMatcher } from "@/lib/pwa/financial-cache";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}
declare const self: ServiceWorkerGlobalScope;

// D-04 / PWA-02: an EXPLICIT NetworkFirst for the protected financial routes, prepended before
// defaultCache. No networkTimeoutSeconds → online always fresh; short bounded expiration keeps the
// offline-fallback copy small + short-lived (the descriptor is the pure, node-tested shape).
const financialNetworkFirst: RuntimeCaching = {
  matcher: ({ request, url, sameOrigin }) =>
    financialRouteMatcher({ request, url, sameOrigin }),
  handler: new NetworkFirst({
    cacheName: FINANCIAL_CACHE.cacheName,
    plugins: [
      new ExpirationPlugin({
        maxEntries: FINANCIAL_CACHE.maxEntries,
        maxAgeSeconds: FINANCIAL_CACHE.maxAgeSeconds,
      }),
    ],
    // NO networkTimeoutSeconds (D-07): online = always fresh.
  }),
};

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  clientsClaim: true,
  navigationPreload: true,
  // skipWaiting NOT set (defaults false) — the update prompt drives skip-waiting on consent (D-06).
  runtimeCaching: [financialNetworkFirst, ...defaultCache],
  fallbacks: {
    entries: [
      { url: "/~offline", matcher: ({ request }) => request.destination === "document" },
    ],
  },
});

serwist.addEventListeners();
