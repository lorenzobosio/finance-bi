import { NAV_ITEMS, type NavItem } from "@/lib/nav-items";

// ⌘K command derivations (DSN-04). The "Go to" command list DERIVES from the single
// NAV_ITEMS source of truth — one command per nav item, same hrefs — so the palette and the
// sidebar can never drift apart. This is a PURE module (no JSX) so it is unit-testable and
// importable into both the client palette and a vitest test.

/** A navigable ⌘K command: a label + the href it routes to. */
export interface NavCommand {
  label: string;
  href: string;
  /** A short keyword string to bias cmdk's fuzzy match (the route + short label). */
  keywords: string;
}

/**
 * Derive exactly one Go-to command per NAV_ITEMS entry (a bijection, not a subset).
 * The palette renders these under the "Go to" group; selecting one closes the palette
 * and `router.push`es the href.
 */
export function navCommands(): NavCommand[] {
  return NAV_ITEMS.map((item: NavItem) => ({
    label: item.label,
    href: item.href,
    keywords: `${item.shortLabel} ${item.href}`,
  }));
}
