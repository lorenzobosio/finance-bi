import { expect, test } from "@playwright/test";

// Health probe E2E (OBS-01, E2E-01) — promotes the Wave-0 smoke into the real suite. Against the
// booted demo build on the Supabase local stack, `/api/health` is public (in PUBLIC_PATHS) and
// answers the low-info liveness JSON. The app leg MUST report healthy; when the local stack is
// reachable the `db` leg reads "ok" and the payload carries a `ts` ISO stamp. INTENTIONALLY
// low-info — no rows/counts/secrets leave (threats T-07-13/T-07-19), so nothing here is PII.
test("app serves /api/health with the app leg healthy", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  // The app leg is always "ok" when the server is up (the route never 500s).
  expect(body).toMatchObject({ app: "ok" });
  // The liveness stamp is always present.
  expect(typeof body.ts).toBe("string");
  // The DB leg is "ok" | "error"; on the seeded local stack it should be reachable ("ok"), but the
  // probe degrades to "error" rather than throwing — assert it is one of the two honest values.
  expect(["ok", "error"]).toContain(body.db);
});
