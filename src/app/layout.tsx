import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import { ThemeProvider } from "@/components/theme-provider";

const geistSans = Geist({
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
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
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
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
