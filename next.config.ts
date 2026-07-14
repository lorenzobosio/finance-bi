import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

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

// Sentry build-time wrap (OBS-01, D-07). This is INERT at runtime without a DSN —
// `instrumentation.ts` / `instrumentation-client.ts` gate `Sentry.init` on the DSN, so
// the wrap adds no behaviour and the build stays clean with NO Sentry account.
//
// Source-map upload is guarded on `SENTRY_AUTH_TOKEN`: without a token there is no
// upload attempt, so the build never fails for a missing account. `silent` keeps the
// build log quiet when nothing is configured.
export default withSentryConfig(nextConfig, {
  silent: true,
  // Only upload source maps when an auth token is present (owner-configured in CI/Vercel).
  // Absent -> no upload, no failure. Present -> maps uploaded for readable stack traces.
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN,
  },
});
