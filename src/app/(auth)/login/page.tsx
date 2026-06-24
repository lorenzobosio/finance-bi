"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { demoCtaProps } from "@/lib/demo/landing-cta";

/**
 * Landing / intro page (DSN-05, D3-07). A calm, centered, single-screen intro — the CV-quality
 * first impression — that replaces the bare login. It adds the brand, the one-line value prop,
 * and a live "View demo →" CTA (DEMO-04, D4-17 — wired to `NEXT_PUBLIC_DEMO_URL`), keeping the
 * existing Google sign-in as the primary CTA.
 *
 * Security (T-03-12 / T-03-13): the page is fully logged-out and exposes ZERO data — only static
 * brand/value-prop/CTA copy, no mart read, no session-gated content. The demo CTA links to a
 * public (non-sensitive) URL and degrades to `href="#"` (disabled) until the owner sets it. The
 * `signInWithOAuth` `redirectTo` stays fixed to this origin's `/auth/callback` (no user-controlled
 * redirect target — mitigates open-redirect T-00-10). Shows an access-denied notice when the
 * middleware bounced a non-allowlisted account here with `?denied=1`.
 */
function LoginForm() {
  const searchParams = useSearchParams();
  const denied = searchParams.get("denied") === "1";
  const authError = searchParams.get("error") === "auth";
  const [pending, setPending] = useState(false);

  // The "View demo →" wiring (DEMO-04, D4-17) — pure resolution from NEXT_PUBLIC_DEMO_URL, inlined
  // at build time on the client. Live link when the owner has set the URL; a disabled "#" shell
  // otherwise. process.env is referenced directly so Next can statically inline the public var.
  const demoCta = demoCtaProps({
    NEXT_PUBLIC_DEMO_URL: process.env.NEXT_PUBLIC_DEMO_URL,
  });

  async function signIn() {
    setPending(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${location.origin}/auth/callback` },
    });
    // On success the browser is redirected to Google, so we only land here on error.
    if (error) setPending(false);
  }

  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-background p-6 text-foreground">
      {/* The single deliberate gradient — a faint violet --brand-glow, theme-aware. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[60vh] opacity-70 blur-3xl"
        style={{
          background:
            "radial-gradient(50% 60% at 50% 0%, var(--brand-glow), transparent 70%)",
        }}
      />

      <div className="w-full max-w-md space-y-8">
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

        {/* Value prop — the Core Value, condensed. */}
        <p className="text-center text-base leading-relaxed text-muted-foreground">
          See exactly how far you are from{" "}
          <span className="font-mono font-medium tabular-nums text-foreground">
            €100.000
          </span>{" "}
          invested — and whether this month&apos;s money behaved like a healthy business.
        </p>

        {/* The auth card. */}
        <div className="space-y-6 rounded-xl border border-border bg-card p-8 text-card-foreground shadow-sm">
          {denied && (
            <p
              role="alert"
              className="rounded-lg bg-destructive/10 px-3 py-2 text-center text-sm text-destructive"
            >
              That account is not allowed. You have been signed out.
            </p>
          )}
          {authError && (
            <p
              role="alert"
              className="rounded-lg bg-destructive/10 px-3 py-2 text-center text-sm text-destructive"
            >
              Sign-in could not be completed. Please try again.
            </p>
          )}

          <div className="space-y-3">
            <Button
              type="button"
              size="lg"
              className="w-full bg-[var(--brand)] text-[var(--brand-fg)] hover:bg-[var(--brand)]/90"
              disabled={pending}
              onClick={signIn}
            >
              {pending ? "Redirecting…" : "Continue with Google"}
            </Button>

            {/* Live "View demo →" secondary CTA (DEMO-04, D4-17). The href resolves from
                NEXT_PUBLIC_DEMO_URL via the pure helper; degrades to a disabled "#" shell until the
                owner sets the var on the real app's Vercel project. Stays a calm secondary outline
                button — "Continue with Google" remains the single violet --brand primary. */}
            {demoCta.disabled ? (
              <Button
                type="button"
                size="lg"
                variant="outline"
                className="w-full"
                disabled
                aria-disabled="true"
                title="A live demo arrives once it is published."
              >
                View demo →
              </Button>
            ) : (
              <Button asChild size="lg" variant="outline" className="w-full">
                <a href={demoCta.href}>View demo →</a>
              </Button>
            )}
            <p className="text-center text-xs text-muted-foreground">
              Explore a pre-seeded household — no login needed.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}

// useSearchParams() requires a Suspense boundary during prerender (Next 15 App Router).
export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
