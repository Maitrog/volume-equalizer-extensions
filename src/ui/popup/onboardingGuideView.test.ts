import { GUIDE_SCREENS, getGuideNavigation } from "./onboardingGuideView";

describe("onboarding guide navigation", () => {
  test("keeps button explanations inside stages 4 and 5", () => {
    expect(GUIDE_SCREENS.map(({ stage }) => stage)).toEqual([
      1, 2, 3, 4, 4, 5, 5, 5, 6, 7, 8,
    ]);
    expect(getGuideNavigation(0)).toEqual({
      canGoBack: false,
      canSkip: false,
      isLast: false,
    });
    expect(getGuideNavigation(3).canSkip).toBe(true);
    expect(getGuideNavigation(GUIDE_SCREENS.length - 1).isLast).toBe(true);
  });
});
