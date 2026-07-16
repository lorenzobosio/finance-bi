"use client";

import { LogOut } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { ThemeToggle } from "@/components/theme-toggle";
import {
  Avatar,
  AvatarFallback,
} from "@/components/ui/avatar";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { signOut } from "@/lib/actions/sign-out";
import { isActive, NAV_GROUPS, NAV_ITEMS } from "@/lib/nav-items";
import { cn } from "@/lib/utils";

// The dashboard-01-class app sidebar (DSN-05). Grouped IA driven by the NAV_ITEMS SoT + the
// `group` field (Overview · Money · Setup), brand-tinted active pill (--brand-muted fill +
// a brand left-bar), a brand wordmark, and a footer with the account chip + theme toggle + a
// sign-out Server Action. Phase 5 promoted the €100k Goal page to a real Overview nav item (the
// former disabled placeholder is gone). `collapsible="icon" variant="inset"` is set by the layout shell.
//
// This is a client island (usePathname for the active state); the layout stays an RSC.

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  /** The signed-in user's email (read once in the RSC layout, passed down for the fallback chip). */
  userEmail?: string;
  /** The resolved member display name (PERS-02); null when unmapped → falls back to the email. */
  displayName?: string | null;
}

export function AppSidebar({ userEmail, displayName, ...props }: AppSidebarProps) {
  const pathname = usePathname();

  // The footer chip shows the resolved name (PERS-02, D4-25); falls back to the truncated email
  // when the member is unmapped. The avatar initial follows: name first, then email.
  const accountLabel = displayName ?? userEmail ?? "Signed in";
  const initial = (displayName?.trim()?.[0] ?? userEmail?.trim()?.[0] ?? "?").toUpperCase();

  return (
    <Sidebar {...props}>
      <SidebarHeader>
        <div className="flex min-h-12 items-center gap-2 px-2">
          <span className="text-base font-semibold tracking-tight">Finance BI</span>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {NAV_GROUPS.map((group) => {
          const items = NAV_ITEMS.filter((item) => item.group === group);
          if (items.length === 0) return null;
          return (
            <SidebarGroup key={group}>
              <SidebarGroupLabel>{group}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {items.map((item) => {
                    const active = isActive(pathname, item.href);
                    const Icon = item.icon;
                    return (
                      <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton
                          asChild
                          isActive={active}
                          tooltip={item.label}
                          className={cn(
                            "relative",
                            active &&
                              "bg-[var(--brand-muted)] font-medium text-primary before:absolute before:top-1/2 before:left-0 before:h-5 before:w-0.5 before:-translate-y-1/2 before:rounded-full before:bg-[var(--brand)]",
                          )}
                        >
                          <Link
                            href={item.href}
                            aria-current={active ? "page" : undefined}
                          >
                            <Icon aria-hidden="true" />
                            <span>{item.label}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
      </SidebarContent>

      <SidebarFooter>
        <div className="flex items-center gap-2 px-1 py-1">
          <Avatar className="size-7">
            <AvatarFallback className="text-xs">{initial}</AvatarFallback>
          </Avatar>
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
            {accountLabel}
          </span>
          <ThemeToggle className="size-11" />
          <form action={signOut}>
            <button
              type="submit"
              aria-label="Sign out"
              title="Sign out"
              className="inline-flex size-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <LogOut aria-hidden="true" className="size-4" />
            </button>
          </form>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
