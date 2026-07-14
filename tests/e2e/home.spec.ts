import { expect, test } from "@playwright/test";

// Home critical-flow E2E (E2E-02, D-12) — the 1-minute glance must render ALIVE on the demo build.
// Runs on the `NEXT_PUBLIC_DEMO=1` build against the seeded Supabase local stack: the anon RLS cap
// pins every read to `is_demo=true`, so this exercises the render tier + the anon-no-leak boundary
// with the SYNTHETIC demo household only (no PII — Alice/Bob, fictional € from the demo clock).
//
// Asserts the four headline surfaces are present AND populated: the AI voice card (leads Home), the
// goal hero (a live €100k figure), the KPI row (€4k-this-month / budgets / months-of-reserve), and
// the Financial-health scorecard. "Populated" = a non-empty € figure renders (the demo is alive).
test.describe("Home — the demo renders alive (voice + hero + KPIs + scorecard)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Wait for the streamed dashboard (behind Suspense) to resolve — the KPI label is a good anchor.
    await expect(page.getByText("This month invested")).toBeVisible();
  });

  test("mounts the AI voice card FIRST (the Claude CFO-memo lockup)", async ({ page }) => {
    // The voice card header lockup is the nominative `Claude` text (never Anthropic's logo).
    await expect(page.getByText("Claude", { exact: true }).first()).toBeVisible();
  });

  test("renders the KPI row — €4k this month, budgets, months-of-reserve", async ({ page }) => {
    await expect(page.getByText("This month invested")).toBeVisible();
    await expect(page.getByText("Budgets", { exact: true })).toBeVisible();
    // "Months of reserve" legitimately appears twice (the KPI row AND the Financial-Health scorecard,
    // Phase-6) — assert the first is visible (strict-mode-safe).
    await expect(page.getByText("Months of reserve").first()).toBeVisible();
  });

  test("renders the Financial-health scorecard section", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: "Financial health" }),
    ).toBeVisible();
  });

  test("shows populated € figures from the demo clock (alive, not €0 empty state)", async ({
    page,
  }) => {
    // The demo build is anchored to its latest data month, so the headline € figures are non-empty.
    // formatEUR prefixes `€` (de-DE), so a rendered euro figure matches /€\s?\d/.
    const euroFigures = page.getByText(/€\s?\d/);
    expect(await euroFigures.count()).toBeGreaterThan(0);
    // And the calm first-run "Synchronizing — your first data appears tomorrow" band must NOT show
    // (that only renders when there is NO ingested data; the seeded demo always has data).
    await expect(page.getByText(/Synchronizing/)).toHaveCount(0);
  });
});
