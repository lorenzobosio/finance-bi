"use client";

import { Building2, Clock, MoonStar, Tag } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useTheme } from "next-themes";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { currentPeriodKey, previousPeriodKey } from "@/lib/period";
import {
  CommandPaletteContext,
  type CommandPaletteContextValue,
} from "./use-command-palette";
import { navCommands } from "./commands";

// The ⌘K command palette (DSN-04). Desktop-first, keyboard-driven; Option-A STATIC groups:
//   • Go to        — derived 1:1 from NAV_ITEMS (navCommands(), the single nav SoT)
//   • Change period — This month / Previous month (?period=YYYYMM), via period.ts helpers
//   • Settings     — cycle the theme (no extra surface)
//   • Jump to      — cost centers + seeded categories (non-sensitive taxonomy passed as a
//                    prop from the RSC layout; read under RLS — never a server secret)
//
// Every action CLOSES the palette BEFORE router.push so focus restores to the (still-mounted)
// SiteHeader trigger (a11y — RESEARCH Pattern 5). Live transaction search is DEFERRED to
// Phase 8; here the input only filters the static command list.
//
// T-03-09 / T-03-10: the palette only navigates + reads via the RLS plane — no Server Action,
// no privileged action, no server secret in this client island.

/** A non-sensitive taxonomy entry surfaced under "Jump to" (read under RLS in the layout). */
export interface JumpTarget {
  /** A stable href the entry routes to. */
  href: string;
  /** The display label. */
  label: string;
}

/** Build a `?period=YYYYMM` href for the current pathname, preserving other params. */
function periodHref(
  pathname: string,
  searchParams: URLSearchParams,
  periodKey: number,
): string {
  const params = new URLSearchParams(searchParams.toString());
  params.set("period", String(periodKey));
  return `${pathname}?${params.toString()}`;
}

function CommandPaletteDialog({
  open,
  setOpen,
  categories = [],
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
  categories?: JumpTarget[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { setTheme, resolvedTheme } = useTheme();

  // Close BEFORE navigate so focus restores to the mounted trigger (a11y, Pattern 5).
  const go = useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router, setOpen],
  );

  const navItems = useMemo(() => navCommands(), []);
  const now = new Date();
  const thisMonth = currentPeriodKey(now);
  const prevMonth = previousPeriodKey(thisMonth);

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Command palette"
      description="Jump to a page, change the period, or switch the theme."
    >
      <CommandInput placeholder="Search transactions, pages…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        <CommandGroup heading="Go to">
          {navItems.map((cmd) => (
            <CommandItem
              key={cmd.href}
              value={`${cmd.label} ${cmd.keywords}`}
              onSelect={() => go(cmd.href)}
            >
              {cmd.label}
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Change period">
          <CommandItem
            value="change period this month current"
            onSelect={() => go(periodHref(pathname, searchParams, thisMonth))}
          >
            <Clock />
            This month
          </CommandItem>
          <CommandItem
            value="change period previous last month"
            onSelect={() => go(periodHref(pathname, searchParams, prevMonth))}
          >
            <Clock />
            Previous month
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Settings">
          <CommandItem
            value="settings theme dark light toggle"
            onSelect={() => {
              setTheme(resolvedTheme === "dark" ? "light" : "dark");
              setOpen(false);
            }}
          >
            <MoonStar />
            Toggle theme
          </CommandItem>
        </CommandGroup>

        {categories.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Jump to">
              <CommandItem
                value="cost centers"
                onSelect={() => go("/cost-centers")}
              >
                <Building2 />
                Cost Centers
              </CommandItem>
              {categories.map((c) => (
                <CommandItem
                  key={c.href + c.label}
                  value={`category ${c.label}`}
                  onSelect={() => go(c.href)}
                >
                  <Tag />
                  {c.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}

/**
 * The ⌘K provider: owns the open boolean, registers the global ⌘K/Ctrl+K keydown ONCE, and
 * renders the (Suspense-wrapped, useSearchParams-using) dialog. Mount once in the app shell.
 */
export function CommandPaletteProvider({
  children,
  categories = [],
}: {
  children: React.ReactNode;
  categories?: JumpTarget[];
}) {
  const [open, setOpen] = useState(false);

  const value: CommandPaletteContextValue = useMemo(
    () => ({ open, setOpen, toggle: () => setOpen((o) => !o) }),
    [open],
  );

  // Register the ⌘K / Ctrl+K shortcut once. preventDefault stops the browser's own binding.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  return (
    <CommandPaletteContext.Provider value={value}>
      {children}
      <Suspense fallback={null}>
        <CommandPaletteDialog
          open={open}
          setOpen={setOpen}
          categories={categories}
        />
      </Suspense>
    </CommandPaletteContext.Provider>
  );
}
