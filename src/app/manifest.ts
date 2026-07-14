// src/app/manifest.ts — Next metadata route → /manifest.webmanifest (PWA-01, D-02).
//
// Thin delegate: all values live in the pure, node-tested @/lib/pwa/manifest-config builder
// (mirrors the layout.tsx "keep logic in pure @/lib" idiom). Next auto-injects the
// <link rel="manifest"> tag from this route — do NOT also hand-add a manifest link in layout.tsx.
import type { MetadataRoute } from "next";

import { buildManifest } from "@/lib/pwa/manifest-config";

export default function manifest(): MetadataRoute.Manifest {
  return buildManifest();
}
