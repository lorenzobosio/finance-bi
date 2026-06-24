"use client";

import { useTransition } from "react";

import { setDemoMode } from "@/lib/actions/demo-mode";

// "Exit demo →" affordance (Surface 3b, D4-12). Clears the demo_mode cookie via the Server
// Action and revalidates the shell so the dashboard returns to real data and the DEMO DATA
// banner disappears. Rendered only inside the banner on the OWNER's in-app demo mode (not on the
// public deploy, where there is no cookie to clear).

export function DemoExitButton() {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      onClick={() => startTransition(() => void setDemoMode(false))}
      disabled={isPending}
      className="font-medium underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50"
    >
      Exit demo →
    </button>
  );
}
