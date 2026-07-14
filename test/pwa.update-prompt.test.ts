import { describe, expect, it } from "vitest";

// Wave-0 TDD RED (PWA-03, D-06) — freezes the PURE update-prompt reducer contract for the
// not-yet-existent `@/lib/pwa/update-prompt-model` (built GREEN in 11-03). RED at RUNTIME only
// ("Cannot find package '@/lib/pwa/update-prompt-model'"); the COMPUTED import specifier keeps
// `tsc --noEmit` green while the module is absent (same idiom as test/cashflow.safe-to-spend.test.ts).
//
// The reducer is PURE — it maps (state, action) → fresh state; it never touches sessionStorage, the
// SW, or a clock (the sw-update-prompt.tsx client component owns those side effects). The calm
// behaviour (11-UI-SPEC §Update Prompt): a soft-dismiss hides the prompt but it REAPPEARS on the next
// `waiting` worker (D-06, mirrors reconnect-banner.tsx) — the prompt never auto-dismisses on a timer.
//
// Synthetic state only; no PII.

const MODULE = "@/lib/pwa/update-prompt-model";

interface UpdatePromptState {
  visible: boolean;
  reloading: boolean;
}
type UpdatePromptAction =
  | { type: "waiting" }
  | { type: "dismiss" }
  | { type: "reload" };
interface UpdatePromptModule {
  updatePromptReducer: (
    state: UpdatePromptState,
    action: UpdatePromptAction,
  ) => UpdatePromptState;
  initialUpdatePromptState: UpdatePromptState;
}

async function load(): Promise<UpdatePromptModule> {
  const mod = (await import(/* @vite-ignore */ MODULE)) as Record<string, unknown>;
  return {
    updatePromptReducer: mod.updatePromptReducer as UpdatePromptModule["updatePromptReducer"],
    initialUpdatePromptState: mod.initialUpdatePromptState as UpdatePromptState,
  };
}

describe("updatePromptReducer — initial state is hidden and idle", () => {
  it("starts hidden with no reload in flight", async () => {
    const { initialUpdatePromptState } = await load();
    expect(initialUpdatePromptState.visible).toBe(false);
    expect(initialUpdatePromptState.reloading).toBe(false);
  });
});

describe("updatePromptReducer — a waiting worker reveals the prompt", () => {
  it("shows the prompt on {type:'waiting'} without starting a reload", async () => {
    const { updatePromptReducer, initialUpdatePromptState } = await load();
    const next = updatePromptReducer(initialUpdatePromptState, { type: "waiting" });
    expect(next.visible).toBe(true);
    expect(next.reloading).toBe(false);
  });
});

describe("updatePromptReducer — soft-dismiss hides, then reappears on the next waiting (D-06)", () => {
  it("hides on {type:'dismiss'} and re-shows on a SECOND {type:'waiting'}", async () => {
    const { updatePromptReducer, initialUpdatePromptState } = await load();
    const shown = updatePromptReducer(initialUpdatePromptState, { type: "waiting" });
    const dismissed = updatePromptReducer(shown, { type: "dismiss" });
    expect(dismissed.visible).toBe(false);
    // Soft-dismiss, NOT permanent: the next waiting worker reveals it again.
    const reshown = updatePromptReducer(dismissed, { type: "waiting" });
    expect(reshown.visible).toBe(true);
  });
});

describe("updatePromptReducer — reload consents and starts the reload", () => {
  it("hides the prompt and flags reloading on {type:'reload'}", async () => {
    const { updatePromptReducer, initialUpdatePromptState } = await load();
    const shown = updatePromptReducer(initialUpdatePromptState, { type: "waiting" });
    const reloading = updatePromptReducer(shown, { type: "reload" });
    expect(reloading.visible).toBe(false);
    expect(reloading.reloading).toBe(true);
  });
});

describe("updatePromptReducer — purity: never mutates its input state", () => {
  it("returns a fresh object and leaves the passed-in state unchanged", async () => {
    const { updatePromptReducer } = await load();
    const input: UpdatePromptState = { visible: false, reloading: false };
    const snapshot = { ...input };
    const next = updatePromptReducer(input, { type: "waiting" });
    expect(next).not.toBe(input);
    expect(input).toEqual(snapshot);
  });
});
