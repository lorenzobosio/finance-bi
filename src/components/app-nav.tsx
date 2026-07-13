"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { isActive, NAV_ITEMS } from "@/lib/nav-items";
import { cn } from "@/lib/utils";

// App navigation rendered from the single NAV_ITEMS source of truth (@/lib/nav-items).
// Two presentations share that pure array:
//   • <SidebarNav>    — legacy flat desktop nav (the grouped dashboard-01 sidebar lives in
//                       app-sidebar.tsx; this stays as a lightweight fallback consumer)
//   • <BottomNav>     — mobile (<lg), fixed bottom tab bar, 56px + safe-area (uses shortLabel)
// Active item = --primary text + --sidebar-accent fill + a left indicator (sidebar) /
// --primary text (bottom). Icons are decorative (aria-hidden) — meaning is in the label.
// English-only: no `lang` attribute anywhere (the SoT carries none).

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="flex h-full flex-col gap-1 p-3"
    >
      {NAV_ITEMS.map((item) => {
        const active = isActive(pathname, item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
              active
                ? "bg-sidebar-accent text-primary"
                : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
            )}
          >
            {active && (
              <span
                aria-hidden="true"
                className="absolute top-1/2 left-0 h-5 w-0.5 -translate-y-1/2 rounded-full bg-primary"
              />
            )}
            <Icon aria-hidden="true" className="size-4 shrink-0" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="grid grid-cols-6"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {NAV_ITEMS.map((item) => {
        const active = isActive(pathname, item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-medium transition-colors",
              active ? "text-primary" : "text-muted-foreground",
            )}
          >
            <Icon aria-hidden="true" className="size-5 shrink-0" />
            <span className="leading-none">{item.shortLabel}</span>
          </Link>
        );
      })}
    </nav>
  );
}
