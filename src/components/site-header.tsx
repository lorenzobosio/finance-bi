"use client";

import { Search } from "lucide-react";
import { Suspense } from "react";

import { MonthSelector } from "@/components/month-selector";
import { ThemeToggle } from "@/components/theme-toggle";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useCommandPalette } from "@/components/command-palette/use-command-palette";

// The sticky SiteHeader (DSN-05). A --header-height bar carrying:
//   • <SidebarTrigger/>            — collapse/expand the sidebar (keyboard-operable)
//   • the desktop-only ⌘K trigger — a faux search input, hidden lg:flex, opens the palette
//   • <MonthSelector/>             — the MANDATORY shared ?period=YYYYMM selector (in Suspense)
//   • <ThemeToggle/>               — the 3-state light/dark/system toggle
//
// The ⌘K trigger is desktop-gated (hidden lg:flex): on mobile the bottom-nav + Transactions
// search cover the same intents; the palette is a power-user desktop affordance.

export function SiteHeader() {
  const { setOpen } = useCommandPalette();

  return (
    <header className="sticky top-0 z-30 flex h-(--header-height) shrink-0 items-center gap-2 border-b border-border bg-background px-4 lg:px-6">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-1 data-[orientation=vertical]:h-4" />

      {/* Desktop ⌘K trigger — faux search input opening the palette. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-keyshortcuts="Meta+k Control+k"
        aria-label="Open command palette"
        className="hidden min-w-56 items-center gap-2 rounded-md border border-border bg-muted/50 px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted lg:flex"
      >
        <Search aria-hidden="true" className="size-4 shrink-0" />
        <span className="flex-1 text-left">Search transactions, pages…</span>
        <kbd className="pointer-events-none inline-flex h-5 items-center gap-0.5 rounded border border-border bg-background px-1.5 font-mono text-[0.65rem] font-medium text-muted-foreground">
          ⌘K
        </kbd>
      </button>

      {/* Push the period selector + theme toggle to the right. */}
      <div className="ml-auto flex items-center gap-2">
        <Suspense fallback={null}>
          <MonthSelector />
        </Suspense>
        <ThemeToggle />
      </div>
    </header>
  );
}
