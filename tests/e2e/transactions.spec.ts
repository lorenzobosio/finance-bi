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
    const bodyText = (await page.innerText("body")) ?? "";
    expect(bodyText.toLowerCase()).not.toContain("lorenzo");
    expect(bodyText.toLowerCase()).not.toContain("fernanda");
  });
});

// Power-table critical-flow E2E (TXN-01/02, D-03/04/05). Authored RED in Wave 0 — turns green after
// 08-04 upgrades the transactions page to the @tanstack/react-table power table (filter/sort/search
// toolbar in URL params) and 08-05 adds the owner-filtered CSV export. Runs on the same seeded anon
// demo build. Contract for 08-04: the toolbar has a search input (placeholder /search/i) + at least one
// filter control (a combobox); filters live in URL search params (e.g. ?flow=cost). Contract for 08-05:
// an "Export CSV" affordance is visible on the page.
test.describe("Transactions — the upgraded power table (filter / search / CSV)", () => {
  test("renders the filter + search toolbar", async ({ page }) => {
    await page.goto("/transactions");
    // A free-text search input (D-04) …
    await expect(page.getByPlaceholder(/search/i)).toBeVisible();
    // … and at least one filter control (category / cost center / account / flow — a select/combobox).
    await expect(page.getByRole("combobox").first()).toBeVisible();
  });

  test("applying a filter via URL search param still renders a populated table with no PII", async ({
    page,
  }) => {
    // Filters are shareable URL params (D-04) — a direct hit still server-renders a populated table.
    await page.goto("/transactions?flow=cost");
    await expect(page.locator("table").first()).toBeVisible();
    await expect(page.getByText("No transactions yet")).toHaveCount(0);
    const bodyText = (await page.innerText("body")) ?? "";
    expect(bodyText.toLowerCase()).not.toContain("lorenzo");
    expect(bodyText.toLowerCase()).not.toContain("fernanda");
  });

  test("hides the owner-only CSV export on the anon demo build (TXN-02 owner-gate)", async ({
    page,
  }) => {
    await page.goto("/transactions");
    // The CSV export (D-05) is OWNER-ONLY — the route 403s for demo/anon and the tx-toolbar `!demo`
    // gate hides the button on the demo build. The anon E2E can't log in, so it verifies the GATE
    // (export is NOT exposed on the public surface); the encoder itself is unit-tested (test/tx-csv).
    await expect(page.getByRole("link", { name: /export csv/i }).or(
      page.getByRole("button", { name: /export csv/i }),
    )).toHaveCount(0);
  });
});
