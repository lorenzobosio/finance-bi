import { configDefaults, defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Wave 0 Nyquist test harness (Phase 0).
// Unit/integration tests run in the node environment; the `@/*` alias resolves
// to ./src so test files import production targets the same way the app does.
export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    // QUARANTINE — keeps `main` CI green during Phase 1 TDD.
    // These suites were written test-first and import modules the Phase-1 plans
    // have not built yet, so they throw ERR_MODULE_NOT_FOUND at collection time
    // (a top-level `import` fails before any `describe.skip` could run).
    // DELETE each line the moment its target module lands — that re-arms the test:
    exclude: [
      ...configDefaults.exclude,
      "test/ingest.consent.test.ts", // -> scripts/ingest.ts (plan 01-05 cron)
      "test/ingest.heartbeat.test.ts", // -> scripts/ingest.ts (plan 01-05 cron)
    ],
    // No watch mode — `vitest run` is invoked explicitly via the `test` script.
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
