import type { Metadata } from "next";

/**
 * Offline fallback route (/~offline, PWA-01 / D-05).
 *
 * A calm, static shell the service worker (11-03) precaches and serves when a document fetch fails
 * while the device is genuinely offline. It is a plain Server Component: NO client JS, NO data read,
 * NO session — so it can never leak a figure or PII (T-11-06), and the middleware allowlists it
 * (PUBLIC_PATHS) so the SW precaches THIS page, not a 307-to-/login (T-11-05, Pitfall 3).
 *
 * Copy is the frozen 11-UI-SPEC §Copywriting Contract: the "money is never shown stale" promise —
 * the app would rather show nothing than a stale figure. Reuses the established design tokens only.
 */
export const metadata: Metadata = {
  title: "Offline · Finance BI",
};

export default function OfflinePage() {
  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-background p-6 text-foreground">
      {/* The single deliberate gradient — a faint violet --brand-glow, theme-aware (mirrors login). */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[60vh] opacity-70 blur-3xl"
        style={{
          background:
            "radial-gradient(50% 60% at 50% 0%, var(--brand-glow), transparent 70%)",
        }}
      />

      <div className="w-full max-w-md space-y-6 text-center">
        {/* Brand mark + wordmark. */}
        <div className="flex items-center justify-center gap-2">
          <div
            aria-hidden="true"
            className="flex size-9 items-center justify-center rounded-lg bg-[var(--brand)] font-mono text-base font-semibold text-[var(--brand-fg)]"
          >
            €
          </div>
          <span className="text-xl font-semibold tracking-tight">Finance BI</span>
        </div>

        <h1 className="text-2xl font-semibold tracking-tight">You&apos;re offline</h1>

        <p className="text-base leading-relaxed text-muted-foreground">
          We&apos;ll show your latest numbers as soon as you&apos;re back online. Money figures are
          never shown stale — only real, up-to-date data.
        </p>
      </div>
    </main>
  );
}
