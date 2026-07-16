"use client";

// VoiceCard — the "Warm Letter-Paper" AI voice card (D-14, LOCKED). The FIRST element on Home and the
// emotional payload of Phase 6: one warm, true CFO-memo paragraph on where the couple is to €100k and
// whether this month behaved like a healthy business (AI-03).
//
// Visual = the app's exact elevation-card anatomy (reused verbatim from kpi-card) + the D-14/D-17
// deltas: a faint terracotta `--ai-accent` surface wash (~8%) and a warm terracotta top hairline (the
// 1px inset highlight tinted `--ai-accent`/~35%). Violet `--brand` is UNTOUCHED so the card never reads
// as merely "a highlighted brand card".
//
// Anatomy (top→bottom, D-14):
//   1. Header lockup (single row, gap-2): the original spark + `Claude` (--ai-accent, semibold) + `·`
//      + the generated-date (font-mono, muted) + an optional `(i)` "How is this written?" affordance.
//      This is the ONLY attribution + date — no "your AI CFO", no "written by", no bottom byline.
//   2. An emphasized ITALIC 16px lead sentence at full --card-foreground.
//   3. The 2–4 sentence CFO-memo paragraph at full --card-foreground.
//   4. NOTHING at the bottom (owner: "more clean").
//
// States (D-15) — never an empty hole; the goal hero + KPIs always follow:
//   (a) latest insight (any kind) + its generated-date;
//   (b) first-run placeholder ("Your first weekly note lands after launch.") — no date;
//   (c) stale = simply the latest insight with its honest OLD date (no separate banner);
//   (d) error = the warm degrade line ("…your numbers below are still up to date.") — no date.
//
// SECURITY (T-06-11, stored-XSS guard): the `body` is EXTERNALLY-AUTHORED text (a Claude routine /
// seeded). It is rendered as a plain-text JSX child so React escapes it — NEVER via a raw-HTML
// injection path. The spark is an ORIGINAL mark; attribution is nominative `Claude` TEXT only — never
// the vendor's literal logo (D-17, trademark-safe).
//
// Motion: a one-time reduced-motion-gated ~600ms spark twinkle on first reveal only (`ai-spark-twinkle`
// runs once on mount; the globals.css reduced-motion media query + the root MotionConfig hold the gate).

import { useState } from "react";

import { AiSpark } from "@/components/ai-spark";
import { cn } from "@/lib/utils";

/** The card's copy — the ONLY two standing strings (UI-SPEC §Copywriting). */
const FIRST_RUN_COPY = "Your first weekly note lands after launch.";
const ERROR_COPY =
  "We couldn't load your note right now — your numbers below are still up to date.";
const TOOLTIP_COPY =
  "Written from your monthly summaries by Claude on your Pro Max plan — never your raw transactions.";

export interface VoiceCardProps {
  /** The externally-authored CFO-memo prose (any `kind`). null/absent → the first-run placeholder. */
  body?: string | null;
  /** The pre-formatted generated-on date (the parent formats it; an old date honestly signals staleness). */
  dateLabel?: string | null;
  /** The read failed → render the warm degrade line (KPIs still render below). */
  errored?: boolean;
  className?: string;
}

/**
 * Split the memo body into an emphasized lead sentence (italic) + the remaining paragraph. The
 * insights table stores one `body` blob; the first sentence becomes the D-14c lead, the rest the
 * D-14d memo. A single-sentence body is all lead, no memo.
 */
function splitLead(text: string): { lead: string; memo: string } {
  const trimmed = text.trim();
  const match = trimmed.match(/[.!?](?=\s)/);
  if (!match || match.index === undefined) return { lead: trimmed, memo: "" };
  const end = match.index + 1;
  return { lead: trimmed.slice(0, end).trim(), memo: trimmed.slice(end).trim() };
}

export function VoiceCard({ body, dateLabel, errored = false, className }: VoiceCardProps) {
  const hasInsight = !errored && typeof body === "string" && body.trim().length > 0;
  const { lead, memo } = hasInsight ? splitLead(body as string) : { lead: "", memo: "" };
  // The date shows ONLY alongside a real insight (states b + d carry no header date, D-15).
  const showDate = hasInsight && !!dateLabel;
  // The "How is this written?" note is surfaced on focus/tap (not title alone, which is
  // invisible to sighted keyboard + touch users) and its trigger clears a ≥44px hit area.
  const [noteOpen, setNoteOpen] = useState(false);

  return (
    <section
      className={cn(
        // The elevation card, reused verbatim from kpi-card…
        "relative overflow-hidden rounded-xl bg-card p-6 text-card-foreground shadow-sm ring-1 ring-foreground/10",
        // …with the warm terracotta top hairline (the 1px inset highlight tinted --ai-accent/~35%).
        "before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-[var(--ai-accent)]/35",
        className,
      )}
    >
      {/* The faint ~8% --ai-accent surface wash over bg-card (D-14a). Decorative, behind the content. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[var(--ai-accent)]/[0.08]"
      />

      <div className="relative flex flex-col gap-3">
        {/* 1. Header lockup — the ONLY attribution + date. */}
        <div className="flex items-center gap-2">
          <AiSpark
            size={15}
            className="ai-spark-twinkle shrink-0 text-[var(--ai-accent)]"
          />
          <span className="text-sm font-semibold text-[var(--ai-accent)]">Claude</span>
          {showDate && (
            <>
              <span aria-hidden="true" className="text-muted-foreground">
                ·
              </span>
              <span className="font-mono text-sm text-muted-foreground">{dateLabel}</span>
            </>
          )}
          <button
            type="button"
            aria-label={TOOLTIP_COPY}
            aria-expanded={noteOpen}
            onClick={() => setNoteOpen((v) => !v)}
            onFocus={() => setNoteOpen(true)}
            onBlur={() => setNoteOpen(false)}
            className="-my-2 ml-0.5 inline-flex min-h-11 min-w-11 cursor-help select-none items-center justify-center rounded text-sm text-muted-foreground/70 outline-none hover:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span aria-hidden="true">ⓘ</span>
          </button>
        </div>

        {/* The note itself — revealed on focus/tap, visible to everyone (not title-only). */}
        {noteOpen && (
          <p className="text-xs leading-relaxed text-muted-foreground">{TOOLTIP_COPY}</p>
        )}

        {/* States (b) first-run + (d) error — a single warm line, no lead/memo split, no date. */}
        {errored && (
          <p className="text-base leading-relaxed text-muted-foreground">{ERROR_COPY}</p>
        )}
        {!errored && !hasInsight && (
          <p className="text-base italic leading-snug text-muted-foreground">{FIRST_RUN_COPY}</p>
        )}

        {/* States (a) + (c) — the italic lead (2) + the memo paragraph (3). Body is React-escaped. */}
        {hasInsight && (
          <>
            <p className="text-base italic leading-snug text-card-foreground">{lead}</p>
            {memo && (
              <p className="text-base leading-relaxed text-card-foreground">{memo}</p>
            )}
          </>
        )}
      </div>
    </section>
  );
}
