import {
  createWhitelistEntry,
  getWhitelistDomain,
  normalizeWhitelistUrl,
  type AutostartEntryType,
  type AutostartWhitelistEntry,
} from "../../domains/autostart/autostartRules";
import { STORAGE_KEYS } from "../../infrastructure/chrome/storageKeys";

export interface AutostartView {
  init(): Promise<void>;
  refreshPresetSelects(): Promise<void>;
  renderWhitelist(): Promise<void>;
}

const getActiveTab = async (): Promise<chrome.tabs.Tab | null> => {
  const [tab] = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true,
  });
  return tab ?? null;
};

export const createAutostartView = (deps: {
  addToWhitelistButton: HTMLElement;
  modal: HTMLElement;
  closeButton: HTMLElement;
  cancelButton: HTMLButtonElement;
  confirmButton: HTMLButtonElement;
  modalPreset: HTMLSelectElement;
  modalError: HTMLElement;
  modalDomainValue: HTMLElement;
  modalUrlValue: HTMLElement;
  settingsList: HTMLElement;
  settingsType: HTMLSelectElement;
  settingsAddValue: HTMLInputElement;
  settingsAddPreset: HTMLSelectElement;
  settingsAddButton: HTMLButtonElement;
  settingsError: HTMLElement;
  isToolkitWindow: boolean;
  getMessage(messageName: string): string;
}): AutostartView => {
  const setError = (element: HTMLElement, messageName: string): void => {
    element.textContent = messageName ? deps.getMessage(messageName) : "";
    element.style.display = messageName ? "block" : "none";
  };

  const fillPresetSelect = (
    select: HTMLSelectElement,
    presetNames: string[],
    selectedName = "",
  ): void => {
    select.textContent = "";

    const emptyOption = document.createElement("option");
    emptyOption.value = "";
    emptyOption.textContent = deps.getMessage(
      "autostart_settings_select_preset_placeholder",
    );
    select.appendChild(emptyOption);

    presetNames.forEach((name) => {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      select.appendChild(option);
    });

    select.value = selectedName;
  };

  const refreshPresetSelects = async (): Promise<void> => {
    const stored = await chrome.storage.local.get([STORAGE_KEYS.PRESET_NAMES]);
    const presetNames = (stored[STORAGE_KEYS.PRESET_NAMES] ?? []) as string[];
    fillPresetSelect(deps.modalPreset, presetNames);
    fillPresetSelect(deps.settingsAddPreset, presetNames);
  };

  const formatWhitelistEntry = (entry: AutostartWhitelistEntry): string => {
    const typeLabel =
      entry.type === "url"
        ? deps.getMessage("autostart_rule_type_url_label")
        : deps.getMessage("autostart_rule_type_domain_label");
    return `${typeLabel}: ${entry.value}`;
  };

  const saveWhitelistEntry = async (
    type: string | undefined,
    value: string | undefined,
    presetName: string,
    errorElement: HTMLElement,
  ): Promise<boolean> => {
    const entry = createWhitelistEntry(
      type as AutostartEntryType,
      value ?? "",
      presetName,
    );
    if (!entry) {
      setError(errorElement, "autostart_validation_error");
      return false;
    }

    const stored = await chrome.storage.local.get([STORAGE_KEYS.AUTOSTART_RULES]);
    const entries = ((stored[STORAGE_KEYS.AUTOSTART_RULES] ?? []) as AutostartWhitelistEntry[])
      .filter((item) => item.id !== entry.id);
    entries.push(entry);
    await chrome.storage.local.set({ [STORAGE_KEYS.AUTOSTART_RULES]: entries });
    setError(errorElement, "");
    return true;
  };

  const removeWhitelistEntry = async (id: string): Promise<void> => {
    const stored = await chrome.storage.local.get([STORAGE_KEYS.AUTOSTART_RULES]);
    const entries = ((stored[STORAGE_KEYS.AUTOSTART_RULES] ?? []) as AutostartWhitelistEntry[])
      .filter((entry) => entry.id !== id);
    await chrome.storage.local.set({ [STORAGE_KEYS.AUTOSTART_RULES]: entries });
  };

  const renderWhitelist = async (): Promise<void> => {
    const stored = await chrome.storage.local.get([STORAGE_KEYS.AUTOSTART_RULES]);
    const entries = (stored[STORAGE_KEYS.AUTOSTART_RULES] ?? []) as AutostartWhitelistEntry[];
    deps.settingsList.textContent = "";

    if (entries.length === 0) {
      const empty = document.createElement("div");
      empty.id = "whitelist-empty";
      empty.className = "whitelist-empty";
      empty.textContent = deps.getMessage("autostart_whitelist_empty");
      deps.settingsList.appendChild(empty);
      return;
    }

    entries.forEach((entry) => {
      const item = document.createElement("div");
      item.className = "whitelist-item";

      const text = document.createElement("div");
      text.className = "whitelist-item-text";

      const value = document.createElement("span");
      value.textContent = formatWhitelistEntry(entry);

      const preset = document.createElement("small");
      preset.textContent = `${deps.getMessage("autostart_modal_preset_label")}: ${
        entry.presetName
      }`;

      text.append(value, preset);

      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "whitelist-delete";
      deleteButton.textContent = "\u00d7";
      deleteButton.setAttribute("aria-label", deps.getMessage("delete"));
      deleteButton.addEventListener("click", () => {
        void removeWhitelistEntry(entry.id);
      });

      item.append(text, deleteButton);
      deps.settingsList.appendChild(item);
    });
  };

  const closeModal = (): void => {
    deps.modal.style.display = "none";
  };

  deps.addToWhitelistButton.addEventListener("click", () => {
    void (async () => {
      if (deps.isToolkitWindow) return;

      const tab = await getActiveTab();
      deps.modalDomainValue.textContent = getWhitelistDomain(tab?.url ?? "");
      deps.modalUrlValue.textContent = normalizeWhitelistUrl(tab?.url ?? "");
      await refreshPresetSelects();
      setError(deps.modalError, "");
      deps.modal.style.display = "block";
    })();
  });

  deps.closeButton.addEventListener("click", closeModal);
  deps.cancelButton.addEventListener("click", closeModal);
  deps.modal.addEventListener("click", (event) => {
    if (event.target === deps.modal) closeModal();
  });

  deps.confirmButton.addEventListener("click", () => {
    void (async () => {
      const tab = await getActiveTab();
      const selectedType = deps.modal.querySelector<HTMLInputElement>(
        "input[name='autostart-modal-add-type']:checked",
      )?.value;
      const saved = await saveWhitelistEntry(
        selectedType,
        tab?.url,
        deps.modalPreset.value,
        deps.modalError,
      );
      if (saved) closeModal();
    })();
  });

  deps.settingsAddButton.addEventListener("click", () => {
    void (async () => {
      const saved = await saveWhitelistEntry(
        deps.settingsType.value,
        deps.settingsAddValue.value,
        deps.settingsAddPreset.value,
        deps.settingsError,
      );
      if (saved) deps.settingsAddValue.value = "";
    })();
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;
    if (changes[STORAGE_KEYS.AUTOSTART_RULES]) void renderWhitelist();
    if (changes[STORAGE_KEYS.PRESET_NAMES]) void refreshPresetSelects();
  });

  return {
    init: async () => {
      await refreshPresetSelects();
      await renderWhitelist();
    },
    refreshPresetSelects,
    renderWhitelist,
  };
};
