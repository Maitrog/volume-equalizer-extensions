import { clampPointCount } from "../../domains/equalizer/equalizerMath";
import type { AvailableLanguageCode } from "../../domains/localization/languages";
import type { ResolvedSettings } from "../../domains/settings/settingsTransfer";
import type { ShortcutMap } from "../../domains/shortcuts/shortcuts";
import { attachModalFocus } from "./modalFocus";
import { createShortcutSettingsView } from "./shortcutSettingsView";

type ThemeName = "dark" | "light";

const resolveTheme = (theme: unknown): ThemeName => (theme === "light" ? "light" : "dark");

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
  enableSpectrum: HTMLInputElement;
  enableVolumeCompensation: HTMLInputElement;
  hideDefaultPresets: HTMLInputElement;
  languageSelect: HTMLSelectElement;
  shortcutMute: HTMLInputElement;
  shortcutToggleEq: HTMLInputElement;
  shortcutsError: HTMLElement;
  localization: {
    getMessage(messageName: string): string;
    waitForPendingChanges(): Promise<void>;
    applySavedLanguage(
      language: AvailableLanguageCode,
      isCurrent?: () => boolean,
    ): Promise<boolean>;
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
  initPoints(count: number): void;
  redraw(): void;
  saveCurrentFilters(): Promise<void>;
  refreshDynamicContent(): Promise<void>;
}) => {
  const settingsFocus = attachModalFocus(deps.settingsModal, deps.settingsButton);
  const pointsFocus = attachModalFocus(deps.pointsResetModal, deps.pointsCount);
  let pendingPointCount: number | null = null;
  const pendingChanges = new Set<Promise<void>>();
  const trackChange = (change: Promise<void>): Promise<void> => {
    pendingChanges.add(change);
    void change.then(
      () => pendingChanges.delete(change),
      () => pendingChanges.delete(change),
    );
    return change;
  };
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

  const setTheme = (theme: unknown): Promise<void> =>
    trackChange(
      (async () => {
        const chosenTheme = resolveTheme(theme);
        await deps.saveTheme(chosenTheme);
        applyTheme(chosenTheme);
      })(),
    );

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
    trackChange(applyPointCountChange(clampPointCount(Number.parseInt(String(count), 10))));
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
    void trackChange(
      (async () => {
        const newCount = clampPointCount(Number.parseInt(deps.pointsCount.value, 10));
        if (await deps.shouldSkipPointCountConfirmation()) {
          await applyPointCountChange(newCount);
          return;
        }
        pendingPointCount = newCount;
        deps.skipResetConfirm.checked = await deps.shouldSkipPointCountConfirmation();
        pointsFocus.open();
      })(),
    ).catch((error: unknown) => {
      console.error("Failed to change equalizer point count", { error });
    });
  });
  deps.pointsResetModal.addEventListener("modal-closed", () => {
    if (pendingPointCount == null) return;
    pendingPointCount = null;
    void trackChange(resetPointCountSelect()).catch((error: unknown) => {
      console.error("Failed to restore equalizer point count", { error });
    });
  });
  deps.pointsResetConfirm.addEventListener("click", () => {
    void trackChange(
      (async () => {
        await deps.saveSkipPointCountConfirmation(deps.skipResetConfirm.checked);
        if (pendingPointCount != null) await applyPointCountChange(pendingPointCount);
        pendingPointCount = null;
        closePointsResetModal();
      })(),
    ).catch((error: unknown) => {
      console.error("Failed to confirm equalizer point count", { error });
    });
  });
  const cancelPointCountChange = (): void => {
    void trackChange(
      resetPointCountSelect().then(() => {
        pendingPointCount = null;
        closePointsResetModal();
      }),
    ).catch((error: unknown) => {
      console.error("Failed to cancel equalizer point count", { error });
    });
  };
  deps.pointsResetCancel.addEventListener("click", cancelPointCountChange);
  deps.pointsResetModal.addEventListener("click", (event) => {
    if (event.target === deps.pointsResetModal) cancelPointCountChange();
  });

  deps.enableSpectrum.addEventListener("change", () => {
    const enabled = deps.enableSpectrum.checked;
    void trackChange(deps.saveSpectrumEnabled(enabled)).catch((error: unknown) => {
      deps.enableSpectrum.checked = !enabled;
      console.error("Failed to save spectrum setting", { error });
    });
  });
  deps.enableVolumeCompensation.addEventListener("change", () => {
    const enabled = deps.enableVolumeCompensation.checked;
    void trackChange(deps.saveVolumeCompensationEnabled(enabled)).catch((error: unknown) => {
      deps.enableVolumeCompensation.checked = !enabled;
      console.error("Failed to save volume compensation setting", { error });
    });
  });
  deps.hideDefaultPresets.addEventListener("change", () => {
    const hidden = deps.hideDefaultPresets.checked;
    const save = deps.saveHideDefaultPresets(hidden).catch((error: unknown) => {
      deps.hideDefaultPresets.checked = !hidden;
      throw error;
    });
    void trackChange(save)
      .then(deps.refreshDynamicContent)
      .catch((error: unknown) => {
        console.error("Failed to save preset visibility", { error });
      });
  });
  deps.languageSelect.addEventListener("change", () => {
    void deps.localization
      .setLanguage(deps.languageSelect.value, {
        save: true,
        refreshDynamicContent: deps.refreshDynamicContent,
      })
      .catch((error: unknown) => {
        console.error("Failed to save language", { error });
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
    waitForPendingChanges: async (): Promise<void> => {
      await Promise.all([
        ...pendingChanges,
        shortcuts.waitForPendingChanges(),
        deps.localization.waitForPendingChanges(),
      ]);
    },
    applySavedSettings: async (
      settings: ResolvedSettings,
      isCurrent: () => boolean = () => true,
    ): Promise<void> => {
      if (!isCurrent()) return;
      const { general } = settings;
      applyTheme(general.theme);
      updatePointCountSelect(general.pointCount);
      deps.skipResetConfirm.checked = general.skipPointsResetConfirm;
      deps.enableSpectrum.checked = general.enableSpectrum;
      deps.enableVolumeCompensation.checked = general.enableVolumeCompensation;
      deps.hideDefaultPresets.checked = settings.presets.hideDefaultPresets;
      shortcuts.setShortcuts(settings.shortcuts);
      const applied = await deps.localization.applySavedLanguage(general.uiLanguage, isCurrent);
      if (!isCurrent()) return;
      if (!applied) {
        throw new Error("Failed to apply saved language");
      }
    },
    applyTheme,
    setTheme,
    setPointCount,
    updatePointCountSelect,
    getShortcutSettings: shortcuts.getShortcuts,
  };
};
