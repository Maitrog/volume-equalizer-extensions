import { isPresetUsedInWhitelist } from "../../domains/autostart/autostartRules";
import type { EqualizerPersistedFilter } from "../../domains/equalizer/equalizerState";
import {
  getAvailablePresetNames,
  isDefaultPresetName,
  resolvePresetFilters,
  type PresetStorage,
} from "../../domains/presets/defaultPresets";
import { validatePresetName } from "../../domains/presets/presetNameValidation";
import { STORAGE_KEYS } from "../../infrastructure/chrome/storageKeys";

export const createPresetsView = (deps: {
  dropdown: HTMLElement;
  toggle: HTMLElement;
  menu: HTMLElement;
  saveButton: HTMLButtonElement;
  saveModal: HTMLDivElement;
  saveModalClose: HTMLSpanElement;
  saveForm: HTMLFormElement;
  nameInput: HTMLInputElement;
  saveError: HTMLDivElement;
  saveCancel: HTMLButtonElement;
  isToolkitWindow: boolean;
  getMessage(messageName: string): string;
  getCurrentTabId(): Promise<number | null>;
  getCurrentFilters(): EqualizerPersistedFilter[];
  setCurrentFilters(filters: EqualizerPersistedFilter[]): void;
  saveLoadedFilters(filters: EqualizerPersistedFilter[]): Promise<void>;
  redraw(): void;
  refreshToolkitCaptureFilters(): void;
}) => {
  const addPresetToDropdown = (
    name: string,
    options: { deletable?: boolean } = {},
  ): void => {
    const option = document.createElement("div");
    option.textContent = name;
    option.setAttribute("data-value", name);
    option.className = "dropdown-item";

    if (options.deletable ?? true) {
      const closeButton = document.createElement("span");
      closeButton.className = "close-btn";
      closeButton.textContent = "\u00d7";
      closeButton.setAttribute("data-value", name);
      option.appendChild(closeButton);
    }

    deps.menu.appendChild(option);
  };

  const renderPresetNames = (
    userPresetNames: string[],
    options: { includeDefaultPresets?: boolean } = {},
  ): void => {
    Array.from(deps.menu.querySelectorAll(".dropdown-item")).forEach((item) => {
      if (item.getAttribute("data-value") !== "none") item.remove();
    });

    getAvailablePresetNames(userPresetNames, options).forEach((name) => {
      addPresetToDropdown(name, { deletable: !isDefaultPresetName(name) });
    });
  };

  const closeSaveModal = (): void => {
    deps.saveModal.style.display = "none";
    deps.saveButton.focus();
  };

  deps.saveButton.addEventListener("click", () => {
    deps.nameInput.value = "";
    deps.saveError.textContent = "";
    deps.saveModal.style.display = "block";
    deps.nameInput.focus();
  });

  deps.saveModalClose.addEventListener("click", closeSaveModal);
  deps.saveCancel.addEventListener("click", closeSaveModal);
  deps.saveModal.addEventListener("click", (event) => {
    if (event.target === deps.saveModal) closeSaveModal();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && deps.saveModal.style.display === "block") {
      closeSaveModal();
    }
  });
  deps.nameInput.addEventListener("input", () => {
    deps.saveError.textContent = "";
  });

  deps.saveForm.addEventListener("submit", (event) => {
    event.preventDefault();
    void (async () => {
      const tabId = await deps.getCurrentTabId();
      if (tabId == null) return;

      const prefs = await chrome.storage.local.get([
        STORAGE_KEYS.tabFilters(tabId),
        STORAGE_KEYS.PRESETS,
        STORAGE_KEYS.PRESET_NAMES,
      ]);
      const presets = (prefs[STORAGE_KEYS.PRESETS] ?? {}) as PresetStorage;
      const presetNames = [...((prefs[STORAGE_KEYS.PRESET_NAMES] ?? []) as string[])];
      const validation = validatePresetName(deps.nameInput.value, presetNames);
      if (validation.kind === "error") {
        deps.saveError.textContent = deps.getMessage(`preset_name_${validation.reason}_error`);
        deps.saveError.style.display = "block";
        return;
      }

      const { name } = validation;
      presets[name] =
        (prefs[STORAGE_KEYS.tabFilters(tabId)] as EqualizerPersistedFilter[]) ??
        deps.getCurrentFilters();
      presetNames.push(name);

      await chrome.storage.local.set({
        [STORAGE_KEYS.PRESETS]: presets,
        [STORAGE_KEYS.PRESET_NAMES]: presetNames,
      });
      addPresetToDropdown(name);
      closeSaveModal();
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
        if (isDefaultPresetName(choice)) return;

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
      const filters = resolvePresetFilters(choice, presets);
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
    renderPresetNames,
  };
};
