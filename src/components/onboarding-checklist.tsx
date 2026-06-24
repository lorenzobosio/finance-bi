"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { AnimatePresence, domAnimation, LazyMotion, m } from "motion/react";
import { ArrowRight, CheckCircle2, Circle, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { dismissOnboarding } from "@/lib/actions/demo-mode";
import type { OnboardingStep, OnboardingStepId } from "@/lib/onboarding/state";

// Onboarding checklist — the non-blocking, dismissible Home "Band 0" card (Surface 1, ONB-01/02,
// D4-20). A calm 3-step pointer layer over the existing Config surfaces — explicitly NOT a wizard,
// NOT a route gate, NOT a middleware redirect. It renders only when the Home RSC has already
// decided getOnboardingState(...).complete === false AND the household has not dismissed it, so
// this component never needs the predicate's `complete` flag — it just paints the steps it is
// handed.
//
// Responsive (eval 07 R1 — the critical constraint): on ≥sm a full 3-step raised Card; on <sm a
// single "Continue setup →" outline pill linking to nextStep — so the Goal Hero is never pushed
// below the fold on a 375px-height phone. One component, a responsive variant (hidden sm:block for
// the card, sm:hidden for the pill).
//
// Motion: the inherited LazyMotion + domAnimation slide-down, initial={false} on SSR to skip the
// entrance flicker on first paint; AnimatePresence fade-out on dismiss. Fully gated by the root
// <MotionConfig reducedMotion="user"> (instant appear/vanish under prefers-reduced-motion).
//
// Dismissal fires the household-scoped dismissOnboarding server action (members.onboarding_dismissed_at,
// D4-21); the action revalidates the shell so the card disappears. A Config affordance re-surfaces it.

/** The English-only copy per step id (UI-SPEC Surface 1 copy table). */
const STEP_COPY: Record<
  OnboardingStepId,
  { todo: string; todoLink: string; done: string; caption?: string }
> = {
  connect: { todo: "Connect your bank", todoLink: "Connect →", done: "Bank connected" },
  budgets: { todo: "Set cost-center budgets", todoLink: "Set budgets →", done: "Budgets set" },
  alive: {
    todo: "See your first data",
    todoLink: "",
    done: "First data synced",
    caption:
      "First sync runs daily, around 06:00 Berlin time — your first data appears the next morning.",
  },
};

interface OnboardingChecklistProps {
  /** The derived steps from getOnboardingState (done flags + deep-link targets). */
  steps: OnboardingStep[];
  /** The first incomplete step id — the <sm pill links to its target. */
  nextStep: OnboardingStepId | null;
}

export function OnboardingChecklist({ steps, nextStep }: OnboardingChecklistProps) {
  const [dismissed, setDismissed] = useState(false);
  const [, startTransition] = useTransition();

  function onDismiss() {
    setDismissed(true); // optimistic exit; the action revalidates the shell to reconcile
    startTransition(() => void dismissOnboarding());
  }

  const doneCount = steps.filter((s) => s.done).length;
  const nextTarget = nextStep
    ? (steps.find((s) => s.id === nextStep)?.target ?? "/config")
    : "/config";

  return (
    <LazyMotion features={domAnimation}>
      <AnimatePresence>
        {!dismissed && (
          <m.div
            initial={false}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
          >
            {/* ≥sm — the full 3-step raised card. */}
            <Card className="hidden gap-0 rounded-xl bg-card px-6 py-4 shadow-sm ring-1 ring-foreground/10 sm:block">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-0.5">
                  <p className="text-sm font-semibold text-foreground">Get started</p>
                  <p className="text-sm text-muted-foreground">
                    <span className="font-mono tabular-nums">{doneCount}</span> of{" "}
                    <span className="font-mono tabular-nums">3</span> done
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={onDismiss}
                  aria-label="Dismiss setup guide"
                  className="size-11 shrink-0 sm:size-8"
                >
                  <X aria-hidden="true" />
                </Button>
              </div>

              <ol className="mt-3 flex flex-col gap-2">
                {steps.map((step) => (
                  <OnboardingStepRow key={step.id} step={step} />
                ))}
              </ol>
            </Card>

            {/* <sm — the single inline "Continue setup →" pill (protects the Goal Hero). */}
            <div className="flex sm:hidden">
              <Button asChild variant="outline" size="sm" className="min-h-11 w-full">
                <Link href={nextTarget}>
                  Continue setup
                  <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </LazyMotion>
  );
}

/** A single step row: done → CheckCircle2 + strike label; todo → Circle + a deep-link to the target. */
function OnboardingStepRow({ step }: { step: OnboardingStep }) {
  const copy = STEP_COPY[step.id];

  if (step.done) {
    return (
      <li className="flex min-h-11 items-center gap-2 sm:min-h-0">
        <CheckCircle2 aria-hidden="true" className="size-4 shrink-0 text-[var(--gain)]" />
        <span className="text-sm text-foreground line-through">{copy.done}</span>
      </li>
    );
  }

  // The "alive" step is informational (no link); every other todo step deep-links to its target.
  const isInformational = step.target === "/";

  return (
    <li className="flex min-h-11 flex-col justify-center gap-0.5 sm:min-h-0">
      <div className="flex items-center gap-2">
        <Circle aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        {isInformational ? (
          <span className="text-sm font-medium text-foreground">{copy.todo}</span>
        ) : (
          <Link
            href={step.target}
            className={cn(
              "group/step inline-flex items-center gap-1 text-sm font-medium text-foreground",
              "rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            )}
          >
            {copy.todo}
            <span className="text-muted-foreground group-hover/step:text-foreground">
              {copy.todoLink}
            </span>
          </Link>
        )}
      </div>
      {copy.caption && (
        <p className="pl-6 text-sm text-muted-foreground">{copy.caption}</p>
      )}
    </li>
  );
}
