import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import withSerwistInit from "@serwist/next";

const nextConfig: NextConfig = {
  experimental: {
    // React <ViewTransition> for zero-bundle GPU route cross-fades (DSN-03). Flagged
    // "not recommended for production" on Next 15.5.x — if it proves unstable it degrades
    // gracefully to instant route changes (a no-op), so motion still ships via
    // motion/@number-flow alone (RESEARCH Assumption A3).
    viewTransition: true,
    // Tree-shake the heavy icon/chart/date packages into per-export modules so the client
    // bundle (Fernanda's mobile) only pays for what each page imports.
    optimizePackageImports: ["lucide-react", "recharts", "date-fns"],
  },
};

// Serwist build-time wrap (PWA-01/02, D-01/D-05/D-08). Compiles src/app/sw.ts → public/sw.js at
// `next build` (production uses webpack; the `--turbopack` flag is on `dev` only). Disabled in dev
// AND under DISABLE_PWA=1 so the Playwright e2e production build stays deterministic (Pitfall 5).
// additionalPrecacheEntries carries ONLY the /~offline shell (never a data route — D-07); the
// per-build revision busts it each deploy.
const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  disable:
    process.env.NODE_ENV === "development" || process.env.DISABLE_PWA === "1",
  additionalPrecacheEntries: [
    { url: "/~offline", revision: process.env.BUILD_ID ?? crypto.randomUUID() },
  ],
});

// Sentry build-time wrap (OBS-01, D-07). This is INERT at runtime without a DSN —
// `instrumentation.ts` / `instrumentation-client.ts` gate `Sentry.init` on the DSN, so
// the wrap adds no behaviour and the build stays clean with NO Sentry account.
//
// Source-map upload is guarded on `SENTRY_AUTH_TOKEN`: without a token there is no
// upload attempt, so the build never fails for a missing account. `silent` keeps the
// build log quiet when nothing is configured.
//
// Serwist is nested INSIDE the Sentry wrap so Sentry stays the OUTERMOST config (its build
// hooks run last); its existing options are preserved unchanged.
export default withSentryConfig(withSerwist(nextConfig), {
  silent: true,
  // Only upload source maps when an auth token is present (owner-configured in CI/Vercel).
  // Absent -> no upload, no failure. Present -> maps uploaded for readable stack traces.
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN,
  },
});
