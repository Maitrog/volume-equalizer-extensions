import { clampPointCount } from "../../domains/equalizer/equalizerMath";
import type { ShortcutMap } from "../../domains/shortcuts/shortcuts";
import { attachModalFocus } from "./modalFocus";
import { createShortcutSettingsView } from "./shortcutSettingsView";

type ThemeName = "dark" | "light";

const resolveTheme = (theme: unknown): ThemeName => (theme === "light" ? "light" : "dark");

const saveTextAsFile = (text: string, filename: string): void => {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
};

export const createSettingsView = (deps: {
  settingsModal: HTMLElement;
  settingsButton: HTMLElement;
  closeSettingsButton: HTMLElement;
  themeSelect: HTMLSelectElement;
  pointsCount: HTMLSelectElement;
  pointsResetModal: HTMLElement;
  pointsResetConfirm: HTMLButtonElement;
  pointsResetCancel: HTMLButtonElement;
  skipResetConfirm: HTMLInputElement;
  exportPresetsButton: HTMLButtonElement;
  importPresetsButton: HTMLButtonElement;
  importInput: HTMLInputElement;
  enableSpectrum: HTMLInputElement;
  enableVolumeCompensation: HTMLInputElement;
  hideDefaultPresets: HTMLInputElement;
  languageSelect: HTMLSelectElement;
  shortcutMute: HTMLInputElement;
  shortcutToggleEq: HTMLInputElement;
  shortcutsError: HTMLElement;
  localization: {
    getMessage(messageName: string): string;
    setLanguage(
      language: string,
      options?: {
        save?: boolean;
        refreshDynamicContent?: () => Promise<void>;
      },
    ): Promise<void>;
  };
  loadSettings(): Promise<{
    theme: ThemeName;
    pointCount: number;
    shortcuts: ShortcutMap;
    enableSpectrum: boolean;
    enableVolumeCompensation: boolean;
    hideDefaultPresets: boolean;
  }>;
  loadPointCount(): Promise<number>;
  shouldSkipPointCountConfirmation(): Promise<boolean>;
  saveTheme(theme: ThemeName): Promise<void>;
  saveShortcuts(shortcuts: ShortcutMap): Promise<void>;
  savePointCount(count: number): Promise<void>;
  saveSkipPointCountConfirmation(skip: boolean): Promise<void>;
  saveSpectrumEnabled(enabled: boolean): Promise<void>;
  saveVolumeCompensationEnabled(enabled: boolean): Promise<void>;
  saveHideDefaultPresets(hidden: boolean): Promise<void>;
  importPresets(
    text: string,
  ): Promise<
    | { ok: true; namesAdded: string[]; presetNames: string[] }
    | { ok: false; error: "syntax" | "structure" | "name" | "filter" }
  >;
  exportPresets(): Promise<string>;
  addPresetToDropdown(name: string): void;
  initPoints(count: number): void;
  redraw(): void;
  saveCurrentFilters(): Promise<void>;
  refreshDynamicContent(): Promise<void>;
}) => {
  const settingsFocus = attachModalFocus(deps.settingsModal, deps.settingsButton);
  const pointsFocus = attachModalFocus(deps.pointsResetModal, deps.pointsCount);
  let pendingPointCount: number | null = null;
  const shortcuts = createShortcutSettingsView({
    muteInput: deps.shortcutMute,
    toggleEqInput: deps.shortcutToggleEq,
    error: deps.shortcutsError,
    getMessage: deps.localization.getMessage,
    saveShortcuts: deps.saveShortcuts,
  });

  const applyTheme = (theme: unknown): ThemeName => {
    const chosenTheme = resolveTheme(theme);
    document.documentElement.dataset.theme = chosenTheme;
    deps.themeSelect.value = chosenTheme;
    deps.redraw();
    return chosenTheme;
  };

  const setTheme = async (theme: unknown): Promise<void> => {
    const chosenTheme = resolveTheme(theme);
    await deps.saveTheme(chosenTheme);
    applyTheme(chosenTheme);
  };

  const updatePointCountSelect = (count: unknown): void => {
    deps.pointsCount.value = clampPointCount(Number.parseInt(String(count), 10)).toString();
  };

  const applyPointCountChange = async (newCount: number): Promise<void> => {
    await deps.savePointCount(newCount);
    deps.initPoints(newCount);
    deps.redraw();
    await deps.saveCurrentFilters();
  };

  const setPointCount = (count: unknown): Promise<void> =>
    applyPointCountChange(clampPointCount(Number.parseInt(String(count), 10)));
  const closePointsResetModal = (): void => pointsFocus.close();
  const resetPointCountSelect = async (): Promise<void> => {
    updatePointCountSelect(await deps.loadPointCount());
  };

  deps.settingsButton.addEventListener("click", () => settingsFocus.open());
  deps.closeSettingsButton.addEventListener("click", () => settingsFocus.close());
  window.addEventListener("click", (event) => {
    if (event.target === deps.settingsModal) settingsFocus.close();
  });
  deps.themeSelect.addEventListener("change", () => {
    void setTheme(deps.themeSelect.value).catch((error: unknown) => {
      console.error("Failed to save theme", { error });
    });
  });
  deps.pointsCount.addEventListener("change", () => {
    void (async () => {
      const newCount = clampPointCount(Number.parseInt(deps.pointsCount.value, 10));
      if (await deps.shouldSkipPointCountConfirmation()) {
        await applyPointCountChange(newCount);
        return;
      }
      pendingPointCount = newCount;
      deps.skipResetConfirm.checked = await deps.shouldSkipPointCountConfirmation();
      pointsFocus.open();
    })().catch((error: unknown) => {
      console.error("Failed to change equalizer point count", { error });
    });
  });
  deps.pointsResetModal.addEventListener("modal-closed", () => {
    if (pendingPointCount == null) return;
    pendingPointCount = null;
    void resetPointCountSelect().catch((error: unknown) => {
      console.error("Failed to restore equalizer point count", { error });
    });
  });
  deps.pointsResetConfirm.addEventListener("click", () => {
    void (async () => {
      await deps.saveSkipPointCountConfirmation(deps.skipResetConfirm.checked);
      if (pendingPointCount != null) await applyPointCountChange(pendingPointCount);
      pendingPointCount = null;
      closePointsResetModal();
    })().catch((error: unknown) => {
      console.error("Failed to confirm equalizer point count", { error });
    });
  });
  const cancelPointCountChange = (): void => {
    void resetPointCountSelect()
      .then(() => {
        pendingPointCount = null;
        closePointsResetModal();
      })
      .catch((error: unknown) => {
        console.error("Failed to cancel equalizer point count", { error });
      });
  };
  deps.pointsResetCancel.addEventListener("click", cancelPointCountChange);
  deps.pointsResetModal.addEventListener("click", (event) => {
    if (event.target === deps.pointsResetModal) cancelPointCountChange();
  });

  deps.exportPresetsButton.addEventListener("click", () => {
    void deps
      .exportPresets()
      .then((text) => {
        saveTextAsFile(text, "eq_toolkit_presets.json");
      })
      .catch((error: unknown) => {
        console.error("Failed to export presets", { error });
      });
  });
  deps.importPresetsButton.addEventListener("click", () => deps.importInput.click());
  deps.importInput.addEventListener("change", () => {
    const file = deps.importInput.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    const showImportError = (messageName: string): void => {
      alert(deps.localization.getMessage(messageName));
    };
    reader.onerror = () => {
      showImportError("preset_import_read_error");
      deps.importInput.value = "";
    };
    reader.onload = () => {
      void (async () => {
        try {
          if (typeof reader.result !== "string") {
            showImportError("preset_import_read_error");
            return;
          }
          const result = await deps.importPresets(reader.result);
          if (!result.ok) {
            showImportError(`preset_import_${result.error}_error`);
            return;
          }
          result.namesAdded.forEach((name) => deps.addPresetToDropdown(name));
          await deps.refreshDynamicContent();
        } catch (error) {
          showImportError("preset_import_save_error");
          console.error("Failed to import presets", { error });
        } finally {
          deps.importInput.value = "";
        }
      })();
    };
    reader.readAsText(file, "utf-8");
  });

  deps.enableSpectrum.addEventListener("change", () => {
    const enabled = deps.enableSpectrum.checked;
    void deps.saveSpectrumEnabled(enabled).catch((error: unknown) => {
      deps.enableSpectrum.checked = !enabled;
      console.error("Failed to save spectrum setting", { error });
    });
  });
  deps.enableVolumeCompensation.addEventListener("change", () => {
    const enabled = deps.enableVolumeCompensation.checked;
    void deps.saveVolumeCompensationEnabled(enabled).catch((error: unknown) => {
      deps.enableVolumeCompensation.checked = !enabled;
      console.error("Failed to save volume compensation setting", { error });
    });
  });
  deps.hideDefaultPresets.addEventListener("change", () => {
    const hidden = deps.hideDefaultPresets.checked;
    void deps
      .saveHideDefaultPresets(hidden)
      .then(deps.refreshDynamicContent)
      .catch((error: unknown) => {
        deps.hideDefaultPresets.checked = !hidden;
        console.error("Failed to save preset visibility", { error });
      });
  });
  deps.languageSelect.addEventListener("change", () => {
    void deps.localization.setLanguage(deps.languageSelect.value, {
      save: true,
      refreshDynamicContent: deps.refreshDynamicContent,
    });
  });

  return {
    init: async () => {
      const stored = await deps.loadSettings();
      applyTheme(stored.theme);
      updatePointCountSelect(stored.pointCount);
      deps.hideDefaultPresets.checked = stored.hideDefaultPresets;
      deps.enableSpectrum.checked = stored.enableSpectrum;
      deps.enableVolumeCompensation.checked = stored.enableVolumeCompensation;
      shortcuts.setShortcuts(stored.shortcuts);
      return stored;
    },
    applyTheme,
    setTheme,
    setPointCount,
    updatePointCountSelect,
    getShortcutSettings: shortcuts.getShortcuts,
  };
};
