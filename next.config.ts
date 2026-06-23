import type { NextConfig } from "next";

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

export default nextConfig;
