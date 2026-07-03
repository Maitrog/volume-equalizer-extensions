import { findWhitelistMatch } from "../../domains/autostart/autostartRules";
import { STORAGE_KEYS } from "../../infrastructure/chrome/storageKeys";

export interface ApplyAutostartOptions {
  resetWhenNoMatch?: boolean;
}

type PresetStore = Record<string, unknown>;

export const applyAutostartForTab = async (
  tabId: number | undefined,
  url: string | undefined,
  options: ApplyAutostartOptions = {}
): Promise<void> => {
  if (tabId == null || !url || !url.startsWith("http")) return;

  const stored = await chrome.storage.local.get([
    STORAGE_KEYS.AUTOSTART_RULES,
    STORAGE_KEYS.PRESETS,
  ]);
  const entry = findWhitelistMatch(
    stored[STORAGE_KEYS.AUTOSTART_RULES],
    url
  );
  if (!entry) {
    if (options.resetWhenNoMatch) {
      await chrome.storage.local.set({ [STORAGE_KEYS.tabEnabled(tabId)]: false });
    }
    return;
  }

  const presets = stored[STORAGE_KEYS.PRESETS] as PresetStore | undefined;
  const preset = presets?.[entry.presetName];
  if (!Array.isArray(preset) || preset.length === 0) {
    await chrome.storage.local.set({ [STORAGE_KEYS.tabEnabled(tabId)]: false });
    return;
  }

  await chrome.storage.local.set({
    [STORAGE_KEYS.tabFilters(tabId)]: preset,
    [STORAGE_KEYS.FILTERS]: preset,
    [STORAGE_KEYS.tabEnabled(tabId)]: true,
  });
};
