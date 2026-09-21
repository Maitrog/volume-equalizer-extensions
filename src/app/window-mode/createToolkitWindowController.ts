import type { EqualizerFilter } from "../../domains/equalizer/types";
import { readPersistedFilters } from "../../domains/equalizer/persistedFilters";
import { readStoredGain } from "../../domains/equalizer/persistedGain";
import { isEqualizerFilterEnabled } from "../../domains/equalizer/defaultFilters";
import { createSpectrumSampler } from "../../infrastructure/audio/spectrumSampler";
import { STORAGE_KEYS } from "../../infrastructure/chrome/storageKeys";
import { createCapturedTabsView } from "../../ui/popup/capturedTabsView";
import { createTabSettingsController } from "../popup/tabSettingsController";
import { createCaptureGraph, type CaptureGraph } from "../offscreen/captureGraph";
import { createCaptureSession } from "../offscreen/captureSession";

export interface ToolkitSpectrumMeta {
  type: "meta";
  sampleRate: number;
  fftSize: number;
  minDb: number;
  maxDb: number;
  frequencyBinCount: number;
}

export const createToolkitWindowController = (deps: {
  body: HTMLElement;
  capturedTabs: HTMLElement;
  audioContext: AudioContext;
  getPointCount(): Promise<number>;
  getFilters(): EqualizerFilter[];
  setFilters(filters: EqualizerFilter[]): void;
  initPoints(count: number): void;
  resize(): void;
  setEnableButtonClass(enabled: boolean): void;
  setMuteButtonClass(muted: boolean): void;
  renderCaptureError(message: string | null): void;
  getGainValue(): number;
  setGainValue(value: number): void;
  isMuted(): boolean;
  getMessage(messageName: string): string;
  onSpectrumMeta?(meta: ToolkitSpectrumMeta): void;
  onSpectrumFrame?(buffer: Float32Array | null, clipping?: boolean): void;
}) => {
  const isToolkitWindow = new URLSearchParams(window.location.search).get("mode") === "window";
  let capturedTabsView: ReturnType<typeof createCapturedTabsView> | null = null;
  let spectrumEnabled = false;
  let spectrumDemand = false;
  let spectrumOutput: AudioNode | null = null;
  let captureStartRevision = 0;
  const spectrumSampler = createSpectrumSampler(
    (meta) => deps.onSpectrumMeta?.(meta),
    (buffer, clipping) => deps.onSpectrumFrame?.(buffer, clipping),
  );
  const captureSession = createCaptureSession({
    acquireStream: (_tabId, streamId) =>
      navigator.mediaDevices.getUserMedia({
        audio: {
          mandatory: {
            chromeMediaSource: "tab",
            chromeMediaSourceId: streamId,
          },
        } as MediaTrackConstraints,
        video: false,
      }),
    createGraph: async (tabId, _streamId, stream) => {
      const settings = await chrome.storage.local.get([
        STORAGE_KEYS.FILTERS,
        STORAGE_KEYS.tabFilters(tabId),
        STORAGE_KEYS.tabGain(tabId),
        STORAGE_KEYS.tabMute(tabId),
        STORAGE_KEYS.ENABLE_VOLUME_COMPENSATION,
      ]);
      const tabFilters = readPersistedFilters(settings[STORAGE_KEYS.tabFilters(tabId)]);
      const defaultFilters = readPersistedFilters(settings[STORAGE_KEYS.FILTERS]);
      const source = deps.audioContext.createMediaStreamSource(stream);
      return createCaptureGraph({
        audioContext: deps.audioContext,
        source,
        enabled: true,
        gainValue: readStoredGain(settings[STORAGE_KEYS.tabGain(tabId)]),
        muted: settings[STORAGE_KEYS.tabMute(tabId)] === true,
        volumeCompensationEnabled: settings[STORAGE_KEYS.ENABLE_VOLUME_COMPENSATION] !== false,
        filterSettings: (tabFilters?.length
          ? tabFilters
          : defaultFilters?.length
            ? defaultFilters
            : deps.getFilters()
        ).filter(isEqualizerFilterEnabled),
        onBeforeOutputChange: (output) => {
          if (output === spectrumOutput) stopSpectrum();
        },
        onOutputChange: () => {
          if (spectrumEnabled && tabId === tabSettingsController.getActiveTabId()) {
            startSpectrum(tabId);
          }
        },
      });
    },
  });
  const captures = captureSession.captures;
  const tabSettingsController = createTabSettingsController({
    localStorage: chrome.storage.local,
    sessionStorage: chrome.storage.session,
    getPointCount: deps.getPointCount,
    getCapture: (tabId) => {
      const capture = captureSession.get(tabId);
      return capture
        ? {
            enabled: capture.graph.enabled,
            filterSettings: capture.graph.filterSettings,
          }
        : undefined;
    },
    updateCapture: (tabId, settings) => {
      captureSession.get(tabId)?.graph.update(settings);
    },
    setFilters: deps.setFilters,
    initPoints: deps.initPoints,
    resize: deps.resize,
    setGainValue: deps.setGainValue,
    setEnableButtonClass: deps.setEnableButtonClass,
    setMuteButtonClass: deps.setMuteButtonClass,
    renderCaptureError: deps.renderCaptureError,
    refreshCaptureFilters: (tabId) => refreshCaptureFilters(tabId),
    renderCapturedTabs: () => renderCapturedTabs(),
    restartSpectrum: (tabId) => startSpectrum(tabId),
  });

  if (isToolkitWindow) {
    deps.body.classList.add("toolkit-window-body");
  }

  const getCurrentTabId = async (): Promise<number | null> => {
    if (isToolkitWindow) {
      const activeTabId = tabSettingsController.getActiveTabId();
      if (activeTabId != null) return activeTabId;

      const stored = await chrome.storage.session.get(STORAGE_KEYS.TOOLKIT_WINDOW_ACTIVE_TAB_ID);
      const storedTabId =
        (stored[STORAGE_KEYS.TOOLKIT_WINDOW_ACTIVE_TAB_ID] as number | undefined) ?? null;
      tabSettingsController.setActiveTabId(storedTabId);
      return storedTabId;
    }

    const [tab] = await chrome.tabs.query({
      active: true,
      lastFocusedWindow: true,
    });
    const tabId = tab?.id ?? null;
    tabSettingsController.setActiveTabId(tabId);
    return tabId;
  };

  const shouldShowToolkitWindowNotice = async (currentTabId: number | null): Promise<boolean> => {
    if (isToolkitWindow || currentTabId == null) return false;

    const stored = await chrome.storage.session.get([
      STORAGE_KEYS.TOOLKIT_WINDOW_ID,
      STORAGE_KEYS.TOOLKIT_WINDOW_TAB_IDS,
    ]);
    const toolkitWindowTabIds = Array.isArray(stored[STORAGE_KEYS.TOOLKIT_WINDOW_TAB_IDS])
      ? (stored[STORAGE_KEYS.TOOLKIT_WINDOW_TAB_IDS] as number[])
      : [];
    return (
      stored[STORAGE_KEYS.TOOLKIT_WINDOW_ID] != null && toolkitWindowTabIds.includes(currentTabId)
    );
  };

  const showToolkitWindowNotice = (): void => {
    const notice = document.createElement("div");
    notice.className = "window-open-notice";
    notice.textContent =
      deps.getMessage("toolkit_window_already_open") || "Equalizer is already open in a window";

    deps.body.className = "window-open-notice-body";
    deps.body.replaceChildren(notice);
  };

  const getCaptureStreamIds = async (): Promise<Record<string, string>> => {
    const stored = await chrome.storage.session.get(STORAGE_KEYS.TOOLKIT_WINDOW_CAPTURE_STREAM_IDS);
    return (
      (stored[STORAGE_KEYS.TOOLKIT_WINDOW_CAPTURE_STREAM_IDS] as
        Record<string, string> | undefined) ?? {}
    );
  };

  const stopSpectrum = (): void => {
    spectrumSampler.stop();
    spectrumOutput = null;
  };

  const getCaptureFilterSettings = (
    tabId: number | string | null = tabSettingsController.getActiveTabId(),
  ): EqualizerFilter[] => {
    let filters: EqualizerFilter[];
    if (tabId != null && Number(tabId) === tabSettingsController.getActiveTabId()) {
      filters = deps.getFilters();
    } else {
      const capture = captures.get(String(tabId));
      filters = capture?.graph.filterSettings.length
        ? capture.graph.filterSettings
        : deps.getFilters();
    }

    return filters.filter((filter) => {
      return isEqualizerFilterEnabled(filter);
    });
  };

  const applyCaptureSettings = (
    tabId: number | string | null = tabSettingsController.getActiveTabId(),
  ): void => {
    const capture = captures.get(String(tabId));
    if (!capture) return;

    const settings: Parameters<CaptureGraph["update"]>[0] = {
      filterSettings: getCaptureFilterSettings(tabId),
    };
    if (Number(tabId) === tabSettingsController.getActiveTabId()) {
      settings.gainValue = deps.getGainValue();
      settings.muted = deps.isMuted();
    }
    capture.graph.update(settings);
  };

  const refreshCaptureFilters = (
    tabId: number | string | null = tabSettingsController.getActiveTabId(),
  ): void => {
    const capture = captures.get(String(tabId));
    if (!capture) return;

    const filterSettings = getCaptureFilterSettings(tabId);
    capture.graph.update({ filterSettings });

    if (spectrumEnabled && Number(tabId) === tabSettingsController.getActiveTabId()) {
      startSpectrum(tabId);
    }
  };

  function startSpectrum(
    tabId: number | string | null = tabSettingsController.getActiveTabId(),
  ): void {
    if (!isToolkitWindow || !spectrumEnabled || !spectrumDemand || tabId == null) {
      stopSpectrum();
      return;
    }

    const capture = captures.get(String(tabId));
    if (!capture) {
      stopSpectrum();
      return;
    }

    spectrumSampler.start(deps.audioContext, capture.graph.output);
    spectrumOutput = capture.graph.output;
  }

  const loadTabSettings = tabSettingsController.load;
  const reconcileSelectedTab = tabSettingsController.reconcile;
  const selectTab = tabSettingsController.select;

  const startTabCapture = async (): Promise<boolean> => {
    if (!isToolkitWindow) return false;
    const revision = ++captureStartRevision;
    const isCurrent = (): boolean => revision === captureStartRevision;
    spectrumDemand = true;

    const activeTabId = await getCurrentTabId();
    if (!isCurrent()) return false;
    const spectrumSettings = await chrome.storage.local.get([STORAGE_KEYS.ENABLE_SPECTRUM]);
    if (!isCurrent()) return false;
    const nextSpectrumEnabled = spectrumSettings[STORAGE_KEYS.ENABLE_SPECTRUM] === true;

    const streamIds = await getCaptureStreamIds();
    if (!isCurrent()) return false;
    const streamEntries = Object.entries(streamIds);

    try {
      await deps.audioContext.resume();
      if (!isCurrent()) return false;

      spectrumEnabled = nextSpectrumEnabled;
      await captureSession.sync(streamIds);
      if (!isCurrent()) return false;
      await Promise.all(
        streamEntries
          .filter(([tabId]) => captureSession.has(tabId))
          .map(([tabId]) => chrome.storage.local.remove(STORAGE_KEYS.tabCaptureError(tabId))),
      );
      if (!isCurrent()) return false;

      deps.renderCaptureError(null);
      deps.setEnableButtonClass(captures.get(String(activeTabId))?.graph.enabled === true);
      if (spectrumEnabled) {
        startSpectrum(activeTabId);
      } else {
        stopSpectrum();
      }
      return true;
    } catch (e) {
      if (!isCurrent()) return false;
      const tabId = await getCurrentTabId();
      if (!isCurrent()) return false;
      const message = e instanceof Error ? e.message : "Tab audio capture failed";
      if (tabId != null) {
        await chrome.storage.local.set({
          [STORAGE_KEYS.tabCaptureError(tabId)]: message,
        });
        if (!isCurrent()) return false;
      }
      deps.renderCaptureError(message);
      return true;
    }
  };

  capturedTabsView = createCapturedTabsView({
    root: deps.capturedTabs,
    isToolkitWindow,
    getMessage: deps.getMessage,
    onSelectTab: selectTab,
    onStopCapture: async (tabId) => {
      await stopCapturedTabCapture(tabId);
    },
  });

  const renderCapturedTabs = async (): Promise<void> => {
    await capturedTabsView?.render();
  };

  const stopTabCapture = (): void => {
    captureStartRevision += 1;
    spectrumDemand = false;
    spectrumSampler.dispose();
    spectrumOutput = null;
    captureSession.stop();
  };

  const stopCapturedTabCapture = async (tabId: number): Promise<void> => {
    if (!isToolkitWindow) return;
    captureStartRevision += 1;

    const activeTabId = tabSettingsController.getActiveTabId();
    if (activeTabId === tabId) {
      tabSettingsController.invalidate();
      stopSpectrum();
    }

    captureSession.stopTab(tabId);

    const stored = await chrome.storage.session.get([
      STORAGE_KEYS.TOOLKIT_WINDOW_TAB_IDS,
      STORAGE_KEYS.TOOLKIT_WINDOW_ACTIVE_TAB_ID,
      STORAGE_KEYS.TOOLKIT_WINDOW_CAPTURE_STREAM_IDS,
    ]);
    const remainingTabIds = Array.isArray(stored[STORAGE_KEYS.TOOLKIT_WINDOW_TAB_IDS])
      ? (stored[STORAGE_KEYS.TOOLKIT_WINDOW_TAB_IDS] as number[]).filter(
          (storedTabId) => storedTabId !== tabId,
        )
      : [];
    const streamIds = {
      ...((stored[STORAGE_KEYS.TOOLKIT_WINDOW_CAPTURE_STREAM_IDS] as
        Record<string, string> | undefined) ?? {}),
    };
    delete streamIds[tabId];

    const storedActiveTabId =
      (stored[STORAGE_KEYS.TOOLKIT_WINDOW_ACTIVE_TAB_ID] as number | undefined) ?? activeTabId;
    const nextActiveTabId =
      storedActiveTabId === tabId ? (remainingTabIds[0] ?? null) : storedActiveTabId;

    await chrome.storage.session.set({
      [STORAGE_KEYS.TOOLKIT_WINDOW_TAB_IDS]: remainingTabIds,
      [STORAGE_KEYS.TOOLKIT_WINDOW_ACTIVE_TAB_ID]: nextActiveTabId,
      [STORAGE_KEYS.TOOLKIT_WINDOW_CAPTURE_STREAM_IDS]: streamIds,
    });
    await reconcileSelectedTab();
  };

  const toggleEqualizer = (
    targetTabId: number | null = tabSettingsController.getActiveTabId(),
  ): void => {
    if (targetTabId == null) return;

    const capture = captures.get(String(targetTabId));
    if (!capture) return;

    capture.graph.update({ enabled: !capture.graph.enabled });
    if (targetTabId === tabSettingsController.getActiveTabId()) {
      deps.setEnableButtonClass(capture.graph.enabled);
    }
  };

  const hasCapture = (tabId: number): boolean => captures.has(String(tabId));

  const setCaptureMuted = (tabId: number, muted: boolean): void => {
    const capture = captures.get(String(tabId));
    if (!capture) return;
    capture.graph.update({ muted });
  };

  window.addEventListener("beforeunload", stopTabCapture);

  return {
    isToolkitWindow,
    getCurrentTabId,
    getResolvedTabId: tabSettingsController.getActiveTabId,
    shouldShowToolkitWindowNotice,
    showToolkitWindowNotice,
    loadTabSettings,
    selectTab,
    startTabCapture,
    renderCapturedTabs,
    refreshCaptureFilters,
    applyCaptureSettings,
    hasCapture,
    setCaptureMuted,
    toggleEqualizer,
    stopCapturedTabCapture,
    stopTabCapture,
    handleStorageChange: async (changes: Record<string, chrome.storage.StorageChange>) => {
      if (isToolkitWindow && changes[STORAGE_KEYS.TOOLKIT_WINDOW_ACTIVE_TAB_ID]) {
        await reconcileSelectedTab();
      }

      if (isToolkitWindow && changes[STORAGE_KEYS.TOOLKIT_WINDOW_CAPTURE_STREAM_IDS]) {
        if (await startTabCapture()) await renderCapturedTabs();
      }

      if (isToolkitWindow && changes[STORAGE_KEYS.ENABLE_SPECTRUM]) {
        spectrumEnabled = changes[STORAGE_KEYS.ENABLE_SPECTRUM].newValue === true;
        if (spectrumEnabled) {
          startSpectrum(tabSettingsController.getActiveTabId());
        } else {
          stopSpectrum();
        }
      }

      if (isToolkitWindow && changes[STORAGE_KEYS.ENABLE_VOLUME_COMPENSATION]) {
        const volumeCompensationEnabled =
          changes[STORAGE_KEYS.ENABLE_VOLUME_COMPENSATION].newValue !== false;
        captures.forEach((capture) => {
          capture.graph.update({ volumeCompensationEnabled });
        });
      }
    },
  };
};
