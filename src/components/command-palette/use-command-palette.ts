"use client";

import { createContext, useContext } from "react";

// The ⌘K command-palette open/close context (DSN-04). One boolean shared between the
// SiteHeader trigger, the global ⌘K/Ctrl+K keydown, and the <CommandPalette> dialog so the
// palette has a single source of truth for its open state. The keydown is registered ONCE in
// the provider (see command-palette.tsx) with e.preventDefault() so it never double-fires.

export interface CommandPaletteContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
}

export const CommandPaletteContext =
  createContext<CommandPaletteContextValue | null>(null);

/** Read the ⌘K palette context. Throws if used outside <CommandPaletteProvider>. */
export function useCommandPalette(): CommandPaletteContextValue {
  const ctx = useContext(CommandPaletteContext);
  if (ctx === null) {
    throw new Error(
      "useCommandPalette must be used within a <CommandPaletteProvider>",
    );
  }
  return ctx;
}
