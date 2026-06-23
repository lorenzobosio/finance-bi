"use client";

// Client re-export of the next-themes provider (DSN-01). next-themes mutates `<html class>`
// before hydration via a blocking inline script (no-FOUC), which can only run in a Client
// Component — so the root layout (a Server Component) wraps {children} in THIS island rather
// than importing next-themes directly. Props are forwarded verbatim (attribute, defaultTheme,
// enableSystem, disableTransitionOnChange), keeping the wiring in one place.

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ComponentProps } from "react";

export function ThemeProvider({
  children,
  ...props
}: ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
