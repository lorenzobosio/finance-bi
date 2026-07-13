import { describe, expect, it } from "vitest";

// G1 (D5-16 demo-alive) — the demo-aware display clock. The public demo's data window ends before
// the real wall-clock "now", so without a demo-anchored clock the demo opens on an EMPTY current
// month (all €0). demoAwareNow re-anchors the DISPLAY clock (never the partition / RLS) to the
// demo's latest data month so Home KPIs, streak, reserve, and charts render on first load.
//
// The single-source guard ties the anchor to the generator window: it recomputes the generator's
// latest period_key and asserts demoAwareNow(true, …) resolves to it — a future window change that
// forgets to move DEMO_NOW_ISO fails loudly here.
import { demoAwareNow, DEMO_NOW_ISO } from "@/lib/demo/mode";
import { currentPeriodKey } from "@/lib/period";
import { generateDemoHousehold } from "@/lib/demo/generator";

describe("demoAwareNow (G1 / D5-16)", () => {
  it("returns realNow UNCHANGED in real mode (never re-anchored)", () => {
    const d = new Date("2026-07-13T09:30:00Z");
    expect(demoAwareNow(false, d)).toBe(d);
  });

  it("exposes the demo anchor as the generator's last window month-end", () => {
    expect(DEMO_NOW_ISO).toBe("2026-03-31");
  });

  it("anchors the demo clock to the generator's LATEST data month (single-source guard)", () => {
    const latestPeriod = Math.max(
      ...generateDemoHousehold().transactions.map((t) => t.periodKey),
    );
    // For ANY real date, demo mode resolves to the same demo-window period_key.
    expect(currentPeriodKey(demoAwareNow(true, new Date()))).toBe(latestPeriod);
    expect(currentPeriodKey(demoAwareNow(true, new Date("2030-01-01T00:00:00Z")))).toBe(
      latestPeriod,
    );
  });
});
