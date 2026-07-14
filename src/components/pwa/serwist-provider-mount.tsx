"use client";

import type { ReactNode } from "react";
import { SerwistProvider } from "@serwist/next/react";

// PwaProvider (PWA-03, D-06 / D-07) — the thin "use client" island that REGISTERS the app's own
// service worker via @serwist/next/react's SerwistProvider (which wraps @serwist/window; we never
// import @serwist/window directly). Mirrors the CommandPaletteProvider thin-wrapper shape: it only
// wraps `children`, adds no chrome, reads no data and holds no secret (D-07).
//
//   • swUrl "/sw.js" — the exact artifact @serwist/next emits at build (public/sw.js), served from
//     the app origin at scope "/" (T-11-04: our own SW only, no third-party worker).
//   • disable in development — the dev server has no compiled SW; registering there is noise
//     (mirrors next.config's dev-disable, Pitfall 5). Production/e2e still register so the update
//     prompt has a real `waiting` worker to surface.
//
// Mounted ONCE in src/app/(protected)/layout.tsx (never RootLayout, which also serves /login).

export function PwaProvider({ children }: { children: ReactNode }) {
  return (
    <SerwistProvider
      swUrl="/sw.js"
      disable={process.env.NODE_ENV === "development"}
    >
      {children}
    </SerwistProvider>
  );
}
