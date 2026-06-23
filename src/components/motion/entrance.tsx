"use client";

import { domAnimation, LazyMotion, m } from "motion/react";

// Reusable entrance-motion islands (DSN-03). A subtle fade-up used when KPI cards / sections
// first mount. Built on LazyMotion + domAnimation + `m` — NEVER the full root motion import
// (that pulls ~34 KB synchronously; LazyMotion code-splits the feature bundle to ~4.6 KB).
// Reduced motion is fully gated by the root <MotionConfig reducedMotion="user">: under it,
// the animation collapses to the final state instantly.
//
// Stagger is CAPPED at 6 (RESEARCH §Pitfall 4): items past index 5 share the same final delay
// so a long grid never produces a slow cascade.

const ENTRANCE = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
} as const;

interface EntranceProps {
  children: React.ReactNode;
  /** Position in a staggered group; the delay is capped at index 5. */
  index?: number;
  className?: string;
}

/**
 * A single fade-up entrance. Wrap a KPI card / section. For a group, pass an incrementing
 * `index` to stagger (capped at 6). Each instance carries its own LazyMotion so callers can
 * stay Server Components and only opt the wrapped subtree into the client.
 */
export function Entrance({ children, index = 0, className }: EntranceProps) {
  const delay = Math.min(index, 5) * 0.07;
  return (
    <LazyMotion features={domAnimation}>
      <m.div
        initial={ENTRANCE.initial}
        animate={ENTRANCE.animate}
        transition={{ duration: 0.25, ease: "easeOut", delay }}
        className={className}
      >
        {children}
      </m.div>
    </LazyMotion>
  );
}
