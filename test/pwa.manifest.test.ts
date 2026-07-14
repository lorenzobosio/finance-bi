import { describe, expect, it } from "vitest";

// Wave-0 TDD RED (PWA-01, D-02) — freezes the frozen web-manifest contract for the not-yet-existent
// PURE builder `@/lib/pwa/manifest-config` (built GREEN in 11-04). RED at RUNTIME only ("Cannot find
// package '@/lib/pwa/manifest-config'"); the COMPUTED import specifier keeps `tsc --noEmit` green
// while the module is absent (same idiom as test/cashflow.safe-to-spend.test.ts).
//
// `buildManifest()` is PURE — it returns a static object; it never fetches, never reads a clock.
// Values are pinned from 11-UI-SPEC §Manifest Theming (name "Finance BI"; theme/background the
// neutral dark surface "#0a0a0a", NOT brand violet — 10% accent discipline; icons 192/512 any +
// 192/512 maskable, all image/png under /icons/). The exact-value assertions are the frozen D-02
// contract: a later weak implementation that drifts the theme colour or drops a maskable icon fails.
//
// Synthetic values only; no PII.

const MODULE = "@/lib/pwa/manifest-config";

interface ManifestIcon {
  src: string;
  sizes: string;
  type: string;
  purpose: string;
}
interface Manifest {
  name: string;
  short_name: string;
  display: string;
  orientation?: string;
  start_url: string;
  scope: string;
  theme_color: string;
  background_color: string;
  icons: ManifestIcon[];
}

async function buildManifest(): Promise<Manifest> {
  const mod = (await import(/* @vite-ignore */ MODULE)) as Record<string, unknown>;
  return (mod.buildManifest as () => Manifest)();
}

describe("buildManifest — identity + standalone display (D-02)", () => {
  it('names the app "Finance BI" and installs standalone at the root scope', async () => {
    const m = await buildManifest();
    expect(m.name).toBe("Finance BI");
    expect(m.short_name).toBe("Finance BI");
    expect(m.display).toBe("standalone");
    expect(m.start_url).toBe("/");
    expect(m.scope).toBe("/");
  });
});

describe("buildManifest — neutral dark theming, NOT brand (10% accent discipline)", () => {
  it("pins theme_color and background_color to the dark surface #0a0a0a", async () => {
    const m = await buildManifest();
    expect(m.theme_color).toBe("#0a0a0a");
    expect(m.background_color).toBe("#0a0a0a");
  });
});

describe("buildManifest — the frozen icon set (192/512 any + 192/512 maskable)", () => {
  it("includes a 192x192 any-purpose icon", async () => {
    const m = await buildManifest();
    expect(
      m.icons.some((i) => i.sizes === "192x192" && i.purpose === "any"),
    ).toBe(true);
  });

  it("includes a 512x512 any-purpose icon", async () => {
    const m = await buildManifest();
    expect(
      m.icons.some((i) => i.sizes === "512x512" && i.purpose === "any"),
    ).toBe(true);
  });

  it("includes a 192x192 maskable icon", async () => {
    const m = await buildManifest();
    expect(
      m.icons.some((i) => i.sizes === "192x192" && i.purpose === "maskable"),
    ).toBe(true);
  });

  it("includes a 512x512 maskable icon", async () => {
    const m = await buildManifest();
    expect(
      m.icons.some((i) => i.sizes === "512x512" && i.purpose === "maskable"),
    ).toBe(true);
  });

  it("serves every icon as a PNG from /icons/", async () => {
    const m = await buildManifest();
    expect(m.icons.length).toBeGreaterThanOrEqual(4);
    for (const icon of m.icons) {
      expect(icon.src.startsWith("/icons/")).toBe(true);
      expect(icon.type).toBe("image/png");
    }
  });
});
