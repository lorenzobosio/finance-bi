import {
  Building2,
  LayoutDashboard,
  Receipt,
  Settings,
  TrendingDown,
  type LucideIcon,
} from "lucide-react";

// The single source of truth for app navigation (DSN-04/05). One pure, importable array
// consumed three ways without drifting:
//   • <AppSidebar>   — desktop grouped sidebar (grouped by `group`)
//   • <BottomNav>    — mobile bottom tab bar (uses `shortLabel`)
//   • the ⌘K palette — Go-to commands derive from this array (see command-palette/commands.ts)
//
// English-only (D3-10): labels carry NO `lang` attribute — the pt-BR routes were renamed
// to `/spending`/`/transactions`. Icons are DISTINCT per item (Spending
// uses TrendingDown, Transactions uses Receipt — the old duplicate-Receipt bug is fixed).
//
// This is a PURE TS module (no JSX, no "use client") so it can be imported into a vitest
// test and into a Server Component alike — the extract-for-testability pattern (mirrors
// src/lib/ingestion/pick-balance.ts).

/** A navigation group heading for the grouped sidebar IA. */
export type NavGroup = "Overview" | "Money" | "Setup";

export interface NavItem {
  /** Full English label (sidebar + ⌘K). */
  label: string;
  /** The route href; also the ⌘K Go-to target. */
  href: string;
  /** A lucide icon component (decorative — meaning lives in the label). */
  icon: LucideIcon;
  /** A short English label for the cramped mobile bottom-nav (≤12 chars). */
  shortLabel: string;
  /** The sidebar group this item belongs to. */
  group: NavGroup;
}

// Locked order (UI-SPEC §0): Home · Spending · Cost Centers · Transactions · Config.
export const NAV_ITEMS: NavItem[] = [
  { label: "Home", href: "/", icon: LayoutDashboard, shortLabel: "Home", group: "Overview" },
  { label: "Spending", href: "/spending", icon: TrendingDown, shortLabel: "Spending", group: "Money" },
  { label: "Cost Centers", href: "/cost-centers", icon: Building2, shortLabel: "Centers", group: "Money" },
  { label: "Transactions", href: "/transactions", icon: Receipt, shortLabel: "Transactions", group: "Money" },
  { label: "Config", href: "/config", icon: Settings, shortLabel: "Config", group: "Setup" },
];

/** Active when the pathname is exactly the href (Home) or starts with it (sub-routes). */
export function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** The ordered list of nav groups as they appear in the sidebar. */
export const NAV_GROUPS: NavGroup[] = ["Overview", "Money", "Setup"];
