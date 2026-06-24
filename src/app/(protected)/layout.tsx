import { BottomNav } from "@/components/app-nav";
import { AppSidebar } from "@/components/app-sidebar";
import {
  CommandPaletteProvider,
  type JumpTarget,
} from "@/components/command-palette/command-palette";
import { DemoBanner } from "@/components/demo-banner";
import { SiteHeader } from "@/components/site-header";
import { StatusBanners } from "@/components/status/status-banners";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { resolveMember, type Member } from "@/lib/identity/resolve-member";
import { createClient } from "@/lib/supabase/server";

// Authenticated app shell (UI-SPEC §App Shell, DSN-05). The dashboard-01-class layout:
//   • SidebarProvider → AppSidebar (collapsible="icon" variant="inset") → SidebarInset
//   • SiteHeader (⌘K trigger + MonthSelector + theme toggle) at the top of the inset
//   • StatusBanners mounted ONCE, full-bleed above the inset (ReconnectBanner stacks above
//     FreshnessBanner) — the mandatory "Data as of {date}" trust strip on every dashboard.
//   • BottomNav (lg:hidden) — the mobile tab bar (5 tabs + safe-area).
//   • CommandPaletteProvider — a client island wrapping the inset; the ⌘K palette derives its
//     Go-to commands from the NAV_ITEMS SoT and its Jump-to list from the non-sensitive
//     category taxonomy read here under RLS.
//
// This stays a Server Component: StatusBanners + the user email + the category seed are read
// server-side under the user JWT + RLS (never service_role, never a client secret — T-03-10).

export default async function ProtectedLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const supabase = await createClient();

  // Read the signed-in email + the household members (for the greeting/account chip) + the
  // non-sensitive category taxonomy (for the ⌘K "Jump to" group) ONCE, under RLS, in the RSC
  // layout. getUser() is network-validated (D4-25) — never the unvalidated session read. The members read joins
  // the SAME Promise.all (one resolver, zero extra session reads); resolveMember is pure.
  const [{ data: userData }, { data: memberData }, { data: catData }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("members").select("id, display_name, auth_email"),
    supabase.from("categories").select("id, name").order("name", { ascending: true }),
  ]);

  const userEmail = userData?.user?.email ?? undefined;
  const members: Member[] = (memberData ?? []).map((m) => ({
    id: m.id,
    displayName: m.display_name,
    authEmail: m.auth_email,
  }));
  // Resolve the signed-in person → display name. Unmapped/null degrades to null (cosmetic only;
  // access stays on the RLS allowlist — D4-24/26). The sidebar renders displayName, never email.
  const displayName = resolveMember(userEmail, members)?.displayName ?? null;
  const categories: JumpTarget[] = (catData ?? []).map((c) => ({
    href: `/spending?category=${c.id}`,
    label: c.name,
  }));

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "16rem",
          "--header-height": "3.5rem",
        } as React.CSSProperties
      }
    >
      <CommandPaletteProvider categories={categories}>
        <AppSidebar
          collapsible="icon"
          variant="inset"
          userEmail={userEmail}
          displayName={displayName}
        />
        <SidebarInset>
          {/* The persistent DEMO DATA indicator stacks ABOVE the freshness/reconnect banners
              whenever demo mode is active (owner toggle) or the public demo deploy is live. */}
          <DemoBanner />
          {/* Status banners at the top of the inset (the "Data as of" trust strip). Must live
              INSIDE SidebarInset — a full-width sibling of the sidebar breaks the flex-row shell. */}
          <StatusBanners />
          <SiteHeader />

          {/* Page content. Extra bottom padding on mobile so the fixed bottom-nav never
              overlaps content. */}
          <div className="@container/main flex flex-1 flex-col">
            <main className="mx-auto w-full max-w-7xl flex-1 px-4 pt-4 pb-24 lg:px-8 lg:pt-8 lg:pb-8">
              {children}
            </main>
          </div>
        </SidebarInset>
      </CommandPaletteProvider>

      {/* Mobile bottom tab bar (<lg). */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background lg:hidden">
        <BottomNav />
      </div>
    </SidebarProvider>
  );
}
