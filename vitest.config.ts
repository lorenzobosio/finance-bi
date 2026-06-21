import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Wave 0 Nyquist test harness (Phase 0).
// Unit/integration tests run in the node environment; the `@/*` alias resolves
// to ./src so test files import production targets the same way the app does.
export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    // No watch mode — `vitest run` is invoked explicitly via the `test` script.
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
