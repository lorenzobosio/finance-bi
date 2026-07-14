import { expect, test } from "@playwright/test";

// Transactions critical-flow E2E (E2E-02, D-12). On the seeded demo build the table renders the
// synthetic demo rows (is_demo=true; no PII — no @-email, no IBAN, no real owner name). Asserts the
// page heading + a populated table (the dense keyset-paginated table renders a <table>), and that
// the empty-state ("No transactions yet") does NOT show — the demo always has rows.
test.describe("Transactions — the demo table renders rows", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/transactions");
  });

  test("renders the Transactions heading", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: "Transactions", exact: true }),
    ).toBeVisible();
  });

  test("renders a populated table (not the empty state)", async ({ page }) => {
    // The shadcn <Table> renders a real <table>; on the seeded demo it carries data rows.
    await expect(page.locator("table").first()).toBeVisible();
    await expect(page.getByText("No transactions yet")).toHaveCount(0);
  });

  test("carries no PII — no real owner name leaks into the demo rows", async ({ page }) => {
    // The public demo is fully anonymized (Alice/Bob personas). The real owners must never appear.
    const bodyText = (await page.textContent("body")) ?? "";
    expect(bodyText.toLowerCase()).not.toContain("lorenzo");
    expect(bodyText.toLowerCase()).not.toContain("fernanda");
  });
});
