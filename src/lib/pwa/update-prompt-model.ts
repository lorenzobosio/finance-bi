// src/lib/pwa/update-prompt-model.ts — the PURE SW update-prompt reducer (PWA-03, D-06).
// Frozen contract: test/pwa.update-prompt.test.ts.
//
// PURE: maps (state, action) → a FRESH state; it never touches sessionStorage, the SW, or a clock
// (the sw-update-prompt.tsx client component owns those side effects). The calm behaviour
// (11-UI-SPEC §Update Prompt): a soft-dismiss HIDES the prompt but it REAPPEARS on the next
// `waiting` worker (D-06, mirrors reconnect-banner.tsx) — it never auto-dismisses on a timer.

export interface UpdatePromptState {
  /** Whether the calm "A new version is available" prompt is showing. */
  visible: boolean;
  /** True once the user consents to reload (skip-waiting sent, reload in flight). */
  reloading: boolean;
}

export type UpdatePromptAction =
  | { type: "waiting" } // a new SW is waiting → reveal the prompt
  | { type: "dismiss" } // soft-dismiss → hide (reappears on the next waiting)
  | { type: "reload" }; // user consents → hide + start the reload

/** Hidden and idle until a waiting worker appears. */
export const initialUpdatePromptState: UpdatePromptState = {
  visible: false,
  reloading: false,
};

/**
 * updatePromptReducer — pure (state, action) → fresh state.
 * - waiting: reveal the prompt (no reload yet).
 * - dismiss: soft-hide (a later `waiting` re-reveals it — D-06).
 * - reload: hide + flag reloading (consent given).
 */
export function updatePromptReducer(
  state: UpdatePromptState,
  action: UpdatePromptAction,
): UpdatePromptState {
  switch (action.type) {
    case "waiting":
      return { ...state, visible: true };
    case "dismiss":
      return { ...state, visible: false };
    case "reload":
      return { ...state, visible: false, reloading: true };
    default:
      return state;
  }
}
