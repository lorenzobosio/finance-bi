"use client";

// 3-state theme toggle (Light → Dark → System) for the SiteHeader + sidebar footer (DSN-01).
//
// A real <button> (keyboard-operable, visible violet --ring focus) cycling Sun → Moon → Monitor.
// Color/icon is NEVER the only signal — the aria-label names the action and current target.
//
// The `mounted` guard prevents a hydration flash: until the client mounts, next-themes cannot
// know the resolved theme (the server can't read localStorage / the OS preference), so we render
// a same-size (size-9) placeholder that reserves the layout slot — no flash, no shift
// (RESEARCH Pitfall 2).

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

// The cycle order; `theme` from next-themes is one of these when `enableSystem` is on.
const ORDER = ["light", "dark", "system"] as const;
type ThemeChoice = (typeof ORDER)[number];

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // Reserve the exact slot while unmounted so the header doesn't shift on hydration.
  if (!mounted) {
    return <div className={cn("size-9", className)} aria-hidden />;
  }

  const current = (ORDER as readonly string[]).includes(theme ?? "")
    ? (theme as ThemeChoice)
    : "system";
  const next = ORDER[(ORDER.indexOf(current) + 1) % ORDER.length];

  const Icon = current === "light" ? Sun : current === "dark" ? Moon : Monitor;

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label="Toggle theme (Light / Dark / System)"
      title="Toggle theme (Light / Dark / System)"
      className={cn(
        "inline-flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        className,
      )}
    >
      <Icon className="size-4" aria-hidden />
    </button>
  );
}
