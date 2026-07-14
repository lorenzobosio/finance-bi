import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Wave-0 TDD RED (PWA-02, D-04/D-07) — freezes the PURE, node-testable caching contract for the
// not-yet-existent `@/lib/pwa/financial-cache` (built GREEN in 11-03). RED at RUNTIME only ("Cannot
// find package '@/lib/pwa/financial-cache'"); the COMPUTED import specifier keeps `tsc --noEmit`
// green while the module is absent (same idiom as test/cashflow.safe-to-spend.test.ts).
//
// `financialRouteMatcher` is PURE — it inspects a Request/URL/sameOrigin triad and returns a boolean;
// it imports nothing from serwist (whose strategy classes reference web APIs) and never touches the
// SW. The descriptor `FINANCIAL_CACHE` is a static shape mapped onto the real `NetworkFirst` in
// sw.ts. The money-never-stale property (D-07) is pinned as `networkTimeoutSeconds === undefined`
// (T-11-01): a later stale-serving config that adds a timeout fails this suite.
//
// The sw.ts source-presence grep is a staged-RED anchor: it stays RED via ENOENT until 11-03 creates
// src/app/sw.ts (the health-page convention from test/types-drift.test.ts), then turns GREEN once the
// worker wires `...defaultCache` + a `NetworkFirst` rule.
//
// Synthetic same-origin URLs only; no PII.

const MODULE = "@/lib/pwa/financial-cache";

interface MatcherArgs {
  request: Request;
  url: URL;
  sameOrigin: boolean;
}
interface FinancialCache {
  cacheName: string;
  strategy: string;
  networkTimeoutSeconds: number | undefined;
  maxEntries: number;
  maxAgeSeconds: number;
}
interface FinancialCacheModule {
  financialRouteMatcher: (args: MatcherArgs) => boolean;
  FINANCIAL_CACHE: FinancialCache;
}

async function load(): Promise<FinancialCacheModule> {
  const mod = (await import(/* @vite-ignore */ MODULE)) as Record<string, unknown>;
  return {
    financialRouteMatcher: mod.financialRouteMatcher as (a: MatcherArgs) => boolean,
    FINANCIAL_CACHE: mod.FINANCIAL_CACHE as FinancialCache,
  };
}

const ORIGIN = "https://app.local";

/** A same-origin RSC navigation request to `path` (RSC: 1 header). */
function rscRequest(path: string): MatcherArgs {
  const url = new URL(path, ORIGIN);
  const request = new Request(url, { headers: { RSC: "1" } });
  return { request, url, sameOrigin: true };
}

/** A same-origin document request to `path` (Content-Type: text/html). */
function docRequest(path: string): MatcherArgs {
  const url = new URL(path, ORIGIN);
  const request = new Request(url, { headers: { "Content-Type": "text/html" } });
  return { request, url, sameOrigin: true };
}

describe("financialRouteMatcher — matches protected financial routes (RSC/document)", () => {
  it("matches an RSC navigation to /goal", async () => {
    const { financialRouteMatcher } = await load();
    expect(financialRouteMatcher(rscRequest("/goal"))).toBe(true);
  });

  it("matches a document request to the home route /", async () => {
    const { financialRouteMatcher } = await load();
    expect(financialRouteMatcher(docRequest("/"))).toBe(true);
  });

  it("matches an RSC navigation to /transactions", async () => {
    const { financialRouteMatcher } = await load();
    expect(financialRouteMatcher(rscRequest("/transactions"))).toBe(true);
  });
});

describe("financialRouteMatcher — excludes non-financial / non-navigation traffic", () => {
  it("does NOT match /api/* (the /api/ guard keeps API caching on defaultCache)", async () => {
    const { financialRouteMatcher } = await load();
    expect(financialRouteMatcher(rscRequest("/api/health"))).toBe(false);
  });

  it("does NOT match a cross-origin request (sameOrigin false)", async () => {
    const { financialRouteMatcher } = await load();
    const args = rscRequest("/goal");
    expect(financialRouteMatcher({ ...args, sameOrigin: false })).toBe(false);
  });

  it("does NOT match a non-document non-RSC asset request (e.g. _next/static)", async () => {
    const { financialRouteMatcher } = await load();
    const url = new URL("/_next/static/chunk.js", ORIGIN);
    const request = new Request(url);
    expect(financialRouteMatcher({ request, url, sameOrigin: true })).toBe(false);
  });
});

describe("FINANCIAL_CACHE — the frozen NetworkFirst descriptor (D-04/D-07, T-11-01)", () => {
  it("is a NetworkFirst strategy that never serves stale while online", async () => {
    const { FINANCIAL_CACHE } = await load();
    expect(FINANCIAL_CACHE.strategy).toBe("NetworkFirst");
    // Money-never-stale: NO network timeout, so online always hits the network first.
    expect(FINANCIAL_CACHE.networkTimeoutSeconds).toBeUndefined();
  });

  it("names a non-empty cache and keeps a positive short offline-fallback retention", async () => {
    const { FINANCIAL_CACHE } = await load();
    expect(typeof FINANCIAL_CACHE.cacheName).toBe("string");
    expect(FINANCIAL_CACHE.cacheName.length).toBeGreaterThan(0);
    expect(FINANCIAL_CACHE.maxAgeSeconds).toBeGreaterThan(0);
  });
});

describe("src/app/sw.ts — source-presence anchor (staged-RED until 11-03 wires the worker)", () => {
  it("wires ...defaultCache and a NetworkFirst rule", () => {
    // ENOENT until 11-03 creates the worker entry — the intended staged-RED anchor, NOT a bug.
    const sw = readFileSync(join(__dirname, "..", "src/app/sw.ts"), "utf8");
    expect(sw).toContain("...defaultCache");
    expect(sw).toContain("NetworkFirst");
  });
});
