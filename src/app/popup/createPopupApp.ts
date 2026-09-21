import { dbToGain } from "../../domains/equalizer/equalizerMath";
import type { EqualizerFilter } from "../../domains/equalizer/types";
import { readPersistedFilters } from "../../domains/equalizer/persistedFilters";
import type { EqualizerState } from "../../ui/equalizerCanvas/equalizerEditorState";
import { clampPointCount } from "../../domains/equalizer/equalizerMath";
import { type LocalizationService } from "./localizationController";
import type { ThemeColors } from "../../ui/theme/themeColors";
import { STORAGE_KEYS } from "../../infrastructure/chrome/storageKeys";
import {
  RUNTIME_MESSAGES,
  type EnableWindowModeResponse,
} from "../../infrastructure/chrome/runtimeMessages";
import type { PopupElements } from "../../ui/popup/popupElements";
import { createToolkitWindowController } from "../window-mode/createToolkitWindowController";
import { createEqualizerCanvas } from "../../ui/equalizerCanvas/createEqualizerCanvas";
import { createFilterPersistence } from "./filterPersistence";
import { createPresetActions } from "./presetActions";
import { createSettingsActions } from "./settingsActions";
import { createAutostartActions } from "./autostartActions";
import { createSpectrumRenderer } from "../../ui/equalizerCanvas/draw/drawSpectrum";
import { createAutostartView } from "../../ui/popup/autostartView";
import { createControlsView, formatGainValue } from "../../ui/popup/controlsView";
import {
  createInstallUpdateNoticeView,
  getPendingInstallUpdateNotice,
} from "../../ui/popup/installUpdateNoticeView";
import { createDonationReminderView } from "../../ui/popup/donationReminderView";
import { createOnboardingGuideView } from "../../ui/popup/onboardingGuideView";
import { createPresetsView } from "../../ui/popup/presetsView";
import { createSettingsView } from "../../ui/popup/settingsView";
import { ensureContentScripts } from "./ensureContentScripts";
import { attachPopupSubscriptions } from "./popupSubscriptions";

export const requestWindowMode = async (tabId: number, showError: () => void): Promise<void> => {
  let response: EnableWindowModeResponse;
  try {
    response = (await chrome.runtime.sendMessage({
      method: RUNTIME_MESSAGES.ENABLE_WINDOW_MODE,
      tabId,
    })) as EnableWindowModeResponse;
  } catch (error) {
    console.error("Failed to enable window mode", { tabId, error });
    showError();
    return;
  }

  if (response?.ok === true) {
    window.close();
    return;
  }

  const error = response?.ok === false ? response.error : "Invalid window mode response";
  console.error("Failed to enable window mode", { tabId, error });
  showError();
};

export interface PopupAppDependencies {
  elements: PopupElements;
  audioContext: AudioContext;
  equalizerState: EqualizerState;
  localization: LocalizationService;
  readThemeColors(element?: Element): ThemeColors;
}

export const createPopupApp = ({
  elements,
  audioContext,
  equalizerState,
  localization,
  readThemeColors,
}: PopupAppDependencies) => {
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

  let controlsView: ReturnType<typeof createControlsView> | undefined = undefined;
  let presetsView: ReturnType<typeof createPresetsView> | undefined = undefined;
  let settingsView: ReturnType<typeof createSettingsView> | undefined = undefined;
  let disposed = false;
  const settingsActions = createSettingsActions();

  const getColors = (): ThemeColors => readThemeColors(document.documentElement);
  const filterPersistence = createFilterPersistence(async (tabId, filters) => {
    const values: Record<string, unknown> = {
      [STORAGE_KEYS.tabFilters(tabId)]: filters,
      [STORAGE_KEYS.FILTERS]: filters,
    };
    if (!toolkitController.isToolkitWindow) {
      values[STORAGE_KEYS.tabEnabled(tabId)] = true;
    }
    await chrome.storage.local.set(values);
  });

  const getPointCount = settingsActions.loadPointCount;

  const equalizerCanvas = createEqualizerCanvas({
    canvas: elements.eqCanvas,
    ctx,
    audioContext,
    state: equalizerState,
    getColors,
    infoTooltip: elements.infoTooltip,
    keyboardStatus: elements.equalizerKeyboardStatus,
    saveCurrentFilters: () => {
      const tabId = toolkitController.getResolvedTabId();
      if (tabId != null) filterPersistence.schedule(tabId, getCurrentFilters());
    },
    flushCurrentFilters: () => filterPersistence.flush(),
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

  const getCurrentFilters = (): EqualizerFilter[] => {
    return equalizerState.getFilters(equalizerCanvas.getDimensions());
  };

  const setCurrentFilters = (filters: EqualizerFilter[]): void => {
    equalizerState.setPoints(filters, equalizerCanvas.getDimensions(), {
      onPointCountChange: (pointCount) => settingsView?.updatePointCountSelect(pointCount),
    });
  };

  const initPoints = (count: number): void => {
    equalizerState.initPoints(clampPointCount(count), equalizerCanvas.getDimensions());
  };

  const setGainValue = (value: number): void => {
    elements.masterVolume.value = String(value);
    elements.masterVolumeValue.textContent = formatGainValue(value);
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
    audioContext,
    getPointCount,
    getFilters: getCurrentFilters,
    setFilters: setCurrentFilters,
    initPoints,
    resize,
    setEnableButtonClass: (enabled) => controlsView?.setEnableButtonClass(enabled),
    setMuteButtonClass: (muted) => controlsView?.setMuteButtonClass(muted),
    renderCaptureError,
    getGainValue: () => Number(elements.masterVolume.value),
    setGainValue,
    isMuted: () => elements.volumeMuteButton.className === "volume-mute-active",
    getMessage: localization.getMessage,
    onSpectrumMeta: (meta) => spectrumRenderer.setMeta(meta),
    onSpectrumFrame: (buffer, clipping) => {
      spectrumRenderer.scheduleDraw(buffer);
      if (buffer === null) controlsView?.resetClipping();
      else controlsView?.setClipping(clipping === true);
    },
  });

  const getCurrentTabId = (): Promise<number | null> => {
    return toolkitController.getCurrentTabId();
  };
  const presetActions = createPresetActions({ getCurrentTabId, getCurrentFilters });
  const autostartActions = createAutostartActions({
    getActiveTab: async () => {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      return tab ?? null;
    },
  });

  const saveCurrentFilters = async (
    options: { enableCurrentTab?: boolean } = {},
  ): Promise<void> => {
    await filterPersistence.flush();
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

  const saveLoadedFilters = async (filters: EqualizerFilter[]): Promise<void> => {
    await filterPersistence.flush();
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

  const refreshPresetDropdown = async (): Promise<void> => {
    const current = await presetActions.load();
    presetsView?.renderPresetNames(current.presetNames, {
      includeDefaultPresets: current.includeDefaultPresets,
    });
  };

  const refreshDynamicContent = async (): Promise<void> => {
    await autostartView.renderWhitelist();
    await autostartView.refreshPresetSelects();
    await refreshPresetDropdown();
  };

  const onToggleEqualizer = async (targetTabId?: number): Promise<void> => {
    if (toolkitController.isToolkitWindow) {
      toolkitController.toggleEqualizer(targetTabId);
      return;
    }

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
    setGainValue(0);
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

  const onToggleMute = async (targetTabId?: number): Promise<void> => {
    const tabId = targetTabId ?? (await getCurrentTabId());
    if (tabId == null) return;

    if (!toolkitController.isToolkitWindow) {
      await chrome.storage.local.set({ [STORAGE_KEYS.tabEnabled(tabId)]: true });
    }

    const result = await chrome.storage.local.get([STORAGE_KEYS.tabMute(tabId)]);
    const muted = !result[STORAGE_KEYS.tabMute(tabId)];
    if (toolkitController.isToolkitWindow) {
      toolkitController.setCaptureMuted(tabId, muted);
    }
    await chrome.storage.local.set({
      [STORAGE_KEYS.tabMute(tabId)]: muted,
    });
  };

  const onWindowMode = async (): Promise<void> => {
    const tabId = await getCurrentTabId();
    if (tabId == null) return;

    await requestWindowMode(tabId, () => {
      elements.captureError.textContent = localization.getMessage("window_mode_start_error");
      elements.captureError.style.display = "block";
    });
  };

  controlsView = createControlsView({
    changeEqButton: elements.changeEqButton,
    resetButton: elements.resetButton,
    masterVolume: elements.masterVolume,
    masterVolumeValue: elements.masterVolumeValue,
    clippingIndicator: elements.clippingIndicator,
    volumeMuteButton: elements.volumeMuteButton,
    windowModeButton: elements.windowModeButton,
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
    saveButton: elements.savePresetButton,
    saveModal: elements.presetSaveModal,
    saveModalClose: elements.presetSaveClose,
    saveForm: elements.presetSaveForm,
    nameInput: elements.presetName,
    saveError: elements.presetSaveError,
    saveCancel: elements.presetSaveCancel,
    getMessage: localization.getMessage,
    getCurrentFilters,
    savePreset: presetActions.savePreset,
    deletePreset: presetActions.deletePreset,
    selectPreset: presetActions.selectPreset,
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
    getActiveTab: autostartActions.getActiveTab,
    loadRules: autostartActions.load,
    loadPresetNames: presetActions.loadAvailablePresetNames,
    addRule: autostartActions.add,
    removeRule: autostartActions.remove,
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
    enableVolumeCompensation: elements.enableVolumeCompensation,
    hideDefaultPresets: elements.hideDefaultPresets,
    languageSelect: elements.languageSelect,
    shortcutMute: elements.shortcutMute,
    shortcutToggleEq: elements.shortcutToggleEq,
    shortcutsError: elements.shortcutsSettingsError,
    localization,
    loadSettings: settingsActions.load,
    loadPointCount: settingsActions.loadPointCount,
    shouldSkipPointCountConfirmation: settingsActions.shouldSkipPointCountConfirmation,
    saveTheme: settingsActions.saveTheme,
    saveShortcuts: settingsActions.saveShortcuts,
    savePointCount: settingsActions.savePointCount,
    saveSkipPointCountConfirmation: settingsActions.saveSkipPointCountConfirmation,
    saveSpectrumEnabled: settingsActions.saveSpectrumEnabled,
    saveVolumeCompensationEnabled: settingsActions.saveVolumeCompensationEnabled,
    saveHideDefaultPresets: settingsActions.saveHideDefaultPresets,
    importPresets: presetActions.importPresets,
    exportPresets: presetActions.exportPresets,
    addPresetToDropdown: presetsView.addPresetToDropdown,
    initPoints,
    redraw: resize,
    refreshToolkitCaptureFilters: () => toolkitController.refreshCaptureFilters(),
    saveCurrentFilters,
    refreshDynamicContent,
  });

  const installUpdateNoticeView = createInstallUpdateNoticeView({
    returnFocusTo: elements.settingsButton,
    modal: elements.installUpdateNoticeModal,
    topCloseButton: elements.installUpdateNoticeTopClose,
    closeButton: elements.installUpdateNoticeClose,
  });

  const donationReminderView = createDonationReminderView({
    returnFocusTo: elements.settingsButton,
    modal: elements.donationReminderModal,
    closeButton: elements.donationReminderClose,
  });

  const onboardingGuideView = createOnboardingGuideView({
    root: elements.onboardingGuide,
    inertElements: Array.from(document.body.children).filter(
      (element): element is HTMLElement =>
        element instanceof HTMLElement && element !== elements.onboardingGuide,
    ),
    targets: {
      volumeMute: elements.volumeMuteButton,
      changeEq: elements.changeEqButton,
      settings: elements.settingsButton,
      autostart: elements.addToAutostartWhitelistButton,
      windowMode: elements.windowModeButton,
      equalizer: elements.equalizerCurveContainer,
      volume: elements.volumeControlCard,
      presets: elements.presetControlsCard,
    },
    sourceLanguageSelect: elements.languageSelect,
    sourceThemeSelect: elements.themeSelect,
    sourcePointCountSelect: elements.pointsCount,
    getMessage: localization.getMessage,
    setLanguage: async (language) => {
      await localization.setLanguage(language, {
        save: true,
        refreshDynamicContent,
      });
    },
    setTheme: (theme) => settingsView.setTheme(theme),
    setPointCount: (count) => settingsView.setPointCount(count),
    onComplete: () => chrome.storage.local.remove(STORAGE_KEYS.INSTALL_UPDATE_NOTICE),
  });

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    subscriptions.dispose();
    equalizerCanvas.cleanup();
    void filterPersistence.dispose().catch((error: unknown) => {
      console.error("Failed to dispose filter persistence", { error });
    });
    toolkitController.stopTabCapture();
  };
  const subscriptions = attachPopupSubscriptions({
    isToolkitWindow: toolkitController.isToolkitWindow,
    handleToolkitStorageChange: toolkitController.handleStorageChange,
    renderAutostartWhitelist: autostartView.renderWhitelist,
    refreshAutostartPresetSelects: autostartView.refreshPresetSelects,
    refreshPresetDropdown,
    getCurrentTabId,
    setEnableButtonClass: controlsView.setEnableButtonClass,
    setMuteButtonClass: controlsView.setMuteButtonClass,
    renderCaptureError,
    refreshCaptureFilters: () => toolkitController.refreshCaptureFilters(),
    getShortcutSettings: settingsView.getShortcutSettings,
    toggleMute: onToggleMute,
    toggleEqualizer: onToggleEqualizer,
    onSpectrumMeta: (meta) => spectrumRenderer.setMeta(meta),
    onSpectrumFrame: (buffer, clipping) => {
      spectrumRenderer.scheduleDraw(buffer);
      if (buffer === null) controlsView.resetClipping();
      else controlsView.setClipping(clipping);
    },
    onResize: resize,
    onPagehide: dispose,
  });

  const start = async (): Promise<void> => {
    if (disposed) return;
    await localization.ready;
    if (disposed) return;
    const loadedSettings = await settingsView.init();
    if (disposed) return;
    await autostartView.init();
    if (disposed) return;

    const stored = await chrome.storage.local.get([
      STORAGE_KEYS.INSTALL_UPDATE_NOTICE,
      STORAGE_KEYS.DONATION_REMINDER_AT,
    ]);
    if (disposed) return;

    const tabId = await getCurrentTabId();
    if (disposed) return;
    const showWindowNotice = await toolkitController.shouldShowToolkitWindowNotice(tabId);
    if (disposed) return;
    if (showWindowNotice) {
      toolkitController.showToolkitWindowNotice();
      return;
    }

    if (!toolkitController.isToolkitWindow && tabId != null) {
      await ensureContentScripts(tabId);
      if (disposed) return;
      subscriptions.connectSpectrum(tabId);
    }

    resize();
    const savedPointCount = loadedSettings.pointCount;

    if (tabId == null) {
      initPoints(savedPointCount);
      resize();
      return;
    }

    const result = await chrome.storage.local.get([
      STORAGE_KEYS.FILTERS,
      STORAGE_KEYS.tabFilters(tabId),
      STORAGE_KEYS.tabGain(tabId),
      STORAGE_KEYS.tabEnabled(tabId),
      STORAGE_KEYS.tabMute(tabId),
      STORAGE_KEYS.tabCaptureError(tabId),
    ]);
    if (disposed) return;

    const tabFilters = readPersistedFilters(result[STORAGE_KEYS.tabFilters(tabId)]);
    const defaultFilters = readPersistedFilters(result[STORAGE_KEYS.FILTERS]);
    const loadedFilters = tabFilters?.length
      ? tabFilters
      : defaultFilters?.length
        ? defaultFilters
        : null;

    if (loadedFilters) {
      setCurrentFilters(loadedFilters);
    } else {
      initPoints(savedPointCount);
    }

    if (!loadedFilters || !equalizerState.hasCrossoverFilters(loadedFilters)) {
      await saveCurrentFilters({ enableCurrentTab: false });
      if (disposed) return;
    }

    const gain = result[STORAGE_KEYS.tabGain(tabId)];
    if (typeof gain === "string" || typeof gain === "number") {
      setGainValue(Number(gain));
    }

    resize();
    controlsView.setEnableButtonClass(result[STORAGE_KEYS.tabEnabled(tabId)] === true);
    controlsView.setMuteButtonClass(result[STORAGE_KEYS.tabMute(tabId)] === true);

    await refreshPresetDropdown();
    if (disposed) return;

    renderCaptureError(
      typeof result[STORAGE_KEYS.tabCaptureError(tabId)] === "string"
        ? (result[STORAGE_KEYS.tabCaptureError(tabId)] as string)
        : null,
    );

    const pendingNotice = getPendingInstallUpdateNotice({
      stored,
      currentVersion: chrome.runtime.getManifest().version,
      isToolkitWindow: toolkitController.isToolkitWindow,
    });
    if (pendingNotice?.reason === "install") {
      await onboardingGuideView.start();
      if (disposed) return;
    } else if (pendingNotice?.reason === "update") {
      installUpdateNoticeView.showInstallUpdateNotice(pendingNotice);
    } else if (!toolkitController.isToolkitWindow) {
      donationReminderView.showDonationReminder(stored[STORAGE_KEYS.DONATION_REMINDER_AT]);
    }
    if (disposed) return;
    await toolkitController.startTabCapture();
    if (disposed) return;
    await toolkitController.renderCapturedTabs();
  };

  return {
    start,
    resize,
    dispose,
  };
};
