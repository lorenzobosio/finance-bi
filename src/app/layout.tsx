import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import { StatusBanners } from "@/components/status/status-banners";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {/* Global status-banner slot — full-bleed, top of the authenticated app shell,
            above page content, static (scrolls with the page) for Phase 1. */}
        <StatusBanners />
        {children}
      </body>
    </html>
  );
}
