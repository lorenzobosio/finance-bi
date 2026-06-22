"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";

/**
 * Enable Banking OAuth landing page (D-07).
 *
 * After the user completes Strong Customer Authentication (SCA) at Revolut, Enable
 * Banking redirects the browser to the whitelisted `ENABLE_BANKING_REDIRECT_URL`
 * (this deployed page) carrying `?code=...&state=...` (or `?error=...`). Enable Banking
 * rejected `http://localhost`, so the redirect must land on the deployed https origin —
 * hence this tiny public page rather than a local listener.
 *
 * The page is intentionally minimal: it reads the params from the URL, shows the short,
 * single-use `code` clearly with a copy button, and instructs the user to paste it into
 * the local `pnpm eb:connect` prompt. No app session exists at this point (the user is
 * mid-OAuth), so `/eb/callback` is in middleware PUBLIC_PATHS.
 *
 * Security: the code is short-lived + single-use; nothing is persisted or transmitted
 * from this page. It is display-only.
 */
function CallbackView() {
  const params = useSearchParams();
  const code = params.get("code");
  const state = params.get("state");
  const error = params.get("error");
  const [copied, setCopied] = useState(false);

  async function copyCode() {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API may be unavailable (e.g. non-secure context) — the user can still
      // select the code manually from the box below.
      setCopied(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-6">
      <div className="w-full max-w-md space-y-6 rounded-xl border border-border bg-card p-8 text-card-foreground shadow-sm">
        <div className="space-y-1.5 text-center">
          <h1 className="text-xl font-semibold">Enable Banking — connect</h1>
          <p className="text-sm text-muted-foreground">
            Bank authorization callback.
          </p>
        </div>

        {error && (
          <div
            role="alert"
            className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            Authorization failed: <span className="font-mono">{error}</span>.
            Please re-run <span className="font-mono">pnpm eb:connect</span> and
            try again.
          </div>
        )}

        {!error && code && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Copy this code and paste it into the{" "}
              <span className="font-mono">pnpm eb:connect</span> prompt in your
              terminal. The code is single-use and short-lived.
            </p>
            <div className="break-all rounded-lg border border-border bg-muted px-3 py-2 font-mono text-sm">
              {code}
            </div>
            <button
              type="button"
              onClick={copyCode}
              className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90"
            >
              {copied ? "Copied" : "Copy code"}
            </button>
            {state && (
              <p className="text-center text-xs text-muted-foreground">
                state: <span className="font-mono">{state}</span>
              </p>
            )}
          </div>
        )}

        {!error && !code && (
          <p className="text-center text-sm text-muted-foreground">
            No authorization code found in the URL. Start the flow with{" "}
            <span className="font-mono">pnpm eb:connect</span>.
          </p>
        )}
      </div>
    </main>
  );
}

// useSearchParams() requires a Suspense boundary during prerender (Next 15 App Router).
export default function EbCallbackPage() {
  return (
    <Suspense>
      <CallbackView />
    </Suspense>
  );
}
