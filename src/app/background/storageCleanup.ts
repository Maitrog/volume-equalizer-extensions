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

// Frozen session keys of the removed WindowMod path. They stay as literals so an
// extension update can still wipe old installs without resurrecting dead constants.
const LEGACY_TOOLKIT_WINDOW_KEYS = [
  "toolkitWindowId",
  "toolkitWindowTabIds",
  "toolkitWindowActiveTabId",
  "toolkitWindowCaptureStreamIds",
];

export const clearLegacyToolkitWindowState = async (): Promise<void> => {
  await chrome.storage.session.remove(LEGACY_TOOLKIT_WINDOW_KEYS);
};
