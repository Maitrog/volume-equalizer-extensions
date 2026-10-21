import { afterEach, expect, test, vi } from "vitest";

import { STORAGE_KEYS } from "../../infrastructure/chrome/storageKeys";
import { DEFAULT_SHORTCUTS } from "../../domains/shortcuts/shortcuts";
import { createSettingsActions, resolveSettingsPreferences } from "./settingsActions";

afterEach(() => vi.unstubAllGlobals());

test("settings actions normalize loads and preserve storage contracts", async () => {
  const set = vi.fn(async () => undefined);
  vi.stubGlobal("chrome", {
    storage: {
      local: {
        get: vi.fn(async () => ({
          [STORAGE_KEYS.THEME]: "invalid",
          [STORAGE_KEYS.POINT_COUNT]: "99",
          [STORAGE_KEYS.SHORTCUTS]: { mute: { key: "m", ctrl: true } },
          [STORAGE_KEYS.ENABLE_SPECTRUM]: true,
          [STORAGE_KEYS.HIDE_DEFAULT_PRESETS]: true,
        })),
        set,
      },
    },
  });
  const actions = createSettingsActions();

  const loaded = await actions.load();
  expect(loaded.theme).toBe("dark");
  expect(loaded.pointCount).toBe(9);
  expect(loaded.hideDefaultPresets).toBe(true);
  expect(loaded.enableSpectrum).toBe(true);
  expect(loaded.enableVolumeCompensation).toBe(false);
  expect(loaded.shortcuts.mute?.key).toBe("m");

  await actions.saveTheme("light");
  await actions.savePointCount(12);
  await actions.saveShortcuts(loaded.shortcuts);
  await actions.saveVolumeCompensationEnabled(false);
  expect(set).toHaveBeenCalledWith({ [STORAGE_KEYS.THEME]: "light" });
  expect(set).toHaveBeenCalledWith({ [STORAGE_KEYS.POINT_COUNT]: 9 });
  expect(set).toHaveBeenCalledWith({ [STORAGE_KEYS.SHORTCUTS]: loaded.shortcuts });
  expect(set).toHaveBeenCalledWith({ [STORAGE_KEYS.ENABLE_VOLUME_COMPENSATION]: false });
});

test("settings actions preserve an explicitly disabled volume compensation setting", async () => {
  vi.stubGlobal("chrome", {
    storage: {
      local: {
        get: vi.fn(async () => ({
          [STORAGE_KEYS.ENABLE_VOLUME_COMPENSATION]: false,
        })),
        set: vi.fn(async () => undefined),
      },
    },
  });

  expect((await createSettingsActions().load()).enableVolumeCompensation).toBe(false);
});

test("exports effective defaults including browser language", () => {
  expect(resolveSettingsPreferences({}, "ru")).toEqual({
    general: {
      theme: "dark",
      uiLanguage: "ru",
      pointCount: 5,
      enableSpectrum: true,
      enableVolumeCompensation: false,
      skipPointsResetConfirm: false,
    },
    shortcuts: DEFAULT_SHORTCUTS,
    hideDefaultPresets: false,
  });
});

test("resolves legacy skip flag", () => {
  expect(
    resolveSettingsPreferences({ [STORAGE_KEYS.SKIP_POINTS_CONFIRM]: "true" }, "en").general
      .skipPointsResetConfirm,
  ).toBe(true);
  expect(
    resolveSettingsPreferences({ [STORAGE_KEYS.SKIP_POINTS_CONFIRM]: "unknown" }, "en").general
      .skipPointsResetConfirm,
  ).toBe(false);
});
