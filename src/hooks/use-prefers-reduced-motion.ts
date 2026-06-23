"use client";

import { useEffect, useState } from "react";

// usePrefersReducedMotion (DSN-03). Reads the `(prefers-reduced-motion: reduce)` media query
// and tracks it reactively — the JS-side companion to the global two-layer gate (Layer-1 CSS
// in globals.css + Layer-2 <MotionConfig reducedMotion="user"> at the root). Recharts'
// `isAnimationActive` and the €4k celebration sweep both opt OUT via this hook.
//
// SSR-safe: defaults to `true` (motion OFF) until mounted so the first server/client render
// never flashes an animation that the user disabled. After hydration it reflects the real
// preference and updates live if the user toggles it.

const QUERY = "(prefers-reduced-motion: reduce)";

export function usePrefersReducedMotion(): boolean {
  const [prefersReduced, setPrefersReduced] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia(QUERY);
    setPrefersReduced(mql.matches);
    const onChange = (e: MediaQueryListEvent) => setPrefersReduced(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return prefersReduced;
}
