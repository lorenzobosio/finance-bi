import { defineConfig, devices } from "@playwright/test";

// Phase-7 Wave-0 E2E harness scaffold (E2E-01/02, D-11/12).
//
// This is the minimal, committable Playwright config the phase's E2E job builds on. It does NOT
// yet wire a `webServer` — the full CI job (07-08) boots the Supabase local stack (`supabase start`
// → `drizzle-kit migrate` → `pnpm seed:demo`) and the `NEXT_PUBLIC_DEMO=1` build against the local
// anon key/url, then runs these specs (RESEARCH §"CI e2e job skeleton"). Locally the specs are RED
// (no running server / no `/api/health` route yet) — the intended Wave-0 RED state.
//
// `baseURL` defaults to the local `next start` port; override with PLAYWRIGHT_BASE_URL in CI.
export default defineConfig({
  testDir: "./tests/e2e",
  // CI runs against the demo build on the Supabase local stack; keep the harness deterministic.
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
