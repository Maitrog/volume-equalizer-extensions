import {
  getWhitelistDomain,
  normalizeWhitelistUrl,
  type AutostartWhitelistEntry,
} from "../../domains/autostart/autostartRules";
import { attachModalFocus } from "./modalFocus";

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
  getMessage(messageName: string): string;
  getActiveTab(): Promise<{ url?: string } | null>;
  loadRules(): Promise<AutostartWhitelistEntry[]>;
  loadPresetNames(): Promise<string[]>;
  addRule(
    type: string | undefined,
    value: string | undefined,
    presetName: string,
  ): Promise<{ ok: true; entries: AutostartWhitelistEntry[] } | { ok: false }>;
  removeRule(id: string): Promise<AutostartWhitelistEntry[]>;
}) => {
  const modalFocus = attachModalFocus(deps.modal, deps.addToWhitelistButton);
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
    emptyOption.textContent = deps.getMessage("autostart_settings_select_preset_placeholder");
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
    const presetNames = await deps.loadPresetNames();
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

  const renderWhitelist = async (resolvedEntries?: AutostartWhitelistEntry[]): Promise<void> => {
    const entries = resolvedEntries ?? (await deps.loadRules());
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
      preset.textContent = `${deps.getMessage("autostart_modal_preset_label")}: ${entry.presetName}`;
      text.append(value, preset);
      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "whitelist-delete";
      deleteButton.textContent = "\u00d7";
      deleteButton.setAttribute("aria-label", deps.getMessage("delete"));
      deleteButton.addEventListener("click", () => {
        void deps
          .removeRule(entry.id)
          .then(async (nextEntries) => {
            await renderWhitelist(nextEntries);
            await refreshPresetSelects();
          })
          .catch((error: unknown) => {
            console.error("Failed to remove autostart rule", { id: entry.id, error });
          });
      });
      item.append(text, deleteButton);
      deps.settingsList.appendChild(item);
    });
  };

  const saveWhitelistEntry = async (
    type: string | undefined,
    value: string | undefined,
    presetName: string,
    errorElement: HTMLElement,
  ): Promise<boolean> => {
    const result = await deps.addRule(type, value, presetName);
    if (!result.ok) {
      setError(errorElement, "autostart_validation_error");
      return false;
    }
    setError(errorElement, "");
    await renderWhitelist(result.entries);
    await refreshPresetSelects();
    return true;
  };

  const closeModal = (): void => modalFocus.close();

  deps.addToWhitelistButton.addEventListener("click", () => {
    void (async () => {
      const tab = await deps.getActiveTab();
      deps.modalDomainValue.textContent = getWhitelistDomain(tab?.url ?? "");
      deps.modalUrlValue.textContent = normalizeWhitelistUrl(tab?.url ?? "");
      await refreshPresetSelects();
      setError(deps.modalError, "");
      modalFocus.open();
    })();
  });
  deps.closeButton.addEventListener("click", closeModal);
  deps.cancelButton.addEventListener("click", closeModal);
  deps.modal.addEventListener("click", (event) => {
    if (event.target === deps.modal) closeModal();
  });
  deps.confirmButton.addEventListener("click", () => {
    void (async () => {
      const tab = await deps.getActiveTab();
      const selectedType = deps.modal.querySelector<HTMLInputElement>(
        "input[name='autostart-modal-add-type']:checked",
      )?.value;
      try {
        if (
          await saveWhitelistEntry(selectedType, tab?.url, deps.modalPreset.value, deps.modalError)
        )
          closeModal();
      } catch (error) {
        console.error("Failed to add autostart rule", { error });
      }
    })();
  });
  deps.settingsAddButton.addEventListener("click", () => {
    void (async () => {
      try {
        if (
          await saveWhitelistEntry(
            deps.settingsType.value,
            deps.settingsAddValue.value,
            deps.settingsAddPreset.value,
            deps.settingsError,
          )
        )
          deps.settingsAddValue.value = "";
      } catch (error) {
        console.error("Failed to add autostart rule", { error });
      }
    })();
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
