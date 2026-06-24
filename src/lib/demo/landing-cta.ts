// src/lib/demo/landing-cta.ts — the PURE wiring helper for the landing "View demo →" CTA
// (DEMO-04, D4-17). The page (`src/app/(auth)/login/page.tsx`) is a "use client" shell, but the
// CTA's href/disabled resolution is factored into this pure helper so it is node-testable with no
// DOM render (same discipline as `src/lib/demo/mode.ts`'s purity split). `test/landing.test.tsx`
// freezes the contract.
//
// The href comes ONLY from `NEXT_PUBLIC_DEMO_URL` (set just on the real app's Vercel project, so
// the demo subdomain can change without a source edit). When the env is set the CTA is LIVE (not
// disabled); when unset it degrades to `href="#"` and stays disabled — no broken link ever ships.

/** The resolved props the landing page spreads onto its "View demo →" control. */
export interface DemoCtaProps {
  /** The CTA target: `NEXT_PUBLIC_DEMO_URL` when set, else the inert `"#"`. */
  href: string;
  /** True only when the demo URL is unset (the control degrades to a disabled shell). */
  disabled: boolean;
  /** Mirrors `disabled` for the `aria-disabled` attribute; `false` (live) when the URL is set. */
  ariaDisabled: boolean;
}

/**
 * demoCtaProps — resolve the landing "View demo →" CTA wiring from the environment. Pure: reads
 * only `env.NEXT_PUBLIC_DEMO_URL` and returns the href + disabled state. When the URL is present the
 * CTA is a live link; when absent it degrades to `href="#"` and is disabled (D4-17). No URL literal
 * lives here — the value is owner-controlled via the real app's Vercel env.
 */
export function demoCtaProps(
  env: Record<string, string | undefined> = process.env,
): DemoCtaProps {
  const url = env.NEXT_PUBLIC_DEMO_URL;
  const live = typeof url === "string" && url.length > 0;
  return {
    href: live ? url : "#",
    disabled: !live,
    ariaDisabled: !live,
  };
}
