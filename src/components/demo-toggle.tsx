"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { setDemoMode, showSetupChecklist } from "@/lib/actions/demo-mode";

// Demo-mode toggle + onboarding re-surface (Surface 3a, DEMO-03 / D4-12 / D4-21).
//
// A client island: the Switch checked-fill uses --primary (structural; the violet --brand accent
// is reserved — 10% rule). Toggling calls the setDemoMode Server Action, which writes/clears the
// demo_mode cookie the chokepoint reads and revalidates the shell so the dashboard data switches
// and the persistent DEMO DATA banner appears/disappears. The "Show setup checklist" ghost button
// clears the dismissal flag so an incomplete-but-dismissed household can re-surface the guide.
//
// Owner-only: the Config RSC renders this only for an authenticated session (no toggle on the
// public deploy — there is no signed-in owner to switch).

interface DemoToggleProps {
  /** The current demo_mode state (read from the cookie in the Config RSC). */
  initialEnabled: boolean;
}

export function DemoToggle({ initialEnabled }: DemoToggleProps) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [isPending, startTransition] = useTransition();

  function onToggle(next: boolean) {
    setEnabled(next); // optimistic — the action revalidates the shell to reconcile
    startTransition(() => {
      void setDemoMode(next);
    });
  }

  function onShowChecklist() {
    startTransition(() => {
      void showSetupChecklist();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <Switch
          id="demo-mode"
          checked={enabled}
          onCheckedChange={onToggle}
          disabled={isPending}
          aria-describedby="demo-mode-hint"
        />
        <div className="space-y-1">
          <Label htmlFor="demo-mode" className="text-sm font-semibold text-foreground">
            Demo mode
          </Label>
          <p id="demo-mode-hint" className="text-sm text-muted-foreground">
            Switch to a seeded sample household to explore the app with example data. Your real
            data is untouched.
          </p>
        </div>
      </div>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onShowChecklist}
        disabled={isPending}
        className="px-2 text-sm"
      >
        Show setup checklist
      </Button>
    </div>
  );
}
