import { clampPointCount } from "../../domains/equalizer/equalizerMath";
import {
  DEFAULT_LANGUAGE,
  LANGUAGE_KEY,
  resolveInitialLanguage,
} from "../../domains/localization/languages";
import type { GeneralSettings } from "../../domains/settings/settingsTransfer";
import { resolveShortcuts, type ShortcutMap } from "../../domains/shortcuts/shortcuts";
import { STORAGE_KEYS } from "../../infrastructure/chrome/storageKeys";

export type ThemeName = "dark" | "light";

const resolveTheme = (value: unknown): ThemeName => (value === "light" ? "light" : "dark");

export const resolveSettingsPreferences = (
  stored: Record<string, unknown>,
  browserLocale: string,
): { general: GeneralSettings; shortcuts: ShortcutMap; hideDefaultPresets: boolean } => ({
  general: {
    theme: resolveTheme(stored[STORAGE_KEYS.THEME]),
    uiLanguage: resolveInitialLanguage(stored[LANGUAGE_KEY], browserLocale),
    pointCount: clampPointCount(Number(stored[STORAGE_KEYS.POINT_COUNT])),
    enableSpectrum: stored[STORAGE_KEYS.ENABLE_SPECTRUM] !== false,
    enableVolumeCompensation: stored[STORAGE_KEYS.ENABLE_VOLUME_COMPENSATION] === true,
    skipPointsResetConfirm:
      stored[STORAGE_KEYS.SKIP_POINTS_CONFIRM] === true ||
      stored[STORAGE_KEYS.SKIP_POINTS_CONFIRM] === "true",
  },
  shortcuts: resolveShortcuts(stored[STORAGE_KEYS.SHORTCUTS] as Partial<ShortcutMap>),
  hideDefaultPresets: stored[STORAGE_KEYS.HIDE_DEFAULT_PRESETS] === true,
});

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
    const { general, shortcuts, hideDefaultPresets } = resolveSettingsPreferences(
      stored,
      DEFAULT_LANGUAGE,
    );
    return {
      theme: general.theme,
      pointCount: general.pointCount,
      shortcuts,
      enableSpectrum: general.enableSpectrum,
      enableVolumeCompensation: general.enableVolumeCompensation,
      hideDefaultPresets,
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
