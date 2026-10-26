import { describe, expect, test } from "vitest";

import { GUIDE_SCREENS, getGuideNavigation, shouldCompleteGuide } from "./onboardingGuideScreens";

describe("onboarding guide navigation", () => {
  test("enables navigation actions for the current screen", () => {
    expect(getGuideNavigation(0)).toEqual({
      canGoBack: false,
      canSkip: false,
      isLast: false,
    });
    expect(getGuideNavigation(3).canSkip).toBe(true);
    expect(getGuideNavigation(GUIDE_SCREENS.length - 1).isLast).toBe(true);
  });

  test("completes only after skip or the final next action", () => {
    expect(shouldCompleteGuide("skip", 3)).toBe(true);
    expect(shouldCompleteGuide("next", GUIDE_SCREENS.length - 1)).toBe(true);
    expect(shouldCompleteGuide("next", 0)).toBe(false);
    expect(shouldCompleteGuide("close", 5)).toBe(false);
  });
});
