// src/lib/pwa/manifest-config.ts — the PWA web-manifest builder (PWA-01, D-02). PURE, zero-IO.
//
// `buildManifest()` returns a static `MetadataRoute.Manifest` object — it never fetches, never
// reads a clock, never imports serwist. Every value is pinned from 11-UI-SPEC §Manifest Theming:
//   - name/short_name "Finance BI" (matches the sidebar wordmark).
//   - display standalone + orientation portrait (app-like, mobile-first install target for Fernanda).
//   - start_url/scope "/" (the home dashboard).
//   - theme_color/background_color "#0a0a0a" — the NEUTRAL DARK surface, deliberately NOT the brand
//     violet: the OS status-bar/splash integrate without spending the 10% accent on chrome; the
//     brand-violet glyph reads crisply on this dark field (D-02 "dark brand").
//   - icons: 192 + 512 (any) + 192 + 512 (maskable), all image/png under /icons/ (see Icon Set).
//
// Pure-engine convention (11-PATTERNS §Pure-engine): logic lives here so it stays node-testable;
// src/app/manifest.ts is only the thin Next metadata-route delegate. Consumed by the frozen
// contract test/pwa.manifest.test.ts — do NOT drift the theme colour or drop a maskable icon.

import type { MetadataRoute } from "next";

export function buildManifest(): MetadataRoute.Manifest {
  return {
    name: "Finance BI",
    short_name: "Finance BI",
    description: "Household finance BI — how far to €100k, at a glance.",
    display: "standalone",
    orientation: "portrait",
    start_url: "/",
    scope: "/",
    theme_color: "#0a0a0a",
    background_color: "#0a0a0a",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
