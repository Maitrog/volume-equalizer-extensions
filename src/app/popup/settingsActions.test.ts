import { afterEach, expect, test, vi } from "vitest";

import { STORAGE_KEYS } from "../../infrastructure/chrome/storageKeys";
import { createSettingsActions } from "./settingsActions";

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
