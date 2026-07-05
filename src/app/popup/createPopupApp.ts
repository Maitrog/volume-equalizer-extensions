import { dbToGain } from "../../domains/equalizer/equalizerMath";
import type {
  EqualizerPersistedFilter,
  EqualizerState,
} from "../../domains/equalizer/equalizerState";
import { clampPointCount } from "../../domains/equalizer/equalizerMath";
import { type LocalizationService } from "../../domains/localization/localizationService";
import {
  isPopupEditableShortcutTarget,
  matchesPopupShortcut,
  POPUP_SHORTCUT_ACTION_MUTE_NAME,
  POPUP_SHORTCUT_ACTION_TOGGLE_EQ_NAME,
} from "../../ui/popup/popupShortcuts";
import type { ThemeColors } from "../../domains/theme/themeColors";
import { STORAGE_KEYS } from "../../infrastructure/chrome/storageKeys";
import type { PopupElements } from "../../infrastructure/dom/popupElements";
import { createToolkitWindowController } from "../window-mode/createToolkitWindowController";
import { createEqualizerCanvas } from "../../ui/equalizerCanvas/createEqualizerCanvas";
import {
  createSpectrumRenderer,
  type SpectrumBuffer,
  type SpectrumMeta,
} from "../../ui/equalizerCanvas/draw/drawSpectrum";
import { createAutostartView } from "../../ui/popup/autostartView";
import { createControlsView, type ControlsView } from "../../ui/popup/controlsView";
import { createInstallUpdateNoticeView } from "../../ui/popup/installUpdateNoticeView";
import { createPresetsView, type PresetsView } from "../../ui/popup/presetsView";
import { createSettingsView, type SettingsView } from "../../ui/popup/settingsView";

export interface PopupApp {
  start(): Promise<void>;
  resize(): void;
}

export interface PopupAppDependencies {
  elements: PopupElements;
  audioContext: AudioContext;
  equalizerState: EqualizerState;
  localization: LocalizationService;
  readThemeColors(element?: Element): ThemeColors;
}

interface SpectrumStorageMessage extends Partial<SpectrumMeta> {
  type?: "meta" | "spectrum";
  buffer?: SpectrumBuffer | null;
}

export const createPopupApp = ({
  elements,
  audioContext,
  equalizerState,
  localization,
  readThemeColors,
}: PopupAppDependencies): PopupApp => {
  const ctx = elements.eqCanvas.getContext("2d", { alpha: true });
  if (!ctx) {
    throw new Error("Equalizer canvas context is unavailable");
  }

  const spectrumCtx = elements.spectrumCanvas.getContext("2d");
  if (!spectrumCtx) {
    throw new Error("Spectrum canvas context is unavailable");
  }
  spectrumCtx.imageSmoothingEnabled = true;
  spectrumCtx.imageSmoothingQuality = "high";

  let controlsView: ControlsView;
  let presetsView: PresetsView;
  let settingsView: SettingsView;

  const getColors = (): ThemeColors => readThemeColors(document.documentElement);

  const getPointCount = async (): Promise<number> => {
    const stored = await chrome.storage.local.get([STORAGE_KEYS.POINT_COUNT]);
    return clampPointCount(Number.parseInt(String(stored[STORAGE_KEYS.POINT_COUNT]), 10));
  };

  const equalizerCanvas = createEqualizerCanvas({
    canvas: elements.eqCanvas,
    ctx,
    audioContext,
    state: equalizerState,
    getColors,
    infoTooltip: elements.infoTooltip,
    saveCurrentFilters: () => saveCurrentFilters(),
    refreshToolkitCaptureFilters: () => toolkitController.refreshCaptureFilters(),
  });

  const spectrumRenderer = createSpectrumRenderer({
    canvas: elements.spectrumCanvas,
    ctx: spectrumCtx,
    getColors,
  });

  const resize = (): void => {
    equalizerCanvas.resize();
  };

  const getCurrentFilters = (): EqualizerPersistedFilter[] => {
    return equalizerState.getFilters(equalizerCanvas.getDimensions());
  };

  const setCurrentFilters = (filters: EqualizerPersistedFilter[]): void => {
    equalizerState.setPoints(filters, equalizerCanvas.getDimensions(), {
      onPointCountChange: (pointCount) => settingsView?.updatePointCountSelect(pointCount),
    });
  };

  const initPoints = (count: number): void => {
    equalizerState.initPoints(clampPointCount(count), equalizerCanvas.getDimensions());
  };

  const setGainValue = (value: number): void => {
    elements.masterVolume.value = String(value);
  };

  const renderCaptureError = (message: string | null): void => {
    if (!message) {
      elements.captureError.style.display = "none";
      elements.captureError.textContent = "";
      return;
    }

    console.log(message);
    elements.captureError.textContent = localization.getMessage("capture_error_prefix");
    elements.captureError.style.display = "block";
  };

  const toolkitController = createToolkitWindowController({
    body: document.body,
    capturedTabs: elements.capturedTabs,
    changeEqButton: elements.changeEqButton,
    audioContext,
    equalizerState,
    getDimensions: equalizerCanvas.getDimensions,
    getPointCount,
    getFilters: getCurrentFilters,
    setFilters: setCurrentFilters,
    initPoints,
    resize,
    setEnableButtonText: (enabled) => controlsView?.setEnableButtonText(enabled),
    setMuteButtonClass: (muted) => controlsView?.setMuteButtonClass(muted),
    renderCaptureError,
    getGainValue: () => Number(elements.masterVolume.value),
    setGainValue,
    isMuted: () => elements.volumeMuteButton.className === "volume-mute-active",
    getMessage: localization.getMessage,
  });

  const getCurrentTabId = (): Promise<number | null> => {
    return toolkitController.getCurrentTabId();
  };

  const saveCurrentFilters = async (
    options: { enableCurrentTab?: boolean } = {},
  ): Promise<void> => {
    const enableCurrentTab = options.enableCurrentTab ?? true;
    const tabId = await getCurrentTabId();
    if (tabId == null) return;

    const newFilters = getCurrentFilters();
    const values: Record<string, unknown> = {
      [STORAGE_KEYS.tabFilters(tabId)]: newFilters,
      [STORAGE_KEYS.FILTERS]: newFilters,
    };
    if (!toolkitController.isToolkitWindow && enableCurrentTab) {
      values[STORAGE_KEYS.tabEnabled(tabId)] = true;
    }
    await chrome.storage.local.set(values);
  };

  const saveLoadedFilters = async (
    filters: EqualizerPersistedFilter[],
  ): Promise<void> => {
    const tabId = await getCurrentTabId();
    if (tabId == null) return;

    const values: Record<string, unknown> = {
      [STORAGE_KEYS.tabFilters(tabId)]: filters,
      [STORAGE_KEYS.FILTERS]: filters,
    };
    if (!toolkitController.isToolkitWindow) {
      values[STORAGE_KEYS.tabEnabled(tabId)] = true;
    }
    await chrome.storage.local.set(values);
  };

  const toggleCurrentTabStorageValue = async (
    key: "mute" | "enabled",
    options: { enableTab?: boolean } = {},
  ): Promise<void> => {
    const tabId = await getCurrentTabId();
    if (tabId == null) return;

    const storageKey = `${key}.${tabId}`;
    const values = await chrome.storage.local.get([storageKey]);
    const nextValues: Record<string, unknown> = {
      [storageKey]: !values[storageKey],
    };
    if (options.enableTab && !toolkitController.isToolkitWindow) {
      nextValues[STORAGE_KEYS.tabEnabled(tabId)] = true;
    }
    await chrome.storage.local.set(nextValues);
  };

  const refreshDynamicContent = async (): Promise<void> => {
    await autostartView.renderWhitelist();
    await autostartView.refreshPresetSelects();
    controlsView.setEnableButtonText(false);
  };

  const onToggleEqualizer = async (): Promise<void> => {
    if (toolkitController.isToolkitWindow) return;

    const tabId = await getCurrentTabId();
    if (tabId == null) return;

    const enabledKey = STORAGE_KEYS.tabEnabled(tabId);
    const result = await chrome.storage.local.get([enabledKey]);
    await chrome.storage.local.set({
      [enabledKey]: !result[enabledKey],
      [STORAGE_KEYS.tabFilters(tabId)]: getCurrentFilters(),
      [STORAGE_KEYS.tabGain(tabId)]: elements.masterVolume.value,
    });
  };

  const onReset = async (): Promise<void> => {
    elements.masterVolume.value = "0";
    initPoints(await getPointCount());
    resize();
    toolkitController.refreshCaptureFilters();

    const tabId = await getCurrentTabId();
    if (tabId == null) return;

    await chrome.storage.local.set({
      [STORAGE_KEYS.tabVolume(tabId)]: 1,
      [STORAGE_KEYS.tabGain(tabId)]: 0,
      [STORAGE_KEYS.tabFilters(tabId)]: getCurrentFilters(),
    });
  };

  const onVolumeInput = async (value: number): Promise<void> => {
    toolkitController.applyCaptureSettings();
    const tabId = await getCurrentTabId();
    if (tabId == null) return;

    const values: Record<string, unknown> = {
      [STORAGE_KEYS.tabVolume(tabId)]: dbToGain(value),
      [STORAGE_KEYS.tabGain(tabId)]: elements.masterVolume.value,
    };
    if (!toolkitController.isToolkitWindow) {
      values[STORAGE_KEYS.tabEnabled(tabId)] = true;
    }
    await chrome.storage.local.set(values);
  };

  const onToggleMute = async (): Promise<void> => {
    const tabId = await getCurrentTabId();
    if (tabId == null) return;

    if (!toolkitController.isToolkitWindow) {
      await chrome.storage.local.set({ [STORAGE_KEYS.tabEnabled(tabId)]: true });
    }

    const result = await chrome.storage.local.get([STORAGE_KEYS.tabMute(tabId)]);
    await chrome.storage.local.set({
      [STORAGE_KEYS.tabMute(tabId)]: !result[STORAGE_KEYS.tabMute(tabId)],
    });
  };

  const onWindowMode = async (): Promise<void> => {
    const tabId = await getCurrentTabId();
    if (tabId == null) return;

    await chrome.runtime.sendMessage({
      method: "enableWindowMode",
      tabId,
    });
    window.close();
  };

  controlsView = createControlsView({
    changeEqButton: elements.changeEqButton,
    resetButton: elements.resetButton,
    masterVolume: elements.masterVolume,
    volumeMuteButton: elements.volumeMuteButton,
    windowModeButton: elements.windowModeButton,
    isToolkitWindow: toolkitController.isToolkitWindow,
    getMessage: localization.getMessage,
    onToggleEqualizer,
    onReset,
    onVolumeInput,
    onToggleMute,
    onWindowMode,
    onMuteStateApplied: () => toolkitController.applyCaptureSettings(),
  });

  presetsView = createPresetsView({
    dropdown: elements.presets,
    toggle: elements.presetsToggle,
    menu: elements.presetsMenu,
    nameInput: elements.presetName,
    saveButton: elements.savePresetButton,
    isToolkitWindow: toolkitController.isToolkitWindow,
    getMessage: localization.getMessage,
    getCurrentTabId,
    getCurrentFilters,
    setCurrentFilters,
    saveLoadedFilters,
    redraw: resize,
    refreshToolkitCaptureFilters: () => toolkitController.refreshCaptureFilters(),
  });

  const autostartView = createAutostartView({
    addToWhitelistButton: elements.addToAutostartWhitelistButton,
    modal: elements.autostartModal,
    closeButton: elements.autostartModalClose,
    cancelButton: elements.autostartModalCancel,
    confirmButton: elements.autostartModalConfirm,
    modalPreset: elements.autostartModalPreset,
    modalError: elements.autostartModalError,
    modalDomainValue: elements.autostartModalDomainValue,
    modalUrlValue: elements.autostartModalUrlValue,
    settingsList: elements.autostartSettingsList,
    settingsType: elements.autostartSettingsType,
    settingsAddValue: elements.autostartSettingsAddValue,
    settingsAddPreset: elements.autostartSettingsAddPreset,
    settingsAddButton: elements.autostartSettingsAddButton,
    settingsError: elements.autostartSettingsError,
    isToolkitWindow: toolkitController.isToolkitWindow,
    getMessage: localization.getMessage,
  });

  settingsView = createSettingsView({
    settingsModal: elements.settingsModal,
    settingsButton: elements.settingsButton,
    closeSettingsButton: elements.closeSettingsButton,
    themeSelect: elements.themeSelect,
    pointsCount: elements.pointsCount,
    pointsResetModal: elements.pointsResetModal,
    pointsResetConfirm: elements.pointsResetConfirm,
    pointsResetCancel: elements.pointsResetCancel,
    skipResetConfirm: elements.skipResetConfirm,
    exportPresetsButton: elements.exportPresetsButton,
    importPresetsButton: elements.importPresetsButton,
    importInput: elements.importInput,
    enableSpectrum: elements.enableSpectrum,
    languageSelect: elements.languageSelect,
    shortcutMute: elements.shortcutMute,
    shortcutToggleEq: elements.shortcutToggleEq,
    shortcutsError: elements.shortcutsSettingsError,
    localization,
    addPresetToDropdown: presetsView.addPresetToDropdown,
    initPoints,
    redraw: resize,
    refreshToolkitCaptureFilters: () => toolkitController.refreshCaptureFilters(),
    saveCurrentFilters,
    refreshDynamicContent,
  });

  const installUpdateNoticeView = createInstallUpdateNoticeView({
    modal: elements.installUpdateNoticeModal,
    closeButton: elements.installUpdateNoticeClose,
    currentVersion: chrome.runtime.getManifest().version,
    isToolkitWindow: toolkitController.isToolkitWindow,
  });

  elements.infoButton.addEventListener("click", () => {
    elements.infoModal.style.display = "block";
  });
  elements.closeInfoModal.addEventListener("click", () => {
    elements.infoModal.style.display = "none";
  });

  document.addEventListener("keydown", (event) => {
    void (async () => {
      if (event.repeat || isPopupEditableShortcutTarget(event.target)) return;

      const shortcuts = settingsView.getShortcutSettings();
      if (matchesPopupShortcut(event, shortcuts[POPUP_SHORTCUT_ACTION_MUTE_NAME])) {
        event.preventDefault();
        event.stopPropagation();
        await toggleCurrentTabStorageValue("mute", { enableTab: true });
        return;
      }

      if (matchesPopupShortcut(
        event,
        shortcuts[POPUP_SHORTCUT_ACTION_TOGGLE_EQ_NAME],
      )) {
        if (toolkitController.isToolkitWindow) return;

        event.preventDefault();
        event.stopPropagation();
        await toggleCurrentTabStorageValue("enabled");
      }
    })();
  });

  chrome.storage.onChanged.addListener((changes) => {
    void (async () => {
      await toolkitController.handleStorageChange(changes);

      const tabId = await getCurrentTabId();
      if (tabId == null) return;

      if (changes[STORAGE_KEYS.tabEnabled(tabId)]) {
        controlsView.setEnableButtonText(
          changes[STORAGE_KEYS.tabEnabled(tabId)].newValue === true,
        );
      }
      if (changes[STORAGE_KEYS.tabMute(tabId)]) {
        controlsView.setMuteButtonClass(changes[STORAGE_KEYS.tabMute(tabId)].newValue === true);
      }
      if (changes[STORAGE_KEYS.tabCaptureError(tabId)]) {
        renderCaptureError(
          typeof changes[STORAGE_KEYS.tabCaptureError(tabId)].newValue === "string"
            ? (changes[STORAGE_KEYS.tabCaptureError(tabId)].newValue as string)
            : null,
        );
      }

      const spectrumChange = changes[STORAGE_KEYS.tabSpectrum(tabId)];
      if (spectrumChange) {
        const message = spectrumChange.newValue as SpectrumStorageMessage | undefined;
        if (message?.type === "meta") {
          spectrumRenderer.setMeta(message);
        }
        if (message?.type === "spectrum") {
          spectrumRenderer.scheduleDraw(message.buffer);
        }
      }

      if (toolkitController.isToolkitWindow) {
        toolkitController.refreshCaptureFilters();
      }
    })();
  });

  const start = async (): Promise<void> => {
    await localization.ready;
    await settingsView.init();
    await autostartView.init();

    const stored = await chrome.storage.local.get([
      STORAGE_KEYS.POINT_COUNT,
      STORAGE_KEYS.THEME,
      STORAGE_KEYS.SKIP_POINTS_CONFIRM,
      STORAGE_KEYS.INSTALL_UPDATE_NOTICE,
    ]);
    settingsView.applyTheme(stored[STORAGE_KEYS.THEME]);

    if (await toolkitController.shouldShowToolkitWindowNotice(await getCurrentTabId())) {
      toolkitController.showToolkitWindowNotice();
      return;
    }

    resize();
    const savedPointCount = clampPointCount(
      Number.parseInt(String(stored[STORAGE_KEYS.POINT_COUNT]), 10),
    );
    settingsView.updatePointCountSelect(savedPointCount);

    const tabId = await getCurrentTabId();
    if (tabId == null) {
      initPoints(savedPointCount);
      resize();
      return;
    }

    const result = await chrome.storage.local.get([
      STORAGE_KEYS.FILTERS,
      STORAGE_KEYS.tabFilters(tabId),
      STORAGE_KEYS.tabGain(tabId),
      STORAGE_KEYS.PRESETS,
      STORAGE_KEYS.PRESET_NAMES,
      STORAGE_KEYS.tabEnabled(tabId),
      STORAGE_KEYS.tabMute(tabId),
      STORAGE_KEYS.ENABLE_SPECTRUM,
      STORAGE_KEYS.tabCaptureError(tabId),
    ]);

    const tabFilters = result[STORAGE_KEYS.tabFilters(tabId)] as
      | EqualizerPersistedFilter[]
      | undefined;
    const defaultFilters = result[STORAGE_KEYS.FILTERS] as
      | EqualizerPersistedFilter[]
      | undefined;
    const loadedFilters = tabFilters?.length ? tabFilters : defaultFilters?.length ? defaultFilters : null;

    if (loadedFilters) {
      setCurrentFilters(loadedFilters);
    } else {
      initPoints(savedPointCount);
    }

    if (!loadedFilters || !equalizerState.hasCrossoverFilters(loadedFilters)) {
      await saveCurrentFilters({ enableCurrentTab: false });
    }

    const gain = result[STORAGE_KEYS.tabGain(tabId)];
    if (typeof gain === "string" || typeof gain === "number") {
      elements.masterVolume.value = String(gain);
    }

    resize();
    controlsView.setEnableButtonText(result[STORAGE_KEYS.tabEnabled(tabId)] === true);
    controlsView.setMuteButtonClass(result[STORAGE_KEYS.tabMute(tabId)] === true);

    if (result[STORAGE_KEYS.ENABLE_SPECTRUM] === true) {
      elements.enableSpectrum.checked = true;
    }

    ((result[STORAGE_KEYS.PRESET_NAMES] ?? []) as string[]).forEach((name) => {
      presetsView.addPresetToDropdown(name);
    });

    renderCaptureError(
      typeof result[STORAGE_KEYS.tabCaptureError(tabId)] === "string"
        ? (result[STORAGE_KEYS.tabCaptureError(tabId)] as string)
        : null,
    );

    installUpdateNoticeView.showInstallUpdateNotice(stored);
    await toolkitController.startTabCapture();
    await toolkitController.renderCapturedTabs();
  };

  return {
    start,
    resize,
  };
};
