import { findWhitelistMatch } from "../../domains/autostart/autostartRules";
import { resolvePresetFilters, type PresetStorage } from "../../domains/presets/defaultPresets";
import { STORAGE_KEYS } from "../../infrastructure/chrome/storageKeys";
import { readCaptureTabSnapshots } from "./captureCoordinator";

export interface ApplyAutostartOptions {
  resetWhenNoMatch?: boolean;
}

export const applyAutostartForTab = async (
  tabId: number | undefined,
  url: string | undefined,
  options: ApplyAutostartOptions = {},
): Promise<void> => {
  if (tabId == null || !url || !url.startsWith("http")) return;

  const stored = await chrome.storage.local.get([
    STORAGE_KEYS.AUTOSTART_RULES,
    STORAGE_KEYS.PRESETS,
  ]);
  const entry = findWhitelistMatch(stored[STORAGE_KEYS.AUTOSTART_RULES], url);
  if (!entry) {
    if (options.resetWhenNoMatch) {
      await chrome.storage.local.set({ [STORAGE_KEYS.tabEnabled(tabId)]: false });
    }
    return;
  }

  const presets = stored[STORAGE_KEYS.PRESETS] as PresetStorage | undefined;
  const preset = resolvePresetFilters(entry.presetName, presets);
  if (!Array.isArray(preset) || preset.length === 0) {
    await chrome.storage.local.set({ [STORAGE_KEYS.tabEnabled(tabId)]: false });
    return;
  }

  const snapshotTabIds = (await readCaptureTabSnapshots()).map((snapshot) => snapshot.tabId);
  const legacySession = await chrome.storage.session.get(STORAGE_KEYS.TOOLKIT_WINDOW_TAB_IDS);
  const legacyTabIds = Array.isArray(legacySession[STORAGE_KEYS.TOOLKIT_WINDOW_TAB_IDS])
    ? (legacySession[STORAGE_KEYS.TOOLKIT_WINDOW_TAB_IDS] as number[])
    : [];
  // ponytail: the legacy union disappears in task 6 with the old window-mode path.
  const capturedTabIds = new Set([...snapshotTabIds, ...legacyTabIds]);

  await chrome.storage.local.set({
    [STORAGE_KEYS.tabFilters(tabId)]: preset,
    [STORAGE_KEYS.FILTERS]: preset,
    [STORAGE_KEYS.tabEnabled(tabId)]: !capturedTabIds.has(tabId),
  });
};
