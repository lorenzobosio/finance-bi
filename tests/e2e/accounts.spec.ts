import { expect, test } from "@playwright/test";

// Accounts critical-flow E2E (ACC-01, D-01). Authored RED in Wave 0 — turns green after 08-02 seeds
// the 4 is_demo=true demo accounts + 08-03 ships the /accounts page. Runs on the seeded anon
// NEXT_PUBLIC_DEMO=1 build (07-08 harness): the anon RLS cap pins every read to is_demo=true.
//
// The load-bearing assertion is the anti-Pitfall-2 one: `accounts` was anon-EXCLUDED before 0017, so a
// naive /accounts would render ZERO cards on the public demo (the "silent-empty trap"). This spec fails
// if the page is blank — it MUST show >= 1 alive balance card and NO empty state. And, like every
// no-login surface, it must carry NO real-household PII (no real owner name, no @-email, no IBAN token).
//
// Contract for 08-03: each balance card renders `data-testid="account-card"`.
test.describe("Accounts — the anon demo renders alive balance cards", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/accounts");
  });

  test("renders the Accounts heading", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Accounts", exact: true })).toBeVisible();
  });

  test("renders AT LEAST ONE balance card (not the silent-empty trap — Pitfall 2)", async ({
    page,
  }) => {
    // The anti-Pitfall-2 assertion: the anon demo /accounts must NOT be blank.
    await expect(page.getByTestId("account-card").first()).toBeVisible();
    expect(await page.getByTestId("account-card").count()).toBeGreaterThanOrEqual(1);
    // No "no accounts" empty state — the seeded demo always has cards.
    await expect(page.getByText(/no accounts/i)).toHaveCount(0);
  });

  test("carries no PII — no real owner name / @-email / IBAN-shaped token leaks", async ({
    page,
  }) => {
    // innerText = VISIBLE text only (excludes <script>/<style>), so framework CSS `@media`/`@keyframes`
    // and inline-JS "@" don't false-positive — the PII check must catch a real email in what a user
    // SEES, not a CSS at-rule.
    const body = (await page.innerText("body")) ?? "";
    const lc = body.toLowerCase();
    // The public demo is fully anonymized (Alice/Bob personas). The real owners must never appear.
    expect(lc).not.toContain("lorenzo");
    expect(lc).not.toContain("fernanda");
    // No REAL email address and no IBAN-shaped token in the visible demo surface (D4-06, R-D).
    expect(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(body)).toBe(false);
    expect(/\b[A-Z]{2}[0-9]{2}[A-Z0-9]{4,}\b/.test(body)).toBe(false);
  });
});
