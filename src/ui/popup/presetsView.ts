import { isPresetUsedInWhitelist } from "../../domains/autostart/autostartRules";
import type { EqualizerPersistedFilter } from "../../domains/equalizer/equalizerState";
import { STORAGE_KEYS } from "../../infrastructure/chrome/storageKeys";

export interface PresetsView {
  addPresetToDropdown(name: string): void;
}

type PresetStorage = Record<string, EqualizerPersistedFilter[] | undefined>;

export const createPresetsView = (deps: {
  dropdown: HTMLElement;
  toggle: HTMLElement;
  menu: HTMLElement;
  nameInput: HTMLInputElement;
  saveButton: HTMLButtonElement;
  isToolkitWindow: boolean;
  getMessage(messageName: string): string;
  getCurrentTabId(): Promise<number | null>;
  getCurrentFilters(): EqualizerPersistedFilter[];
  setCurrentFilters(filters: EqualizerPersistedFilter[]): void;
  saveLoadedFilters(filters: EqualizerPersistedFilter[]): Promise<void>;
  redraw(): void;
  refreshToolkitCaptureFilters(): void;
}): PresetsView => {
  const addPresetToDropdown = (name: string): void => {
    const option = document.createElement("div");
    option.textContent = name;
    option.setAttribute("data-value", name);
    option.className = "dropdown-item";

    const closeButton = document.createElement("span");
    closeButton.className = "close-btn";
    closeButton.textContent = "\u00d7";
    closeButton.setAttribute("data-value", name);
    option.appendChild(closeButton);

    deps.menu.appendChild(option);
  };

  deps.saveButton.addEventListener("click", () => {
    void (async () => {
      const name = deps.nameInput.value;
      if (name.length === 0) return;

      const tabId = await deps.getCurrentTabId();
      if (tabId == null) return;

      const prefs = await chrome.storage.local.get([
        STORAGE_KEYS.tabFilters(tabId),
        STORAGE_KEYS.PRESETS,
        STORAGE_KEYS.PRESET_NAMES,
      ]);
      const presets = (prefs[STORAGE_KEYS.PRESETS] ?? {}) as PresetStorage;
      const presetNames = [...((prefs[STORAGE_KEYS.PRESET_NAMES] ?? []) as string[])];
      presets[name] =
        (prefs[STORAGE_KEYS.tabFilters(tabId)] as EqualizerPersistedFilter[]) ??
        deps.getCurrentFilters();

      const needAdd = !presetNames.includes(name);
      if (needAdd) presetNames.push(name);

      await chrome.storage.local.set({
        [STORAGE_KEYS.PRESETS]: presets,
        [STORAGE_KEYS.PRESET_NAMES]: presetNames,
      });
      if (needAdd) addPresetToDropdown(name);
      deps.nameInput.value = "";
    })();
  });

  deps.toggle.addEventListener("click", () => {
    deps.menu.style.display = deps.menu.style.display === "block" ? "none" : "block";
  });

  document.addEventListener("click", (event) => {
    if (!(event.target instanceof Node)) return;
    if (!deps.dropdown.contains(event.target)) deps.menu.style.display = "none";
  });

  deps.menu.addEventListener("click", (event) => {
    void (async () => {
      if (!(event.target instanceof HTMLElement)) return;

      const choice = event.target.getAttribute("data-value");
      if (!choice) return;

      if (choice === "none") {
        deps.toggle.textContent = deps.getMessage("empty_preset_name");
        deps.menu.style.display = "none";
        return;
      }

      if (event.target.classList.contains("close-btn")) {
        const prefs = await chrome.storage.local.get([
          STORAGE_KEYS.PRESETS,
          STORAGE_KEYS.PRESET_NAMES,
          STORAGE_KEYS.AUTOSTART_RULES,
        ]);

        if (isPresetUsedInWhitelist(prefs[STORAGE_KEYS.AUTOSTART_RULES], choice)) {
          alert(deps.getMessage("preset_delete_error"));
          return;
        }

        event.target.parentElement?.remove();
        const presets = (prefs[STORAGE_KEYS.PRESETS] ?? {}) as PresetStorage;
        const presetNames = ((prefs[STORAGE_KEYS.PRESET_NAMES] ?? []) as string[]).filter(
          (name) => name !== choice,
        );
        delete presets[choice];

        await chrome.storage.local.set({
          [STORAGE_KEYS.PRESETS]: presets,
          [STORAGE_KEYS.PRESET_NAMES]: presetNames,
        });
        return;
      }

      if (!event.target.classList.contains("dropdown-item")) return;

      deps.toggle.textContent =
        choice === "none" ? deps.getMessage("empty_preset_name") : choice;
      const prefs = await chrome.storage.local.get([STORAGE_KEYS.PRESETS]);
      const presets = prefs[STORAGE_KEYS.PRESETS] as PresetStorage | undefined;
      const filters = presets?.[choice];
      if (!filters) return;

      deps.setCurrentFilters(filters);
      await deps.saveLoadedFilters(deps.getCurrentFilters());
      deps.redraw();
      deps.refreshToolkitCaptureFilters();
      deps.menu.style.display = "none";
    })();
  });

  return {
    addPresetToDropdown,
  };
};
