import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Geist_Mono } from "next/font/google";
import { MotionConfig } from "motion/react";
import "./globals.css";

import { ThemeProvider } from "@/components/theme-provider";

// UI sans: Plus Jakarta Sans — rounder, warmer, more comfortable to read than Geist
// (owner pref 2026-06-23). Kept on the `--font-geist-sans` CSS var so globals.css
// (`--font-sans: var(--font-geist-sans)`) and the globals-tokens test stay unchanged.
const appSans = Plus_Jakarta_Sans({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Finance BI",
  description: "Household finance BI — private, allowlisted access.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning is REQUIRED (DSN-01): next-themes mutates `<html class>` before
    // hydration, so the server-rendered class necessarily differs from the client's — without
    // this, React logs a hydration mismatch on every load (RESEARCH Pitfall 2).
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${appSans.variable} ${geistMono.variable} antialiased`}
      >
        {/* Dark/light token provider (DSN-01): `class` strategy on <html>, default `system`
            (the owner app follows the OS), `disableTransitionOnChange` to avoid a jarring flash
            on toggle. The status-banner trust strip is mounted inside the authenticated shell
            ((protected)/layout.tsx), so it appears on every dashboard but never on the public
            login page and never double-mounts. */}
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {/* Layer-2 reduced-motion gate (DSN-03): reducedMotion="user" makes every
              motion/@number-flow animation honor prefers-reduced-motion at the JS layer
              (the Layer-1 CSS zeroes ::view-transition-* in globals.css). Together they
              fully suppress motion — including the €4k celebration moment — to instant. */}
          <MotionConfig reducedMotion="user">{children}</MotionConfig>
        </ThemeProvider>
      </body>
    </html>
  );
}
