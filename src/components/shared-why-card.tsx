"use client";

// SharedWhyCard — the couple's editable "Our why" statement (PERS-04, D5-17). The emotional anchor of
// the Goal page and the PRIMARY content of the pre-launch waiting state (D5-16). EITHER partner can
// edit it; the single shared household row means a save by one is seen by both. The text is rendered
// as React-escaped TEXT (never dangerouslySetInnerHTML) — with the edit-why zod length bound as the
// second XSS guard-rail (T-05-14).
//
// Inline edit: a "Edit" affordance flips a controlled <textarea> whose <form action={editWhy}> posts
// the FormData Server Action; on success the RSC revalidates (/goal + /) and the fresh value flows
// back down. A useTransition pending state disables the controls during the write. Touch targets are
// ≥44px (Fernanda's mobile — UI-SPEC Spacing).

import { Pencil } from "lucide-react";
import { useState, useTransition } from "react";

import { editWhy } from "@/lib/actions/edit-why";
import { WHY_MAX_LENGTH } from "@/lib/actions/edit-why.schema";
import { cn } from "@/lib/utils";

/** The gentle example shown when the couple has not written their own "why" yet (UI-SPEC copy). */
const WHY_EXAMPLE =
  "€100.000 invested is roughly one year we could take off together — to travel, to choose work we love, or just to never panic about a bad month again.";

export interface SharedWhyCardProps {
  /** The stored shared "why", or null when unset (shows the example as a prompt). */
  why: string | null;
  /**
   * The couple attribution line, e.g. "Lorenzo & Fernanda, Berlin" — passed from the RSC so it is
   * DEMO-AWARE (the anon demo shows the anonymized personas, never the real owners' names).
   */
  attribution: string;
  className?: string;
}

export function SharedWhyCard({ why, attribution, className }: SharedWhyCardProps) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();

  const hasWhy = why != null && why.trim().length > 0;

  async function onSubmit(formData: FormData) {
    startTransition(async () => {
      await editWhy(formData);
      setEditing(false);
    });
  }

  return (
    <section
      className={cn(
        "rounded-xl bg-card p-6 text-card-foreground ring-1 ring-foreground/10",
        className,
      )}
      aria-label="Our why"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground">
          Our why
        </h2>
        {!editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <Pencil aria-hidden="true" className="size-4" />
            Edit
          </button>
        )}
      </div>

      {editing ? (
        <form action={onSubmit} className="mt-3 space-y-3">
          <label htmlFor="why" className="sr-only">
            Our why — the reason we&apos;re building €100.000 together
          </label>
          <textarea
            id="why"
            name="why"
            defaultValue={hasWhy ? (why as string) : ""}
            maxLength={WHY_MAX_LENGTH}
            rows={4}
            placeholder={WHY_EXAMPLE}
            disabled={pending}
            className="w-full resize-none rounded-lg border border-input bg-background p-3 text-sm leading-relaxed text-foreground shadow-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60"
          />
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={pending}
              className="inline-flex min-h-11 items-center justify-center rounded-md bg-[var(--brand)] px-4 text-sm font-medium text-white transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60"
            >
              {pending ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              disabled={pending}
              className="inline-flex min-h-11 items-center justify-center rounded-md px-4 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="mt-3">
          {hasWhy ? (
            <p className="text-sm leading-relaxed text-foreground">{why}</p>
          ) : (
            <p className="text-sm leading-relaxed text-muted-foreground italic">
              {WHY_EXAMPLE}
            </p>
          )}
          <p className="mt-3 text-xs text-muted-foreground">— {attribution}</p>
        </div>
      )}
    </section>
  );
}
