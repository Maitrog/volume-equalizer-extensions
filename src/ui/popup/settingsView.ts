import { clampPointCount } from "../../domains/equalizer/equalizerMath";
import { type LocalizationService } from "../../domains/localization/localizationService";
import {
  formatShortcut,
  isModifierShortcutKey,
  normalizeShortcutFromKeyboardEvent,
  SHORTCUT_ACTION_MUTE_NAME,
  SHORTCUT_ACTION_TOGGLE_EQ_NAME,
  resolveShortcuts,
  type Shortcut,
  type ShortcutActionName,
  type ShortcutMap,
  validateShortcutConfig,
} from "../../domains/shortcuts/shortcuts";
import { isDefaultPresetName } from "../../domains/presets/defaultPresets";
import { STORAGE_KEYS } from "../../infrastructure/chrome/storageKeys";

type ThemeName = "dark" | "light";

const DEFAULT_THEME: ThemeName = "dark";

export interface SettingsView {
  init(): Promise<void>;
  applyTheme(theme: unknown): ThemeName;
  updatePointCountSelect(count: unknown): void;
  getShortcutSettings(): ShortcutMap;
}

const isThemeName = (theme: unknown): theme is ThemeName => {
  return theme === "dark" || theme === "light";
};

const saveTextAsFile = (text: string, filename = "file.txt"): void => {
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
  hideDefaultPresets: HTMLInputElement;
  languageSelect: HTMLSelectElement;
  shortcutMute: HTMLInputElement;
  shortcutToggleEq: HTMLInputElement;
  shortcutsError: HTMLElement;
  localization: LocalizationService;
  addPresetToDropdown(name: string): void;
  initPoints(count: number): void;
  redraw(): void;
  refreshToolkitCaptureFilters(): void;
  saveCurrentFilters(): Promise<void>;
  refreshDynamicContent(): Promise<void>;
}): SettingsView => {
  let pendingPointCount: number | null = null;
  let shortcutSettings: ShortcutMap = resolveShortcuts(null);

  const applyTheme = (theme: unknown): ThemeName => {
    const chosenTheme = isThemeName(theme) ? theme : DEFAULT_THEME;
    document.documentElement.dataset.theme = chosenTheme;
    deps.themeSelect.value = chosenTheme;
    deps.redraw();
    return chosenTheme;
  };

  const saveTheme = (theme: ThemeName): Promise<void> => {
    return chrome.storage.local.set({ [STORAGE_KEYS.THEME]: theme });
  };

  const shouldSkipPointsResetConfirm = async (): Promise<boolean> => {
    const result = await chrome.storage.local.get([STORAGE_KEYS.SKIP_POINTS_CONFIRM]);
    return (
      result[STORAGE_KEYS.SKIP_POINTS_CONFIRM] === "true" ||
      result[STORAGE_KEYS.SKIP_POINTS_CONFIRM] === true
    );
  };

  const setSkipPointsResetConfirm = (value: boolean): Promise<void> => {
    return chrome.storage.local.set({
      [STORAGE_KEYS.SKIP_POINTS_CONFIRM]: Boolean(value),
    });
  };

  const updatePointCountSelect = (count: unknown): void => {
    deps.pointsCount.value = clampPointCount(Number.parseInt(String(count), 10)).toString();
  };

  const applyPointCountChange = async (newCount: number): Promise<void> => {
    await chrome.storage.local.set({ [STORAGE_KEYS.POINT_COUNT]: newCount });
    deps.initPoints(newCount);
    deps.redraw();
    deps.refreshToolkitCaptureFilters();
    await deps.saveCurrentFilters();
  };

  const closePointsResetModal = (): void => {
    deps.pointsResetModal.style.display = "none";
  };

  const resetPointCountSelectFromStorage = async (): Promise<void> => {
    const result = await chrome.storage.local.get([STORAGE_KEYS.POINT_COUNT]);
    updatePointCountSelect(result[STORAGE_KEYS.POINT_COUNT]);
  };

  const setShortcutsError = (messageName: string | null): void => {
    if (!messageName) {
      deps.shortcutsError.style.display = "none";
      deps.shortcutsError.textContent = "";
      return;
    }

    deps.shortcutsError.textContent = deps.localization.getMessage(messageName);
    deps.shortcutsError.style.display = "block";
  };

  const shortcutInputs: Record<ShortcutActionName, HTMLInputElement> = {
    [SHORTCUT_ACTION_MUTE_NAME]: deps.shortcutMute,
    [SHORTCUT_ACTION_TOGGLE_EQ_NAME]: deps.shortcutToggleEq,
  };

  const renderShortcutInputs = (
    invalidAction: ShortcutActionName | null = null,
  ): void => {
    Object.entries(shortcutInputs).forEach(([action, input]) => {
      input.value = formatShortcut(
        shortcutSettings[action as ShortcutActionName],
      );
      input.classList.toggle("invalid", action === invalidAction);
    });
  };

  const startShortcutEdit = (input: HTMLInputElement): void => {
    input.value = "?";
    input.classList.remove("invalid");
    setShortcutsError(null);
  };

  const saveShortcut = async (
    action: ShortcutActionName,
    shortcut: Shortcut,
  ): Promise<boolean> => {
    const nextShortcuts = {
      ...shortcutSettings,
      [action]: shortcut,
    };
    const validationError = validateShortcutConfig(nextShortcuts);

    if (validationError) {
      const messageName =
        validationError === "duplicate"
          ? "shortcut_duplicate_error"
          : "shortcut_validation_error";
      setShortcutsError(messageName);
      renderShortcutInputs(action);
      return false;
    }

    shortcutSettings = resolveShortcuts(nextShortcuts);
    await chrome.storage.local.set({
      [STORAGE_KEYS.SHORTCUTS]: shortcutSettings,
    });
    setShortcutsError(null);
    renderShortcutInputs();
    return true;
  };

  deps.settingsButton.addEventListener("click", () => {
    deps.settingsModal.style.display = "block";
  });

  deps.closeSettingsButton.addEventListener("click", () => {
    deps.settingsModal.style.display = "none";
  });

  window.addEventListener("click", (event) => {
    if (event.target === deps.settingsModal) {
      deps.settingsModal.style.display = "none";
    }
  });

  deps.themeSelect.addEventListener("change", () => {
    const theme = applyTheme(deps.themeSelect.value);
    void saveTheme(theme);
  });

  deps.pointsCount.addEventListener("change", () => {
    void (async () => {
      const newCount = clampPointCount(Number.parseInt(deps.pointsCount.value, 10));
      if (Number.isNaN(newCount)) return;

      if (await shouldSkipPointsResetConfirm()) {
        await applyPointCountChange(newCount);
        return;
      }

      pendingPointCount = newCount;
      deps.skipResetConfirm.checked = await shouldSkipPointsResetConfirm();
      deps.pointsResetModal.style.display = "block";
    })();
  });

  deps.pointsResetConfirm.addEventListener("click", () => {
    void (async () => {
      await setSkipPointsResetConfirm(deps.skipResetConfirm.checked);
      if (pendingPointCount != null) {
        await applyPointCountChange(pendingPointCount);
      }
      pendingPointCount = null;
      closePointsResetModal();
    })();
  });

  deps.pointsResetCancel.addEventListener("click", () => {
    void (async () => {
      await resetPointCountSelectFromStorage();
      pendingPointCount = null;
      closePointsResetModal();
    })();
  });

  deps.pointsResetModal.addEventListener("click", (event) => {
    void (async () => {
      if (event.target !== deps.pointsResetModal) return;

      await resetPointCountSelectFromStorage();
      pendingPointCount = null;
      closePointsResetModal();
    })();
  });

  deps.exportPresetsButton.addEventListener("click", () => {
    void (async () => {
      const result = await chrome.storage.local.get([
        STORAGE_KEYS.PRESETS,
        STORAGE_KEYS.PRESET_NAMES,
      ]);
      saveTextAsFile(JSON.stringify(result), "eq_toolkit_presets.json");
    })();
  });

  deps.importPresetsButton.addEventListener("click", () => {
    deps.importInput.click();
  });

  deps.importInput.addEventListener("change", () => {
    const file = deps.importInput.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      void (async () => {
        if (typeof reader.result !== "string") return;

        const presetsInfo = JSON.parse(reader.result) as {
          presets?: Record<string, unknown>;
          presetNames?: string[];
        };
        const prefs = await chrome.storage.local.get([
          STORAGE_KEYS.PRESETS,
          STORAGE_KEYS.PRESET_NAMES,
        ]);
        const presets = (prefs[STORAGE_KEYS.PRESETS] ?? {}) as Record<string, unknown>;
        const presetNames = [...((prefs[STORAGE_KEYS.PRESET_NAMES] ?? []) as string[])];

        (presetsInfo.presetNames ?? []).forEach((name) => {
          if (isDefaultPresetName(name)) return;

          const needAdd = !presetNames.includes(name);
          if (!needAdd) return;

          presetNames.push(name);
          deps.addPresetToDropdown(name);
          presets[name] = presetsInfo.presets?.[name];
        });

        await chrome.storage.local.set({
          [STORAGE_KEYS.PRESETS]: presets,
          [STORAGE_KEYS.PRESET_NAMES]: presetNames,
        });
      })();
    };
    reader.readAsText(file, "utf-8");
  });

  deps.enableSpectrum.addEventListener("change", () => {
    void chrome.storage.local.set({
      [STORAGE_KEYS.ENABLE_SPECTRUM]: deps.enableSpectrum.checked,
    });
  });

  deps.hideDefaultPresets.addEventListener("change", () => {
    void (async () => {
      await chrome.storage.local.set({
        [STORAGE_KEYS.HIDE_DEFAULT_PRESETS]: deps.hideDefaultPresets.checked,
      });
      await deps.refreshDynamicContent();
    })();
  });

  deps.languageSelect.addEventListener("change", () => {
    void deps.localization.setLanguage(deps.languageSelect.value, {
      save: true,
      refreshDynamicContent: deps.refreshDynamicContent,
    });
  });

  Object.entries(shortcutInputs).forEach(([action, input]) => {
    const shortcutAction = action as ShortcutActionName;

    input.addEventListener("focus", () => {
      startShortcutEdit(input);
    });

    input.addEventListener("blur", () => {
      setShortcutsError(null);
      renderShortcutInputs();
    });

    input.addEventListener("keydown", (event) => {
      void (async () => {
        event.preventDefault();
        event.stopPropagation();

        if (isModifierShortcutKey(event.key)) return;

        const shortcut = normalizeShortcutFromKeyboardEvent(event);
        if (!shortcut) {
          setShortcutsError("shortcut_validation_error");
          input.classList.add("invalid");
          return;
        }

        const saved = await saveShortcut(shortcutAction, shortcut);
        if (!saved) input.value = "?";
      })();
    });
  });

  return {
    init: async () => {
      const stored = await chrome.storage.local.get([
        STORAGE_KEYS.SHORTCUTS,
        STORAGE_KEYS.HIDE_DEFAULT_PRESETS,
      ]);
      deps.hideDefaultPresets.checked =
        stored[STORAGE_KEYS.HIDE_DEFAULT_PRESETS] === true;
      shortcutSettings = resolveShortcuts(
        stored[STORAGE_KEYS.SHORTCUTS] as Partial<ShortcutMap>,
      );
      renderShortcutInputs();
    },
    applyTheme,
    updatePointCountSelect,
    getShortcutSettings: () => shortcutSettings,
  };
};
