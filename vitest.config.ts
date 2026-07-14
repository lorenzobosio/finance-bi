import { configDefaults, defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Wave 0 Nyquist test harness (Phase 0).
// Unit/integration tests run in the node environment; the `@/*` alias resolves
// to ./src so test files import production targets the same way the app does.
export default defineConfig({
  test: {
    environment: "node",
    // `.test.tsx` is included for the status-banner derivation suite; those tsx tests
    // exercise PURE helpers only (no DOM render), so the node environment still applies.
    // `src/**/*.test.ts` covers co-located unit suites (Phase-9 adds the GOAL-09 interaction
    // guard next to its target at src/lib/ingestion/rules/db-rules.test.ts).
    include: ["test/**/*.test.ts", "test/**/*.test.tsx", "src/**/*.test.ts"],
    // QUARANTINE — keeps `main` CI green during Phase 1 TDD.
    // These suites were written test-first and import modules the Phase-1 plans
    // have not built yet, so they throw ERR_MODULE_NOT_FOUND at collection time
    // (a top-level `import` fails before any `describe.skip` could run).
    // DELETE each line the moment its target module lands — that re-arms the test:
    exclude: [...configDefaults.exclude],
    // No watch mode — `vitest run` is invoked explicitly via the `test` script.
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // The real `server-only` package's index.js THROWS at import (so it can never load in a
      // Client Component). Server-plane source modules (e.g. src/lib/db/marts-read.ts) keep their
      // real `import "server-only"` build-guard for the Next bundle — the guard that actually
      // enforces FND-03 lives in the Next build + the CI .next/static bundle-grep, not here. This
      // empty alias applies ONLY under vitest (node) so those modules' PURE, injected-arg helpers
      // (martsCacheKey / martsCacheTag) stay unit-testable without tripping the throw.
      "server-only": fileURLToPath(
        new URL("./test/stubs/server-only.ts", import.meta.url),
      ),
    },
  },
});
