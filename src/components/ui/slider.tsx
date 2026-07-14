"use client"

import * as React from "react"
import { Slider as SliderPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

// The shadcn Slider wrapper over the in-tree unified `radix-ui` package (same convention as
// switch.tsx — NO `@radix-ui/react-slider`, no new dependency). Root/Track/Range/Thumb. The Root
// row carries `min-h-11` so the whole pointer row is a ≥44px touch target (UI-SPEC §Spacing —
// matches the launch-date input) even though the thumb renders at `size-5`. The filled Range, the
// Thumb border, and the focus ring use the `--brand` accent; the unfilled Track is muted; the Thumb
// has a visible focus-visible ring (WCAG-AA).
function Slider({
  className,
  ...props
}: React.ComponentProps<typeof SliderPrimitive.Root>) {
  return (
    <SliderPrimitive.Root
      data-slot="slider"
      className={cn(
        "relative flex min-h-11 w-full touch-none items-center select-none data-disabled:cursor-not-allowed data-disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <SliderPrimitive.Track
        data-slot="slider-track"
        className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-muted"
      >
        <SliderPrimitive.Range
          data-slot="slider-range"
          className="absolute h-full bg-brand"
        />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        data-slot="slider-thumb"
        className="block size-5 shrink-0 rounded-full border-2 border-brand bg-background shadow-sm transition-[color,box-shadow] outline-none focus-visible:ring-4 focus-visible:ring-brand/50 disabled:pointer-events-none disabled:opacity-50"
      />
    </SliderPrimitive.Root>
  )
}

export { Slider }
