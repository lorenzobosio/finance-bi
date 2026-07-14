import { defineConfig, devices } from "@playwright/test";

// Phase-7 E2E harness (E2E-01/02, D-11/12) — the merge-gating critical-flow suite.
//
// The suite runs against the `NEXT_PUBLIC_DEMO=1` BUILD on top of the Supabase LOCAL STACK
// (`supabase start` → Postgres + PostgREST + GoTrue in Docker, no external account), seeded by the
// single PII-free demo generator (`scripts/seed-demo.ts` → `src/lib/demo/generator.ts`) + the
// migrations. The demo build early-returns before Google OAuth (`src/middleware.ts`) and the anon
// RLS cap pins every read to `is_demo=true`, so the demo path exercises the full render + the
// anon-no-leak boundary WITHOUT any headless IdP (RESEARCH Pitfall 3/4).
//
// The `webServer` OWNS the app lifecycle: it builds + starts the demo build, wiring the local
// stack's URL/anon key through env. In CI the e2e job boots the stack + migrates + seeds, captures
// the local anon key into the process env (`supabase status --output json`), then runs
// `pnpm exec playwright test` — Playwright brings the app up itself and waits on `/api/health`.
//
// `baseURL` defaults to the local `next start` port; override with PLAYWRIGHT_BASE_URL.
const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 3000);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  // Deterministic in CI: one worker, retry once; parallel locally for speed.
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  // A generous global timeout: the first navigation may wait on the demo build's cold caches.
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  // Build + start the DEMO build; Playwright waits until `/api/health` answers (app leg 200) before
  // running the specs. `NEXT_PUBLIC_DEMO=1` is fixed here; the Supabase URL/anon key come from the
  // env the CI e2e job (or a local `supabase start`) provides, defaulting to the local-stack ports.
  webServer: {
    command: "pnpm build && pnpm start",
    url: `${baseURL}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    env: {
      NEXT_PUBLIC_DEMO: "1",
      NEXT_PUBLIC_SUPABASE_URL:
        process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    },
  },
});
