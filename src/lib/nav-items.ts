import {
  Building2,
  LayoutDashboard,
  Mountain,
  Plane,
  Receipt,
  Settings,
  Target,
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
  /**
   * Whether this item appears in the mobile bottom-nav (default true). The Brazil/Adventures
   * bucket pages are set false: they stay first-class in the desktop sidebar + ⌘K palette + the
   * Goal page's own links, but are kept OUT of the 6-slot mobile bar so it never overflows (the
   * bar is a fixed `grid-cols-6`). GOAL-13 "reachable from the sidebar" is satisfied by desktop.
   */
  bottomNav?: boolean;
}

// Order (UI-SPEC §0 + Phase 5): Home · Goal · Brazil · Adventures · Spending · Cost Centers ·
// Transactions · Config. Goal + the two bucket pages (GOAL-13) live in the Overview group; Brazil +
// Adventures are `bottomNav: false` so they enrich the desktop sidebar + ⌘K without overflowing the
// fixed 6-slot mobile bar (they remain reachable on mobile via the Goal page's own links + ⌘K).
export const NAV_ITEMS: NavItem[] = [
  { label: "Home", href: "/", icon: LayoutDashboard, shortLabel: "Home", group: "Overview" },
  { label: "Goal", href: "/goal", icon: Target, shortLabel: "Goal", group: "Overview" },
  { label: "Brazil", href: "/goal/brazil", icon: Plane, shortLabel: "Brazil", group: "Overview", bottomNav: false },
  { label: "Adventures", href: "/goal/adventures", icon: Mountain, shortLabel: "Adventures", group: "Overview", bottomNav: false },
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
