import { STORAGE_KEYS } from "../../infrastructure/chrome/storageKeys";

export const parseTabStorageKey = (key: string): number | null => {
  const match = /^(?:filters|enabled|mute|gain|volume|pan|captureError|spectrum)\.(\d+)$/.exec(key);
  return match && Number.isSafeInteger(Number(match[1])) ? Number(match[1]) : null;
};

export const clearTabStorage = async (tabId: number): Promise<void> => {
  await chrome.storage.local.remove([
    STORAGE_KEYS.tabFilters(tabId),
    STORAGE_KEYS.tabEnabled(tabId),
    STORAGE_KEYS.tabMute(tabId),
    STORAGE_KEYS.tabGain(tabId),
    STORAGE_KEYS.tabVolume(tabId),
    STORAGE_KEYS.tabPan(tabId),
    STORAGE_KEYS.tabCaptureError(tabId),
    STORAGE_KEYS.tabSpectrum(tabId),
  ]);
};

export const clearUnusedStorage = async (): Promise<void> => {
  const keys = await chrome.storage.local.getKeys();
  const tabs = await chrome.tabs.query({});
  const tabIds = new Set(tabs.flatMap(({ id }) => (id == null ? [] : [id])));
  const unusedKeys = keys.filter((key) => {
    const tabId = parseTabStorageKey(key);
    return tabId != null && !tabIds.has(tabId);
  });

  if (unusedKeys.length > 0) await chrome.storage.local.remove(unusedKeys);
};

export const clearLegacyToolkitWindowState = async (): Promise<void> => {
  await chrome.storage.session.remove([
    STORAGE_KEYS.TOOLKIT_WINDOW_ID,
    STORAGE_KEYS.TOOLKIT_WINDOW_TAB_IDS,
    STORAGE_KEYS.TOOLKIT_WINDOW_ACTIVE_TAB_ID,
    STORAGE_KEYS.TOOLKIT_WINDOW_CAPTURE_STREAM_IDS,
  ]);
};
