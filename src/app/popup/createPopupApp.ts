import { dbToGain } from "../../domains/equalizer/equalizerMath";
import type { EqualizerFilter } from "../../domains/equalizer/types";
import type { EqualizerState } from "../../ui/equalizerCanvas/equalizerEditorState";
import { clampPointCount } from "../../domains/equalizer/equalizerMath";
import { type LocalizationService } from "./localizationController";
import type { ThemeColors } from "../../ui/theme/themeColors";
import { STORAGE_KEYS } from "../../infrastructure/chrome/storageKeys";
import type { PopupElements } from "../../ui/popup/popupElements";
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
import { createCapturedTabsView } from "../../ui/popup/capturedTabsView";
import { ensureContentScripts } from "./ensureContentScripts";
import { createCaptureController } from "./captureController";
import { attachPopupSubscriptions } from "./popupSubscriptions";

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
  let capturedTabsView: ReturnType<typeof createCapturedTabsView> | undefined = undefined;
  let subscriptions: ReturnType<typeof attachPopupSubscriptions> | undefined = undefined;
  let disposed = false;
  const settingsActions = createSettingsActions();

  const getColors = (): ThemeColors => readThemeColors(document.documentElement);
  const filterPersistence = createFilterPersistence(async (tabId, filters) => {
    const values: Record<string, unknown> = {
      [STORAGE_KEYS.tabFilters(tabId)]: filters,
      [STORAGE_KEYS.FILTERS]: filters,
    };
    if (!captureController.isTabCaptured(tabId)) {
      values[STORAGE_KEYS.tabEnabled(tabId)] = true;
    }
    await chrome.storage.local.set(values);
  });

  const getPointCount = settingsActions.loadPointCount;
  const getSelectedTabId = (): number | null => captureController.getSelectedTabId();

  const equalizerCanvas = createEqualizerCanvas({
    canvas: elements.eqCanvas,
    ctx,
    audioContext,
    state: equalizerState,
    getColors,
    infoTooltip: elements.infoTooltip,
    keyboardStatus: elements.equalizerKeyboardStatus,
    saveCurrentFilters: () => {
      const tabId = getSelectedTabId();
      if (tabId != null) filterPersistence.schedule(tabId, getCurrentFilters());
    },
    flushCurrentFilters: () => filterPersistence.flush(),
    refreshToolkitCaptureFilters: () => undefined,
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

  const renderTabCaptureError = (): void => {
    elements.captureError.textContent = localization.getMessage("tab_capture_start_error");
    elements.captureError.style.display = "block";
  };

  const captureController = createCaptureController({
    getPointCount,
    setFilters: setCurrentFilters,
    initPoints,
    resize,
    setGainValue,
    setEnableButtonClass: (enabled) => controlsView?.setEnableButtonClass(enabled),
    setMuteButtonClass: (muted) => controlsView?.setMuteButtonClass(muted),
    renderCaptureError,
    renderTabCaptureError,
    onSpectrumTabChange: (tabId) => {
      if (tabId != null) subscriptions?.connectSpectrum(tabId);
    },
    renderCapturedTabs: () => capturedTabsView?.render() ?? Promise.resolve(),
  });

  const presetActions = createPresetActions({
    getCurrentTabId: async () => getSelectedTabId(),
    getCurrentFilters,
  });
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
    const tabId = getSelectedTabId();
    if (tabId == null) return;

    const newFilters = getCurrentFilters();
    const values: Record<string, unknown> = {
      [STORAGE_KEYS.tabFilters(tabId)]: newFilters,
      [STORAGE_KEYS.FILTERS]: newFilters,
    };
    if (!captureController.isTabCaptured(tabId) && enableCurrentTab) {
      values[STORAGE_KEYS.tabEnabled(tabId)] = true;
    }
    await chrome.storage.local.set(values);
  };

  const saveLoadedFilters = async (filters: EqualizerFilter[]): Promise<void> => {
    await filterPersistence.flush();
    const tabId = getSelectedTabId();
    if (tabId == null) return;

    const values: Record<string, unknown> = {
      [STORAGE_KEYS.tabFilters(tabId)]: filters,
      [STORAGE_KEYS.FILTERS]: filters,
    };
    if (!captureController.isTabCaptured(tabId)) {
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
    const tabId = targetTabId ?? getSelectedTabId();
    if (tabId == null) return;

    if (captureController.isTabCaptured(tabId)) {
      await captureController.toggleCaptureEnabled(tabId);
      return;
    }

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

    const tabId = getSelectedTabId();
    if (tabId == null) return;

    await chrome.storage.local.set({
      [STORAGE_KEYS.tabVolume(tabId)]: 1,
      [STORAGE_KEYS.tabGain(tabId)]: 0,
      [STORAGE_KEYS.tabFilters(tabId)]: getCurrentFilters(),
    });
  };

  const onVolumeInput = async (value: number): Promise<void> => {
    const tabId = getSelectedTabId();
    if (tabId == null) return;

    const values: Record<string, unknown> = {
      [STORAGE_KEYS.tabVolume(tabId)]: dbToGain(value),
      [STORAGE_KEYS.tabGain(tabId)]: elements.masterVolume.value,
    };
    if (!captureController.isTabCaptured(tabId)) {
      values[STORAGE_KEYS.tabEnabled(tabId)] = true;
    }
    await chrome.storage.local.set(values);
  };

  const onToggleMute = async (targetTabId?: number): Promise<void> => {
    const tabId = targetTabId ?? getSelectedTabId();
    if (tabId == null) return;

    if (!captureController.isTabCaptured(tabId)) {
      await chrome.storage.local.set({ [STORAGE_KEYS.tabEnabled(tabId)]: true });
    }

    const result = await chrome.storage.local.get([STORAGE_KEYS.tabMute(tabId)]);
    const muted = !result[STORAGE_KEYS.tabMute(tabId)];
    await chrome.storage.local.set({
      [STORAGE_KEYS.tabMute(tabId)]: muted,
    });
  };

  const onTabCapture = async (): Promise<void> => {
    await captureController.startCapture();
  };

  controlsView = createControlsView({
    changeEqButton: elements.changeEqButton,
    resetButton: elements.resetButton,
    masterVolume: elements.masterVolume,
    masterVolumeValue: elements.masterVolumeValue,
    clippingIndicator: elements.clippingIndicator,
    volumeMuteButton: elements.volumeMuteButton,
    tabCaptureButton: elements.tabCaptureButton,
    getMessage: localization.getMessage,
    onToggleEqualizer,
    onReset,
    onVolumeInput,
    onToggleMute,
    onTabCapture,
    onMuteStateApplied: () => undefined,
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
    refreshToolkitCaptureFilters: () => undefined,
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
    isToolkitWindow: false,
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
    refreshToolkitCaptureFilters: () => undefined,
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
      tabCapture: elements.tabCaptureButton,
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

  capturedTabsView = createCapturedTabsView({
    root: elements.capturedTabs,
    getSelectedTabId,
    getMessage: localization.getMessage,
    onSelectTab: (tabId) => captureController.selectTab(tabId),
    onStopCapture: (tabId) => captureController.stopCapture(tabId),
  });

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    subscriptions?.dispose();
    equalizerCanvas.cleanup();
    void filterPersistence.dispose().catch((error: unknown) => {
      console.error("Failed to dispose filter persistence", { error });
    });
  };

  subscriptions = attachPopupSubscriptions({
    isToolkitWindow: false,
    handleToolkitStorageChange: captureController.handleStorageChange,
    renderAutostartWhitelist: autostartView.renderWhitelist,
    refreshAutostartPresetSelects: autostartView.refreshPresetSelects,
    refreshPresetDropdown,
    getCurrentTabId: async () => getSelectedTabId(),
    setEnableButtonClass: controlsView.setEnableButtonClass,
    setMuteButtonClass: controlsView.setMuteButtonClass,
    renderCaptureError,
    refreshCaptureFilters: () => undefined,
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

    await captureController.init();
    if (disposed) return;

    const tabId = getSelectedTabId();
    if (tabId == null) {
      initPoints(loadedSettings.pointCount);
      resize();
    } else {
      await ensureContentScripts(tabId);
      if (disposed) return;
      subscriptions?.connectSpectrum(tabId);
      if (!equalizerState.hasCrossoverFilters(getCurrentFilters())) {
        await saveCurrentFilters({ enableCurrentTab: false });
        if (disposed) return;
      }
    }

    resize();
    await refreshPresetDropdown();
    if (disposed) return;
    await captureController.syncSnapshot();
    if (disposed) return;

    const pendingNotice = getPendingInstallUpdateNotice({
      stored,
      currentVersion: chrome.runtime.getManifest().version,
      isToolkitWindow: false,
    });
    if (pendingNotice?.reason === "install") {
      await onboardingGuideView.start();
      if (disposed) return;
    } else if (pendingNotice?.reason === "update") {
      installUpdateNoticeView.showInstallUpdateNotice(pendingNotice);
    } else {
      donationReminderView.showDonationReminder(stored[STORAGE_KEYS.DONATION_REMINDER_AT]);
    }
  };

  return {
    start,
    resize,
    dispose,
  };
};
