import { describe, expect, test } from "vitest";

import {
  GUIDE_SCREENS,
  GUIDE_SHORTCUTS,
  getGuideNavigation,
  shouldCompleteGuide,
} from "./onboardingGuideScreens";

describe("onboarding guide navigation", () => {
  test("keeps button explanations inside stages 4 and 5", () => {
    expect(GUIDE_SCREENS.map(({ stage }) => stage)).toEqual([1, 2, 3, 4, 4, 5, 5, 5, 6, 7, 8]);
    expect(getGuideNavigation(0)).toEqual({
      canGoBack: false,
      canSkip: false,
      isLast: false,
    });
    expect(getGuideNavigation(3).canSkip).toBe(true);
    expect(getGuideNavigation(GUIDE_SCREENS.length - 1).isLast).toBe(true);
  });

  test("shows the fixed Q-factor gesture with the other shortcuts", () => {
    expect(GUIDE_SHORTCUTS).toEqual([
      ["shortcut_mute_label", "Alt+M"],
      ["shortcut_toggle_eq_label", "Alt+K"],
      ["shortcut_q_factor_label", "Shift+Drag"],
      ["shortcut_precise_frequency_label", "Ctrl+Drag"],
      ["shortcut_reset_point_label", "Double-click"],
    ]);
  });

  test("keeps the Q-factor explanation on the equalizer screen", () => {
    expect(GUIDE_SCREENS.find(({ target }) => target === "equalizer")).toMatchObject({
      additionalMessageKeys: [
        "q_factor_shift_hint",
        "precise_frequency_ctrl_hint",
        "point_double_click_hint",
        "guide_spectrum_visualization_hint",
      ],
    });
  });

  test("completes only after skip or the final next action", () => {
    expect(shouldCompleteGuide("skip", 3)).toBe(true);
    expect(shouldCompleteGuide("next", GUIDE_SCREENS.length - 1)).toBe(true);
    expect(shouldCompleteGuide("next", 0)).toBe(false);
    expect(shouldCompleteGuide("close", 5)).toBe(false);
  });
});
