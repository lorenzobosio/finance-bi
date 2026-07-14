import { expect, test } from "@playwright/test";

// Goal-journey critical-flow E2E (E2E-02, D-12). The demo household is authored POST-launch (an
// early launch_date), so `/goal` renders the full journey: the €100k hero, the €4k streak chain,
// and the Brazil / Adventures buckets. Demo build → anon RLS caps reads to `is_demo=true`; all
// figures are synthetic (no PII). Assertions stay on stable copy the page always renders.
test.describe("Goal — the €100k journey (hero + streak + buckets)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/goal");
  });

  test("renders the €100k hero heading", async ({ page }) => {
    // Post-launch: "Our €100k — the journey"; pre-launch: "Our €100k — the freedom fund." — assert
    // the shared "Our €100k" hero regardless of the launch state so the spec is state-robust.
    await expect(page.getByRole("heading", { name: /Our €100k/ })).toBeVisible();
  });

  test("renders the €4k streak chain (a longest-streak read)", async ({ page }) => {
    // The streak paragraph always names the "longest" run (…"longest N" / "Longest: N months").
    await expect(page.getByText(/longest/i).first()).toBeVisible();
  });

  test("renders the Brazil and Adventures buckets", async ({ page }) => {
    await expect(page.getByText("Brazil", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Adventures", { exact: true }).first()).toBeVisible();
  });
});
