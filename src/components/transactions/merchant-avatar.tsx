import { Store } from "lucide-react";

import { merchantAvatar } from "@/lib/transactions/merchant-avatar";
import { cn } from "@/lib/utils";

// The presentational merchant avatar (TXN-03, D-06). Renders the deterministic initials from the
// pure `merchantAvatar()` over a tinted ramp-color disc, or a neutral lucide <Store/> on bg-muted
// when the name is blank/unknown. ZERO external/network calls (privacy) — no logo service.
//
// CONTRAST: the disc uses the chart-ramp token at low alpha (color-mix over the card surface) with
// `text-foreground` initials, so the label is essentially foreground-on-surface — it holds WCAG-AA
// in BOTH themes without per-token darkening (the Phase-6 --ai-accent contrast lesson, MEMORY).

export function MerchantAvatar({
  name,
  className,
}: {
  name: string | null | undefined;
  className?: string;
}) {
  const { initials, color } = merchantAvatar(name);

  if (initials === null) {
    return (
      <span
        aria-hidden
        className={cn(
          "inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground",
          className,
        )}
      >
        <Store className="size-3.5" />
      </span>
    );
  }

  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex size-7 shrink-0 items-center justify-center rounded-full text-[0.65rem] font-semibold text-foreground",
        className,
      )}
      style={{ backgroundColor: `color-mix(in oklab, ${color} 22%, var(--card))` }}
    >
      {initials}
    </span>
  );
}
