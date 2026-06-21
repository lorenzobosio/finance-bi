"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

/**
 * Login island (FND-01). A single "Sign in with Google" button that starts the OAuth
 * flow via the browser Supabase client. `redirectTo` is fixed to this origin's
 * `/auth/callback` (no user-controlled redirect target — mitigates open-redirect
 * T-00-10). Shows an access-denied notice when the middleware bounced a non-allowlisted
 * account here with `?denied=1`.
 */
function LoginForm() {
  const searchParams = useSearchParams();
  const denied = searchParams.get("denied") === "1";
  const authError = searchParams.get("error") === "auth";
  const [pending, setPending] = useState(false);

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
    <main className="flex min-h-dvh items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm space-y-6 rounded-xl border border-border bg-card p-8 text-card-foreground shadow-sm">
        <div className="space-y-1.5 text-center">
          <h1 className="text-xl font-semibold">Finance BI</h1>
          <p className="text-sm text-muted-foreground">
            Sign in to continue. Access is limited to the household allowlist.
          </p>
        </div>

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

        <Button
          type="button"
          size="lg"
          className="w-full"
          disabled={pending}
          onClick={signIn}
        >
          {pending ? "Redirecting…" : "Sign in with Google"}
        </Button>
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
