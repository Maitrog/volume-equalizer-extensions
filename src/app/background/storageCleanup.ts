import { STORAGE_KEYS } from "../../infrastructure/chrome/storageKeys";

const CONSTANT_STORAGE_KEYS = [
  STORAGE_KEYS.PRESETS,
  STORAGE_KEYS.PRESET_NAMES,
  STORAGE_KEYS.AUTOSTART_RULES,
  STORAGE_KEYS.GAIN,
  STORAGE_KEYS.FILTERS,
  STORAGE_KEYS.ENABLE_SPECTRUM,
  STORAGE_KEYS.THEME,
  STORAGE_KEYS.UI_LANGUAGE,
  STORAGE_KEYS.SHORTCUTS,
  STORAGE_KEYS.INSTALL_UPDATE_NOTICE,
] as const;

export const clearUnusedStorage = async (): Promise<void> => {
  const stored = await chrome.storage.session.get([
    STORAGE_KEYS.REGISTERED_TAB_IDS,
  ]);
  const tabIds = Array.isArray(stored[STORAGE_KEYS.REGISTERED_TAB_IDS])
    ? stored[STORAGE_KEYS.REGISTERED_TAB_IDS]
    : [];

  chrome.storage.local.getKeys((keys) =>
    keys.forEach((key) => {
      const keyParts = key.split(".");
      const isRegisteredTabValue =
        keyParts.length === 2 &&
        tabIds.includes(Number.parseInt(keyParts[1], 10));

      if (
        !CONSTANT_STORAGE_KEYS.includes(
          key as (typeof CONSTANT_STORAGE_KEYS)[number]
        ) &&
        !isRegisteredTabValue
      ) {
        chrome.storage.local.remove(key);
      }
    })
  );
};
