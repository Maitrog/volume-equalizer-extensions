import { clampPointCount } from "../../domains/equalizer/equalizerMath";
import { resolveShortcuts, type ShortcutMap } from "../../domains/shortcuts/shortcuts";
import { STORAGE_KEYS } from "../../infrastructure/chrome/storageKeys";

export type ThemeName = "dark" | "light";

const resolveTheme = (value: unknown): ThemeName => (value === "light" ? "light" : "dark");

export const createSettingsActions = () => ({
  load: async () => {
    const stored = await chrome.storage.local.get([
      STORAGE_KEYS.THEME,
      STORAGE_KEYS.POINT_COUNT,
      STORAGE_KEYS.SHORTCUTS,
      STORAGE_KEYS.ENABLE_SPECTRUM,
      STORAGE_KEYS.ENABLE_VOLUME_COMPENSATION,
      STORAGE_KEYS.HIDE_DEFAULT_PRESETS,
    ]);
    return {
      theme: resolveTheme(stored[STORAGE_KEYS.THEME]),
      pointCount: clampPointCount(Number(stored[STORAGE_KEYS.POINT_COUNT])),
      shortcuts: resolveShortcuts(stored[STORAGE_KEYS.SHORTCUTS] as Partial<ShortcutMap>),
      enableSpectrum: stored[STORAGE_KEYS.ENABLE_SPECTRUM] !== false,
      enableVolumeCompensation: stored[STORAGE_KEYS.ENABLE_VOLUME_COMPENSATION] === true,
      hideDefaultPresets: stored[STORAGE_KEYS.HIDE_DEFAULT_PRESETS] === true,
    };
  },
  loadPointCount: async (): Promise<number> => {
    const stored = await chrome.storage.local.get([STORAGE_KEYS.POINT_COUNT]);
    return clampPointCount(Number(stored[STORAGE_KEYS.POINT_COUNT]));
  },
  shouldSkipPointCountConfirmation: async (): Promise<boolean> => {
    const stored = await chrome.storage.local.get([STORAGE_KEYS.SKIP_POINTS_CONFIRM]);
    return (
      stored[STORAGE_KEYS.SKIP_POINTS_CONFIRM] === true ||
      stored[STORAGE_KEYS.SKIP_POINTS_CONFIRM] === "true"
    );
  },
  saveTheme: (theme: ThemeName): Promise<void> =>
    chrome.storage.local.set({ [STORAGE_KEYS.THEME]: theme }),
  saveShortcuts: (shortcuts: ShortcutMap): Promise<void> =>
    chrome.storage.local.set({ [STORAGE_KEYS.SHORTCUTS]: shortcuts }),
  savePointCount: (count: number): Promise<void> =>
    chrome.storage.local.set({ [STORAGE_KEYS.POINT_COUNT]: clampPointCount(count) }),
  saveSkipPointCountConfirmation: (skip: boolean): Promise<void> =>
    chrome.storage.local.set({ [STORAGE_KEYS.SKIP_POINTS_CONFIRM]: skip }),
  saveSpectrumEnabled: (enabled: boolean): Promise<void> =>
    chrome.storage.local.set({ [STORAGE_KEYS.ENABLE_SPECTRUM]: enabled }),
  saveVolumeCompensationEnabled: (enabled: boolean): Promise<void> =>
    chrome.storage.local.set({ [STORAGE_KEYS.ENABLE_VOLUME_COMPENSATION]: enabled }),
  saveHideDefaultPresets: (hidden: boolean): Promise<void> =>
    chrome.storage.local.set({ [STORAGE_KEYS.HIDE_DEFAULT_PRESETS]: hidden }),
});
