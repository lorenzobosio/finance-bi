import { expect, test } from "@playwright/test";

// Phase-7 Wave-0 RED placeholder (OBS-01, E2E-01). GETs the liveness probe and expects the app leg
// to report healthy. RED now — there is no running server AND no `/api/health` route yet (both land
// later: the route in 07-05, the CI webServer wiring in 07-08). This becomes part of the real E2E
// suite once the Supabase local stack + demo build are booted by the CI e2e job. Kept minimal on
// purpose: no `webServer`, no fixtures — just the contract that `/api/health` answers `{ app: "ok" }`.
test("app serves /api/health", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(body).toMatchObject({ app: "ok" });
});
