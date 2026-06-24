import { afterEach, describe, expect, it } from "vitest";

// Wave-0 RED (DEMO-04, D4-17) — freezes the landing "View demo →" CTA wiring for the
// not-yet-existent `src/lib/demo/landing-cta.ts`. RED on import until the later wave builds it.
//
// The Phase-3 landing (`src/app/(auth)/login/page.tsx`) ships a DISABLED "View demo →" shell;
// Phase 4 swaps it for a live `<a href={NEXT_PUBLIC_DEMO_URL}>`. The vitest harness runs in the
// `node` environment (no DOM render — same discipline as `status-banners.test.tsx`), so the
// CTA's wiring is factored into a PURE helper `demoCtaProps(env)` the page consumes. The helper
// resolves the href from `process.env.NEXT_PUBLIC_DEMO_URL` and reports whether the control is
// disabled — when the URL is set the CTA is LIVE (not disabled / not aria-disabled); when unset it
// degrades to `href="#"` and stays disabled (D4-17). No real URL literal appears here.
import { demoCtaProps } from "@/lib/demo/landing-cta";

const KEY = "NEXT_PUBLIC_DEMO_URL";
const original = process.env[KEY];

afterEach(() => {
  if (original === undefined) delete process.env[KEY];
  else process.env[KEY] = original;
});

describe("landing 'View demo →' CTA (DEMO-04, D4-17)", () => {
  it("resolves the href from NEXT_PUBLIC_DEMO_URL and is NOT disabled when the URL is set", () => {
    const url = "https://demo.example.test";
    process.env[KEY] = url;
    const props = demoCtaProps(process.env);
    expect(props.href).toBe(url);
    expect(props.disabled).toBe(false);
    expect(props.ariaDisabled).not.toBe(true);
  });

  it("degrades to href='#' and stays disabled when NEXT_PUBLIC_DEMO_URL is unset", () => {
    delete process.env[KEY];
    const props = demoCtaProps(process.env);
    expect(props.href).toBe("#");
    expect(props.disabled).toBe(true);
  });

  it("never emits an @-sign in the resolved href (no PII / no mailto)", () => {
    process.env[KEY] = "https://demo.example.test";
    expect(demoCtaProps(process.env).href.includes("@")).toBe(false);
  });
});
