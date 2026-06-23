import { describe, expect, it } from "vitest";

// Wave-0 RED test (DSN-04) — the ⌘K "Go to" command list must DERIVE from the single
// NAV_ITEMS source of truth (one command per nav item, same hrefs), never a duplicated nav
// list. This guards against the ⌘K palette and the sidebar drifting apart.
//
// RED until Plan 03-04: the derivation helper `navCommands` and its module
// src/components/command-palette/commands.ts do NOT exist yet, and the nav SoT is not yet a
// pure importable module. Both are created in Plan 04 (the palette derives from the same
// extracted `@/lib/nav-items` SoT). This import fails at resolution time — the intended RED state.
import { navCommands } from "@/components/command-palette/commands";
import { NAV_ITEMS } from "@/lib/nav-items";

interface NavItemLike {
  label: string;
  href: string;
}
interface CommandLike {
  label: string;
  href: string;
}

describe("⌘K command list derives from NAV_ITEMS (DSN-04)", () => {
  it("produces exactly one 'Go to' command per nav item", () => {
    const commands = navCommands() as CommandLike[];
    expect(commands.length).toBe((NAV_ITEMS as NavItemLike[]).length);
  });

  it("each command's href matches a NAV_ITEMS href (same source of truth)", () => {
    const navHrefs = new Set((NAV_ITEMS as NavItemLike[]).map((n) => n.href));
    const commands = navCommands() as CommandLike[];
    for (const cmd of commands) {
      expect(navHrefs.has(cmd.href)).toBe(true);
    }
    // And every nav href is covered (bijection, not a subset).
    const cmdHrefs = new Set(commands.map((c) => c.href));
    for (const href of navHrefs) {
      expect(cmdHrefs.has(href)).toBe(true);
    }
  });
});
