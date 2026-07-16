"use client";

import { Suspense, useEffect, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { CircleCheck, TriangleAlert } from "lucide-react";
import { format } from "date-fns";

import { Button } from "@/components/ui/button";
import { completeReconnect } from "@/lib/actions/eb-reconnect";
import {
  getReconnectContext,
  type ReconnectContext,
} from "@/lib/actions/reconnect-context";

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
  const [ctx, setCtx] = useState<ReconnectContext | null>(null);

  // Read the server-only context (session / demo / EB env) once after mount. Until it resolves — and
  // whenever there is no app session (mid-OAuth from `pnpm eb:connect`) — the page falls through to the
  // BYTE-IDENTICAL CLI display-code path below, so the terminal flow is never disrupted (D-02).
  useEffect(() => {
    let active = true;
    getReconnectContext()
      .then((c) => {
        if (active) setCtx(c);
      })
      .catch(() => {
        if (active) setCtx(null);
      });
    return () => {
      active = false;
    };
  }, []);

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

  // In-app reconnect branch (REM-01, D-02/03/04): only when a REAL app session exists, it is NOT the
  // demo build, and the bank returned a `code` (no `error`). Gated off isDemoForReads via ctx.isDemo so
  // the demo shows no reconnect surface (D-04). Env absent → the calm muted degrade card (D-03).
  if (ctx && ctx.sessionEmail && !ctx.isDemo && code && !error) {
    return ctx.envConfigured ? (
      <ReconnectConfirmCard
        email={ctx.sessionEmail}
        code={code}
        state={state ?? ""}
      />
    ) : (
      <ReconnectDegradeCard />
    );
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
            <Button
              type="button"
              onClick={copyCode}
              className="min-h-11 w-full"
            >
              {copied ? "Copied" : "Copy code"}
            </Button>
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

// The shared centered card shell — the exact chrome the CLI display-code path uses, reused by the
// in-app confirm / success / error / degrade states so the whole page reads as one surface.
function CardShell({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-6">
      <div className="w-full max-w-md space-y-6 rounded-xl border border-border bg-card p-8 text-card-foreground shadow-sm">
        {children}
      </div>
    </main>
  );
}

// The "Prefer the terminal?" disclosure (Fernanda-first: the CLI is hidden by default). Reveals the
// terminal fallback hint + the single-use code so a signed-in user can still finish from the shell.
function CliDisclosure({ code }: { code: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-2 text-center">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="min-h-11 text-sm text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        Prefer the terminal?
      </button>
      {open && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Copy the code below into your{" "}
            <span className="font-mono text-[0.8rem]">pnpm eb:connect</span>{" "}
            prompt instead.
          </p>
          <div className="break-all rounded-lg border border-border bg-muted px-3 py-2 font-mono text-[0.8rem]">
            {code}
          </div>
        </div>
      )}
    </div>
  );
}

// The in-app "Complete reconnection" confirm card (REM-01, D-02/D-04). Drives confirm → busy →
// success/error over the 14-02 completeReconnect Server Action. The exchange (JWT sign + code→session)
// runs entirely server-side inside the action; this island only sees the discriminated result — the
// private key / code never leave the server (T-14-06). A failed CSRF nonce simply lands the error card.
function ReconnectConfirmCard({
  email,
  code,
  state,
}: {
  email: string;
  code: string;
  state: string;
}) {
  const [phase, setPhase] = useState<"confirm" | "busy" | "success" | "error">(
    "confirm",
  );
  const [renewal, setRenewal] = useState<Date | null>(null);

  async function handleConfirm() {
    setPhase("busy");
    try {
      const res = await completeReconnect({ code, state });
      if (res.ok) {
        setRenewal(res.nextRenewal ? new Date(res.nextRenewal) : null);
        setPhase("success");
      } else {
        setPhase("error");
      }
    } catch {
      setPhase("error");
    }
  }

  if (phase === "success") {
    return (
      <CardShell>
        <div role="status" aria-live="polite" className="space-y-1.5 text-center">
          <h1 className="flex items-center justify-center gap-1.5 text-xl font-semibold">
            <CircleCheck
              aria-hidden="true"
              className="size-5 text-[var(--gain)]"
            />
            Connected ✓
          </h1>
          <p className="text-sm text-muted-foreground">
            Your bank link is active again.
            {renewal && (
              <>
                {" "}
                Next renewal by{" "}
                <span className="font-mono text-[0.8rem]">
                  {format(renewal, "d MMM yyyy")}
                </span>
                .
              </>
            )}
          </p>
        </div>
        <Button asChild className="min-h-11 w-full">
          <Link href="/">Back to dashboard</Link>
        </Button>
      </CardShell>
    );
  }

  if (phase === "error") {
    return (
      <CardShell>
        <div role="alert" className="space-y-1.5 text-center">
          <h1 className="flex items-center justify-center gap-1.5 text-xl font-semibold">
            <TriangleAlert
              aria-hidden="true"
              className="size-5 text-[var(--warning)]"
            />
            Reconnection didn&apos;t complete
          </h1>
          <p className="text-sm text-muted-foreground">
            Something went wrong finishing the reconnection. Try again, or use
            the terminal fallback below.
          </p>
        </div>
        <Button
          type="button"
          onClick={handleConfirm}
          className="min-h-11 w-full"
        >
          Try again
        </Button>
        <CliDisclosure code={code} />
      </CardShell>
    );
  }

  const busy = phase === "busy";
  return (
    <CardShell>
      <div className="space-y-1.5 text-center">
        <h1 className="text-xl font-semibold">Complete reconnection</h1>
        <p className="text-sm text-muted-foreground">
          You&apos;re signed in as{" "}
          <span className="font-medium text-foreground">{email}</span>. Confirm
          to finish reconnecting your bank and resume the daily sync.
        </p>
      </div>
      <Button
        type="button"
        onClick={handleConfirm}
        disabled={busy}
        aria-busy={busy}
        className="min-h-11 w-full"
      >
        {busy ? "Reconnecting…" : "Complete reconnection"}
      </Button>
      <CliDisclosure code={code} />
    </CardShell>
  );
}

// Env-absent (503) degrade — the calm, muted, informational card (NEVER error-red, D-03). Shown to a
// signed-in user when the EB server env is not configured; the app "never breaks" — it points to the
// CLI fallback. Mirrors the 503 gate completeReconnect enforces.
function ReconnectDegradeCard() {
  return (
    <CardShell>
      <div className="space-y-1.5 text-center">
        <h1 className="text-xl font-semibold">Reconnect from your terminal</h1>
        <p className="text-sm text-muted-foreground">
          In-app reconnect isn&apos;t set up in this environment yet. Reconnect
          from your terminal with{" "}
          <span className="font-mono text-[0.8rem]">pnpm eb:connect</span>.
        </p>
      </div>
    </CardShell>
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
