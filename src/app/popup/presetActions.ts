import { isPresetUsedInWhitelist } from "../../domains/autostart/autostartRules";
import { readPersistedFilters } from "../../domains/equalizer/persistedFilters";
import type { EqualizerFilter } from "../../domains/equalizer/types";
import {
  getAvailablePresetNames,
  isDefaultPresetName,
  resolvePresetFilters,
  type PresetStorage,
} from "../../domains/presets/defaultPresets";
import { validatePresetName } from "../../domains/presets/presetNameValidation";
import { STORAGE_KEYS } from "../../infrastructure/chrome/storageKeys";

export const createPresetActions = (deps: {
  getCurrentTabId(): Promise<number | null>;
  getCurrentFilters(): EqualizerFilter[];
}) => {
  const load = async () => {
    const stored = await chrome.storage.local.get([
      STORAGE_KEYS.PRESETS,
      STORAGE_KEYS.PRESET_NAMES,
      STORAGE_KEYS.HIDE_DEFAULT_PRESETS,
    ]);
    return {
      presets: { ...((stored[STORAGE_KEYS.PRESETS] ?? {}) as PresetStorage) },
      presetNames: [...((stored[STORAGE_KEYS.PRESET_NAMES] ?? []) as string[])],
      includeDefaultPresets: stored[STORAGE_KEYS.HIDE_DEFAULT_PRESETS] !== true,
    };
  };

  return {
    load,
    loadAvailablePresetNames: async (): Promise<string[]> => {
      const current = await load();
      return getAvailablePresetNames(current.presetNames, {
        includeDefaultPresets: current.includeDefaultPresets,
      });
    },
    savePreset: async (rawName: string) => {
      const tabId = await deps.getCurrentTabId();
      if (tabId == null) return { ok: false as const, reason: "missingTab" as const };
      const stored = await chrome.storage.local.get([
        STORAGE_KEYS.tabFilters(tabId),
        STORAGE_KEYS.PRESETS,
        STORAGE_KEYS.PRESET_NAMES,
      ]);
      const presetNames = [...((stored[STORAGE_KEYS.PRESET_NAMES] ?? []) as string[])];
      const validation = validatePresetName(rawName, presetNames);
      if (validation.kind === "error") return { ok: false as const, reason: validation.reason };
      const presets = { ...((stored[STORAGE_KEYS.PRESETS] ?? {}) as PresetStorage) };
      presets[validation.name] =
        readPersistedFilters(stored[STORAGE_KEYS.tabFilters(tabId)]) ?? deps.getCurrentFilters();
      presetNames.push(validation.name);
      await chrome.storage.local.set({
        [STORAGE_KEYS.PRESETS]: presets,
        [STORAGE_KEYS.PRESET_NAMES]: presetNames,
      });
      return { ok: true as const, name: validation.name, presetNames };
    },
    deletePreset: async (name: string) => {
      if (isDefaultPresetName(name)) return { ok: false as const, reason: "default" as const };
      const stored = await chrome.storage.local.get([
        STORAGE_KEYS.PRESETS,
        STORAGE_KEYS.PRESET_NAMES,
        STORAGE_KEYS.AUTOSTART_RULES,
      ]);
      if (isPresetUsedInWhitelist(stored[STORAGE_KEYS.AUTOSTART_RULES], name)) {
        return { ok: false as const, reason: "used" as const };
      }
      const presets = { ...((stored[STORAGE_KEYS.PRESETS] ?? {}) as PresetStorage) };
      const presetNames = ((stored[STORAGE_KEYS.PRESET_NAMES] ?? []) as string[]).filter(
        (presetName) => presetName !== name,
      );
      delete presets[name];
      await chrome.storage.local.set({
        [STORAGE_KEYS.PRESETS]: presets,
        [STORAGE_KEYS.PRESET_NAMES]: presetNames,
      });
      return { ok: true as const, presetNames };
    },
    selectPreset: async (name: string): Promise<EqualizerFilter[] | null> => {
      const { presets } = await load();
      return resolvePresetFilters(name, presets) ?? null;
    },
  };
};
