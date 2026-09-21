import { attachModalFocus } from "./modalFocus";
import { attachPresetDropdown } from "./presetDropdown";
import type { EqualizerFilter } from "../../domains/equalizer/types";
import { getAvailablePresetNames, isDefaultPresetName } from "../../domains/presets/defaultPresets";

export const createPresetsView = (deps: {
  dropdown: HTMLElement;
  toggle: HTMLElement;
  menu: HTMLElement;
  saveButton: HTMLButtonElement;
  saveModal: HTMLDivElement;
  saveModalClose: HTMLButtonElement;
  saveForm: HTMLFormElement;
  nameInput: HTMLInputElement;
  saveError: HTMLDivElement;
  saveCancel: HTMLButtonElement;
  getMessage(messageName: string): string;
  getCurrentFilters(): EqualizerFilter[];
  savePreset(
    name: string,
  ): Promise<
    | { ok: true; name: string; presetNames: string[] }
    | { ok: false; reason: "missingTab" | "empty" | "reserved" | "duplicate" }
  >;
  deletePreset(
    name: string,
  ): Promise<{ ok: true; presetNames: string[] } | { ok: false; reason: "default" | "used" }>;
  selectPreset(name: string): Promise<EqualizerFilter[] | null>;
  setCurrentFilters(filters: EqualizerFilter[]): void;
  saveLoadedFilters(filters: EqualizerFilter[]): Promise<void>;
  redraw(): void;
}) => {
  const saveModalFocus = attachModalFocus(deps.saveModal, deps.saveButton);
  const dropdown = attachPresetDropdown(deps.dropdown, deps.toggle, deps.menu);

  const addPresetToDropdown = (name: string, options: { deletable?: boolean } = {}): void => {
    const option = document.createElement("div");
    const choice = document.createElement("button");
    choice.type = "button";
    choice.textContent = name;
    choice.className = "dropdown-item";
    choice.setAttribute("data-value", name);
    option.appendChild(choice);
    option.setAttribute("data-value", name);
    option.className = "dropdown-row";

    if (options.deletable ?? true) {
      const closeButton = document.createElement("button");
      closeButton.type = "button";
      closeButton.className = "close-btn";
      closeButton.setAttribute("aria-label", `${deps.getMessage("delete")}: ${name}`);
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
    Array.from(deps.menu.querySelectorAll(".dropdown-row")).forEach((item) => {
      if (item.getAttribute("data-value") !== "none") item.remove();
    });

    getAvailablePresetNames(userPresetNames, options).forEach((name) => {
      addPresetToDropdown(name, { deletable: !isDefaultPresetName(name) });
    });
  };

  const closeSaveModal = (): void => {
    saveModalFocus.close();
  };

  deps.saveButton.addEventListener("click", () => {
    deps.nameInput.value = "";
    deps.saveError.textContent = "";
    saveModalFocus.open();
    deps.nameInput.focus();
  });

  deps.saveModalClose.addEventListener("click", closeSaveModal);
  deps.saveCancel.addEventListener("click", closeSaveModal);
  deps.saveModal.addEventListener("click", (event) => {
    if (event.target === deps.saveModal) closeSaveModal();
  });
  deps.nameInput.addEventListener("input", () => {
    deps.saveError.textContent = "";
  });

  deps.saveForm.addEventListener("submit", (event) => {
    event.preventDefault();
    void (async () => {
      const result = await deps.savePreset(deps.nameInput.value);
      if (!result.ok) {
        if (result.reason === "missingTab") return;
        deps.saveError.textContent = deps.getMessage(`preset_name_${result.reason}_error`);
        deps.saveError.style.display = "block";
        return;
      }
      addPresetToDropdown(result.name);
      closeSaveModal();
    })().catch((error: unknown) => {
      console.error("Failed to save preset", { error });
    });
  });

  deps.menu.addEventListener("click", (event) => {
    void (async () => {
      if (!(event.target instanceof HTMLElement)) return;

      const choice = event.target.getAttribute("data-value");
      if (!choice) return;

      if (choice === "none") {
        deps.toggle.textContent = deps.getMessage("empty_preset_name");
        dropdown.close(true);
        return;
      }

      if (event.target.classList.contains("close-btn")) {
        const result = await deps.deletePreset(choice);
        if (!result.ok && result.reason === "used") {
          alert(deps.getMessage("preset_delete_error"));
          return;
        }
        if (!result.ok) return;

        const row = event.target.parentElement;
        const nextAction =
          row?.nextElementSibling?.querySelector<HTMLElement>("button") ??
          row?.previousElementSibling?.querySelector<HTMLElement>("button") ??
          deps.toggle;
        row?.remove();
        nextAction.focus();
        return;
      }

      if (!event.target.classList.contains("dropdown-item")) return;

      const filters = await deps.selectPreset(choice);
      if (!filters) return;

      deps.toggle.textContent = choice;
      deps.setCurrentFilters(filters);
      await deps.saveLoadedFilters(deps.getCurrentFilters());
      deps.redraw();
      dropdown.close(true);
    })().catch((error: unknown) => {
      console.error("Failed to update preset selection", { error });
    });
  });

  return {
    addPresetToDropdown,
    renderPresetNames,
  };
};
