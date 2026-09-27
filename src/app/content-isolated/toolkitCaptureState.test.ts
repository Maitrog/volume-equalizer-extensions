import { describe, expect, test } from "vitest";

import { STORAGE_KEYS } from "../../infrastructure/chrome/storageKeys";
import { isLatestModeCheck, resolveShortcutToggle, resolveTabEnabled } from "./toolkitCaptureState";

describe("resolveTabEnabled", () => {
  test("keeps the page equalizer disabled while its tab is captured", () => {
    expect(resolveTabEnabled(true, true)).toBe(false);
  });

  test("keeps a frame loaded during capture disabled without extra processing", () => {
    // A newly loaded iframe requests the ordinary mode but must stay off for tab capture.
    expect(resolveTabEnabled(true, true)).toBe(false);
  });

  test("preserves the requested state outside toolkit capture", () => {
    expect(resolveTabEnabled(true, false)).toBe(true);
    expect(resolveTabEnabled(false, false)).toBe(false);
  });
});

describe("isLatestModeCheck", () => {
  test("drops a stale async mode reply after a newer check starts", () => {
    expect(isLatestModeCheck(1, 2)).toBe(false);
    expect(isLatestModeCheck(2, 2)).toBe(true);
  });
});

describe("resolveShortcutToggle", () => {
  test("routes equalizer toggling to the toolkit while captured", () => {
    expect(
      resolveShortcutToggle({
        key: STORAGE_KEYS.tabEnabled(123),
        currentValue: false,
        enabledKey: STORAGE_KEYS.tabEnabled(123),
        enableTab: false,
        isToolkitCaptured: true,
        toolkitAction: "toggleEq",
      }),
    ).toEqual({ toolkitAction: "toggleEq" });
  });

  test("routes mute to the toolkit while captured", () => {
    expect(
      resolveShortcutToggle({
        key: STORAGE_KEYS.tabMute(123),
        currentValue: false,
        enabledKey: STORAGE_KEYS.tabEnabled(123),
        enableTab: true,
        isToolkitCaptured: true,
        toolkitAction: "mute",
      }),
    ).toEqual({ toolkitAction: "mute" });
  });

  test("keeps storage-based shortcut behavior outside toolkit capture", () => {
    expect(
      resolveShortcutToggle({
        key: STORAGE_KEYS.tabMute(123),
        currentValue: false,
        enabledKey: STORAGE_KEYS.tabEnabled(123),
        enableTab: true,
        isToolkitCaptured: false,
        toolkitAction: "mute",
      }),
    ).toEqual({
      storageValues: {
        [STORAGE_KEYS.tabMute(123)]: true,
        [STORAGE_KEYS.tabEnabled(123)]: true,
      },
    });
  });
});
