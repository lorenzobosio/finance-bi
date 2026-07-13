// src/components/ai-spark.tsx — the ORIGINAL, Claude-EVOCATIVE "spark" mark (D-17, LOCKED).
//
// A soft, hand-drawn-feeling radial burst of ~11 tapered-teardrop petals. This is NOT Anthropic's
// literal Claude/Anthropic logo — it carries the "in the Claude family" warmth (warm terracotta +
// editorial voice) with ZERO trademark exposure, and survives a future personal→public transition
// unchanged (see D-17 + the `productization-maybe` memory).
//
// Construction (per UI-SPEC §AI Visual Identity): 24×24 viewBox; 11 petals rotated by i*(360/11)
// about the center (12,12); 2–3 petals ~15% longer to break machine symmetry; round joins; no
// gradient, no center hole. `fill="currentColor"` so it tints via `--ai-accent` (or any `text-*`).
//
// Purely presentational (`aria-hidden`) — attribution is nominative TEXT (`Claude`), never the mark.

const PETAL_COUNT = 11;

// A tapered teardrop pointing UP from the center (12,12) to a rounded tip. Two lengths: the base
// petal reaches y≈2 (length ~10); the "long" petal reaches y≈0.5 (length ~11.5, ~15% longer).
const BASE_PETAL = "M12 12 C10.9 7 11.3 4 12 2 C12.7 4 13.1 7 12 12 Z";
const LONG_PETAL = "M12 12 C10.85 6.5 11.3 3 12 0.5 C12.7 3 13.15 6.5 12 12 Z";

// Three non-evenly-spaced petals are elongated to break the machine-perfect symmetry (organic feel).
const LONG_INDEXES = new Set([0, 3, 7]);

export interface AiSparkProps {
  /** Rendered size in px (icon size, not spacing). Default 15 — the voice-card header lockup. */
  size?: number;
  /** Extra classes (e.g. `text-[var(--ai-accent)]` to tint, or `ai-spark-twinkle` for the reveal). */
  className?: string;
}

/** The original AI spark mark. Tints via `currentColor`; decorative (aria-hidden). */
export function AiSpark({ size = 15, className }: AiSparkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {Array.from({ length: PETAL_COUNT }, (_, i) => (
        <path
          key={i}
          d={LONG_INDEXES.has(i) ? LONG_PETAL : BASE_PETAL}
          transform={`rotate(${(i * 360) / PETAL_COUNT} 12 12)`}
        />
      ))}
    </svg>
  );
}
