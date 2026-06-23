import { Suspense } from "react";

import { BottomNav, SidebarNav } from "@/components/app-nav";
import { MonthSelector } from "@/components/month-selector";
import { StatusBanners } from "@/components/status/status-banners";

// Authenticated app shell (UI-SPEC §0). Every protected page renders inside this shell:
//   • <StatusBanners /> mounted ONCE, full-bleed at the very top (ReconnectBanner stacks
//     above FreshnessBanner) — the mandatory "Data as of {date}" trust strip on every
//     dashboard. Mounted here (not the root layout) so it never shows on the public
//     login page and never double-mounts.
//   • Desktop (≥lg): fixed ~240px left sidebar (--sidebar surface) + content area.
//   • Mobile (<lg): fixed 56px bottom tab bar (5 tabs + safe-area).
//   • A shared top bar carrying the MANDATORY month selector (?period=YYYYMM) so every
//     mart-backed page keys off one selected period.
//
// This is a Server Component (StatusBanners reads RLS state server-side); the nav +
// selector are client islands.

export default function ProtectedLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-dvh flex-col">
      {/* Full-bleed status banners at the very top of the shell. */}
      <StatusBanners />

      <div className="flex flex-1">
        {/* Desktop sidebar (≥lg). */}
        <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 border-r border-sidebar-border bg-sidebar lg:flex lg:flex-col">
          <div className="flex min-h-14 items-center px-5">
            <span className="text-base font-semibold">Finance BI</span>
          </div>
          <SidebarNav />
        </aside>

        {/* Main column. */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Shared top bar — the mandatory month selector lives here (UI-SPEC §0). */}
          <div className="flex min-h-14 items-center justify-end border-b border-border px-4 lg:px-8">
            <Suspense fallback={null}>
              <MonthSelector />
            </Suspense>
          </div>

          {/* Page content. max-w-7xl, 16px mobile / 32px desktop padding. Extra bottom
              padding on mobile so the fixed bottom-nav never overlaps content. */}
          <main className="mx-auto w-full max-w-7xl flex-1 px-4 pt-4 pb-24 lg:px-8 lg:pt-8 lg:pb-8">
            {children}
          </main>
        </div>
      </div>

      {/* Mobile bottom tab bar (<lg). */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background lg:hidden">
        <BottomNav />
      </div>
    </div>
  );
}
