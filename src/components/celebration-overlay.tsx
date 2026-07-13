"use client";

import { useEffect, useState, useTransition } from "react";
import { PartyPopper, Share2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { markCelebrationSeen } from "@/lib/actions/celebration-seen";

// Celebration overlay — the shared, once-only "You crossed €X!" moment (GOAL-11, D5-14). The Goal
// RSC renders this ONLY when there is an unseen goal_events row for the active partition, so both
// partners see it once on next login (the `seen` flag is a SHARED DB row, never a device flag).
//
// Motion (UI-SPEC Motion Contract): a SINGLE brand-tinted confetti burst ≤1.2s, canvas-confetti
// DYNAMICALLY imported here (client island only) so it never enters the server bundle. Under
// `prefers-reduced-motion` the confetti is suppressed entirely — the modal + the static "seal"
// result still render (every animated state has a correct static fallback).
//
// The share card is PII-SAFE (T-05-22): milestone + the couple's display names + the month — NEVER
// any balance. On the anon public demo the names are already the personas (Alice & Bob), so nothing
// real leaks. Uses the Web Share API when present, else copies the line to the clipboard.

export interface CelebrationEvent {
  /** The goal_events row id (the shared row to mark seen). */
  id: string;
  /** 'level' (€10k) | 'major' (€100k) — drives the copy emphasis. */
  kind: string;
  /** The € threshold crossed (a multiple of €10k / €100k). */
  threshold: number | null;
  /** ISO timestamp the crossing was recorded (for the PII-safe share line). */
  achievedAt: string;
}

interface CelebrationOverlayProps {
  event: CelebrationEvent;
  /** The demo-aware couple display names (personas on the anon demo — never real PII there). */
  names: { a: string; b: string };
}

/** A brand-tinted confetti palette (violet `--brand` family) — a measured burst, NOT rainbow. */
const BRAND_CONFETTI_COLORS = ["#8b5cf6", "#a78bfa", "#7c3aed", "#c4b5fd", "#6d28d9"];

/** "€50k" shorthand for a whole-€10k/€100k threshold. */
function kLabel(threshold: number | null): string {
  if (threshold === null) return "a milestone";
  return `€${Math.round(threshold / 1000)}k`;
}

/** An ISO timestamp → "Jun 2026" (UTC, no locale leakage into the date math). */
function monthYear(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}

export function CelebrationOverlay({ event, names }: CelebrationOverlayProps) {
  const [open, setOpen] = useState(true);
  const [shareNote, setShareNote] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const prefersReduced = usePrefersReducedMotion();

  const label = kLabel(event.threshold);
  const isMajor = event.kind === "major";
  const when = monthYear(event.achievedAt);

  // The single brand-tinted burst — canvas-confetti is DYNAMICALLY imported so it never enters the
  // server bundle. Suppressed entirely under prefers-reduced-motion (the modal + seal still show).
  useEffect(() => {
    if (!open || prefersReduced) return;
    let cancelled = false;
    void import("canvas-confetti").then((mod) => {
      if (cancelled) return;
      const confetti = mod.default;
      confetti({
        particleCount: isMajor ? 160 : 110,
        spread: 72,
        startVelocity: 42,
        ticks: 200, // ~1.2s auto-settle (UI-SPEC single burst ≤1.2s)
        origin: { y: 0.62 },
        colors: BRAND_CONFETTI_COLORS,
        disableForReducedMotion: true, // belt-and-suspenders alongside the hook gate
        scalar: 0.9,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [open, prefersReduced, isMajor]);

  /** Save-to-our-wins / dismiss — flip the SHARED seen flag so it never replays, then close. */
  function dismiss() {
    setOpen(false);
    startTransition(() => void markCelebrationSeen({ eventId: event.id }));
  }

  /** PII-safe share (T-05-22): milestone + names + month only — NEVER a balance. */
  async function share() {
    const line = `${names.a} & ${names.b} just crossed ${label} on the road to €100k${
      when ? ` · ${when}` : ""
    }.`;
    const nav = typeof navigator !== "undefined" ? navigator : undefined;
    try {
      if (nav?.share) {
        await nav.share({ text: line });
        return;
      }
      if (nav?.clipboard) {
        await nav.clipboard.writeText(line);
        setShareNote("Copied — no balances, just the win.");
        return;
      }
    } catch {
      // The user cancelled the share sheet, or the API is unavailable — no-op (nothing leaked).
    }
    setShareNote(line);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) dismiss();
      }}
    >
      <DialogContent className="text-center sm:max-w-md" showCloseButton>
        <DialogHeader className="items-center gap-3">
          <span
            aria-hidden="true"
            className="flex size-14 items-center justify-center rounded-full bg-[var(--brand-muted)] text-[var(--brand)]"
          >
            <PartyPopper className="size-7" />
          </span>
          <DialogTitle className="text-xl">You crossed {label}!</DialogTitle>
          <DialogDescription>
            {isMajor
              ? `A major milestone on the road to €100k${when ? ` · reached ${when}` : ""}. This one's for both of you.`
              : `Another €10k level toward €100k${when ? ` · reached ${when}` : ""}. Steady wins, together.`}
          </DialogDescription>
        </DialogHeader>

        {shareNote && (
          <p className="rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground" role="status">
            {shareNote}
          </p>
        )}

        <DialogFooter className="sm:flex-row sm:justify-center">
          <Button type="button" variant="outline" onClick={share} className="min-h-11">
            <Share2 aria-hidden="true" />
            Share this moment
          </Button>
          <Button
            type="button"
            onClick={dismiss}
            className="min-h-11 bg-[var(--brand)] text-white hover:opacity-90"
          >
            Save to our wins →
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
