import { FlaskConical } from "lucide-react";

import { DemoExitButton } from "@/components/demo-exit-button";
import { demoMode } from "@/lib/demo/mode";

// The persistent "DEMO DATA" indicator (Surface 3b, DEMO-02 / DEMO-03).
//
// A full-bleed strip at the very top of the shell (above StatusBanners), shown the ENTIRE time
// demo mode is active — the owner's in-app toggle OR the public demo deploy (NEXT_PUBLIC_DEMO=1).
// It is a trust guarantee, not a notification: never auto-dismissable while demo mode is active.
//
// Tokens: the inherited --warning semantic tier (the documented amber "non-real" exception) on a
// --warning-fill/12% tint — NOT a new color, NOT the reserved violet --brand. The cue is icon
// (FlaskConical, aria-hidden) AND text (the literal "DEMO DATA") AND color — never color alone.
// role="status" so assistive tech announces the mode.
//
// On the OWNER's in-app demo mode (cookie set, NEXT_PUBLIC_DEMO unset) it appends an "Exit demo →"
// affordance clearing the cookie; the public deploy shows the strip without an exit (there is no
// signed-in owner / no cookie to clear).

export async function DemoBanner() {
  const active = await demoMode();
  if (!active) return null;

  const isPublicDeploy = process.env.NEXT_PUBLIC_DEMO === "1";

  return (
    <div
      role="status"
      className="flex w-full flex-wrap items-center gap-x-2 gap-y-1 border-b border-[var(--warning)]/20 bg-[var(--warning-fill)]/12 px-4 py-2 text-sm text-[var(--warning)]"
    >
      <FlaskConical aria-hidden="true" className="size-4 shrink-0" />
      <span className="font-semibold tracking-wide uppercase">DEMO DATA</span>
      <span className="text-[var(--warning)]/90">
        You&apos;re viewing a seeded sample household. No real accounts are connected.
      </span>
      {/* The owner's in-app demo mode can return to real data; the public deploy cannot. */}
      {!isPublicDeploy && (
        <span className="ml-auto">
          <DemoExitButton />
        </span>
      )}
    </div>
  );
}
