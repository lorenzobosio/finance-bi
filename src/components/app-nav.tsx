"use client";

import {
  Building2,
  LayoutDashboard,
  Lock,
  Receipt,
  Settings,
  Target,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

// App navigation (UI-SPEC §0). One source of truth for the 5 nav items + the disabled
// Goal (Phase 3) placeholder, rendered two ways:
//   • <SidebarNav>    — desktop (≥lg), vertical, ~240px --sidebar surface
//   • <BottomNav>     — mobile (<lg), fixed bottom tab bar, 56px + safe-area
// Active item = --primary text + --sidebar-accent fill + a left indicator (sidebar) /
// --primary text (bottom). Icons are decorative (aria-hidden) — meaning is in the label.

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** pt-BR domain labels get an inline lang tag so screen readers pronounce them right. */
  lang?: string;
}

// Locked order (UI-SPEC §0): Home · Gastos · Cost Centers · Transações · Config.
const NAV_ITEMS: NavItem[] = [
  { label: "Home", href: "/", icon: LayoutDashboard },
  { label: "Gastos", href: "/gastos", icon: Receipt, lang: "pt-BR" },
  { label: "Cost Centers", href: "/cost-centers", icon: Building2 },
  { label: "Transações", href: "/transacoes", icon: Receipt, lang: "pt-BR" },
  { label: "Config", href: "/config", icon: Settings },
];

/** Active when the pathname is exactly the href (Home) or starts with it (sub-routes). */
function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

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
            <span lang={item.lang}>{item.label}</span>
          </Link>
        );
      })}

      {/* Disabled Goal placeholder (Phase 3) — greyed, non-interactive. */}
      <div
        aria-disabled="true"
        className="mt-1 flex min-h-11 cursor-not-allowed items-center gap-3 rounded-lg px-3 text-sm font-medium text-muted-foreground/50"
      >
        <Target aria-hidden="true" className="size-4 shrink-0" />
        <span>Goal</span>
        <Lock aria-hidden="true" className="ml-auto size-3" />
        <span className="sr-only">(Phase 3 — coming soon)</span>
      </div>
    </nav>
  );
}

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="grid grid-cols-5"
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
            <span lang={item.lang} className="leading-none">
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
