import { describe, expect, it } from "vitest";

// Wave-0 RED test (DSN-05) — guards the route anglicization. The nav SoT must expose
// anglicized hrefs/labels, carry NO pt-BR `lang` attribute, and use DISTINCT icons for
// Spending vs Transactions (the current duplicate-Receipt-icon bug).
//
// RED until Plan 03-04: today the nav SoT is a module-LOCAL const inside the JSX component
// src/components/app-nav.tsx (not importable into a test without dragging JSX), and it still
// holds the pt-BR entries (`Gastos`/`/gastos`, `Transações`/`/transacoes`, `lang: "pt-BR"`)
// with a duplicate `Receipt` icon. Plan 04 EXTRACTS the SoT into the pure `@/lib/nav-items`
// module (the reuse target for app-sidebar + the ⌘K palette + this test — the same
// extract-for-testability pattern Plan 03-01 used for pickBalance) and anglicizes it. This
// import fails to resolve until then — the intended RED state.
import { NAV_ITEMS } from "@/lib/nav-items";

interface NavItemLike {
  label: string;
  href: string;
  icon: unknown;
  lang?: string;
}

describe("NAV_ITEMS — anglicized nav source of truth (DSN-05)", () => {
  it("is exported as a non-empty array", () => {
    expect(Array.isArray(NAV_ITEMS)).toBe(true);
    expect((NAV_ITEMS as NavItemLike[]).length).toBeGreaterThan(0);
  });

  it("exposes the anglicized hrefs + labels (no pt-BR routes)", () => {
    const byHref = new Map(
      (NAV_ITEMS as NavItemLike[]).map((n) => [n.href, n.label]),
    );
    expect(byHref.get("/")).toBe("Home");
    expect(byHref.get("/spending")).toBe("Spending");
    expect(byHref.get("/cost-centers")).toBe("Cost Centers");
    expect(byHref.get("/transactions")).toBe("Transactions");
    expect(byHref.get("/config")).toBe("Config");
    // The pt-BR routes must be gone entirely.
    expect(byHref.has("/gastos")).toBe(false);
    expect(byHref.has("/transacoes")).toBe(false);
  });

  it("carries no pt-BR lang attribute on any item", () => {
    for (const item of NAV_ITEMS as NavItemLike[]) {
      expect(item.lang).toBeUndefined();
    }
  });

  it("uses DISTINCT icons for Spending and Transactions (no duplicate Receipt)", () => {
    const items = NAV_ITEMS as NavItemLike[];
    const spending = items.find((n) => n.href === "/spending");
    const transactions = items.find((n) => n.href === "/transactions");
    expect(spending, "Spending nav item must exist").toBeDefined();
    expect(transactions, "Transactions nav item must exist").toBeDefined();
    expect(spending?.icon).not.toBe(transactions?.icon);
  });
});
