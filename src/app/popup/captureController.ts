import type { EqualizerFilter } from "../../domains/equalizer/types";
import type { CaptureReply } from "../../infrastructure/chrome/runtimeMessages";
import { isTabId, RUNTIME_MESSAGES } from "../../infrastructure/chrome/runtimeMessages";
import { STORAGE_KEYS } from "../../infrastructure/chrome/storageKeys";
import { createTabSettingsController } from "./tabSettingsController";

export interface CapturedTabSnapshot {
  id: number;
  title?: string;
  url?: string;
  favIconUrl?: string;
  enabled: boolean;
}

export interface CapturedTabsSnapshot {
  tabs: CapturedTabSnapshot[];
  activeTabId: number | null;
}

const normalizeCapturedTabs = (value: unknown): CapturedTabsSnapshot => {
  if (!value || typeof value !== "object") return { tabs: [], activeTabId: null };
  const candidate = value as { tabs?: unknown; activeTabId?: unknown };
  const tabs = Array.isArray(candidate.tabs)
    ? candidate.tabs.flatMap((entry): CapturedTabSnapshot[] => {
        if (!entry || typeof entry !== "object") return [];
        const tab = entry as Record<string, unknown>;
        if (!isTabId(tab.id)) return [];
        return [
          {
            id: tab.id,
            title: typeof tab.title === "string" ? tab.title : undefined,
            url: typeof tab.url === "string" ? tab.url : undefined,
            favIconUrl: typeof tab.favIconUrl === "string" ? tab.favIconUrl : undefined,
            enabled: tab.enabled === true,
          },
        ];
      })
    : [];
  return {
    tabs,
    activeTabId: isTabId(candidate.activeTabId) ? candidate.activeTabId : null,
  };
};

export const requestTabCapture = async (tabId: number): Promise<CaptureReply> => {
  try {
    const response = (await chrome.runtime.sendMessage({
      method: RUNTIME_MESSAGES.START_TAB_CAPTURE,
      tabId,
    })) as CaptureReply | undefined;
    if (response?.ok === true) return response;
    return {
      ok: false,
      error: response?.ok === false ? response.error : "Invalid tab capture response",
    };
  } catch (error) {
    console.error("Failed to start tab capture", { tabId, error });
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
};

const requestStopTabCapture = async (tabId: number): Promise<CaptureReply> => {
  try {
    const response = (await chrome.runtime.sendMessage({
      method: RUNTIME_MESSAGES.STOP_TAB_CAPTURE,
      tabId,
    })) as CaptureReply | undefined;
    if (response?.ok === true) return response;
    return {
      ok: false,
      error: response?.ok === false ? response.error : "Invalid tab capture response",
    };
  } catch (error) {
    console.error("Failed to stop tab capture", { tabId, error });
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
};

export interface CaptureControllerDependencies {
  getPointCount(): Promise<number>;
  setFilters(filters: EqualizerFilter[]): void;
  initPoints(count: number): void;
  resize(): void;
  setGainValue(value: number): void;
  setEnableButtonClass(enabled: boolean): void;
  setMuteButtonClass(muted: boolean): void;
  renderCaptureError(message: string | null): void;
  renderTabCaptureError(): void;
  renderTabCaptureStopError(): void;
  onSpectrumTabChange(tabId: number | null): void;
  renderCapturedTabs(): Promise<void>;
}

const queryActiveBrowserTabId = async (): Promise<number | null> => {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab?.id ?? null;
};

export const createCaptureController = (deps: CaptureControllerDependencies) => {
  const captureEnabled = new Map<number, boolean>();
  let starting = false;

  const settings = createTabSettingsController({
    localStorage: chrome.storage.local,
    sessionStorage: chrome.storage.session,
    getPointCount: deps.getPointCount,
    getCapture: (tabId) =>
      captureEnabled.has(tabId)
        ? { enabled: captureEnabled.get(tabId) === true, filterSettings: [] }
        : undefined,
    // Background applies storage-backed settings to the offscreen session.
    updateCapture: () => undefined,
    setFilters: deps.setFilters,
    initPoints: deps.initPoints,
    resize: deps.resize,
    setGainValue: deps.setGainValue,
    setEnableButtonClass: deps.setEnableButtonClass,
    setMuteButtonClass: deps.setMuteButtonClass,
    renderCaptureError: deps.renderCaptureError,
    refreshCaptureFilters: () => undefined,
    renderCapturedTabs: deps.renderCapturedTabs,
    restartSpectrum: deps.onSpectrumTabChange,
  });

  const readSnapshot = async (): Promise<CapturedTabsSnapshot> => {
    const response = await chrome.runtime.sendMessage({
      method: RUNTIME_MESSAGES.GET_CAPTURED_TABS,
    });
    const snapshot = normalizeCapturedTabs(response);
    captureEnabled.clear();
    for (const tab of snapshot.tabs) captureEnabled.set(tab.id, tab.enabled);
    return snapshot;
  };

  const isTabCaptured = (tabId: number | null): boolean =>
    tabId != null && captureEnabled.has(tabId);

  const getSelectedTabId = (): number | null => settings.getActiveTabId();

  const selectCurrentBrowserTab = async (): Promise<void> => {
    const browserTabId = await queryActiveBrowserTabId();
    await settings.load(browserTabId);
  };

  const init = async (): Promise<CapturedTabsSnapshot> => {
    const snapshot = await readSnapshot();
    await selectCurrentBrowserTab();
    return snapshot;
  };

  const syncSnapshot = async (): Promise<CapturedTabsSnapshot> => {
    const snapshot = await readSnapshot();
    await deps.renderCapturedTabs();
    return snapshot;
  };

  const startCapture = async (): Promise<CaptureReply> => {
    if (starting) return { ok: false, error: "capture-start-pending" };
    starting = true;
    try {
      const tabId = await queryActiveBrowserTabId();
      if (tabId == null) {
        deps.renderTabCaptureError();
        return { ok: false, error: "No active tab" };
      }

      const reply = await requestTabCapture(tabId);
      if (!reply.ok) {
        deps.renderTabCaptureError();
        return reply;
      }

      deps.renderCaptureError(null);
      captureEnabled.set(tabId, true);
      await settings.select(tabId);
      await deps.renderCapturedTabs();
      return { ok: true, captures: reply.captures };
    } finally {
      starting = false;
    }
  };

  const stopCapture = async (tabId: number): Promise<void> => {
    const reply = await requestStopTabCapture(tabId);
    if (!reply.ok) {
      deps.renderTabCaptureStopError();
      return;
    }
    captureEnabled.delete(tabId);
    if (settings.getActiveTabId() === tabId) await selectCurrentBrowserTab();
    await syncSnapshot();
  };

  const selectTab = async (tabId: number): Promise<void> => {
    await settings.select(tabId);
  };

  const toggleCaptureEnabled = async (tabId: number): Promise<void> => {
    try {
      const response = (await chrome.runtime.sendMessage({
        method: RUNTIME_MESSAGES.TOGGLE_CAPTURE_ENABLED,
        tabId,
      })) as { ok?: boolean; error?: string } | undefined;
      if (response?.ok !== true) {
        deps.renderCaptureError(response?.error ?? "Failed to toggle capture");
        return;
      }
      const next = captureEnabled.get(tabId) !== true;
      captureEnabled.set(tabId, next);
      if (settings.getActiveTabId() === tabId) deps.setEnableButtonClass(next);
    } catch (error) {
      deps.renderCaptureError(error instanceof Error ? error.message : String(error));
    }
  };

  const handleStorageChange = async (
    changes: Record<string, chrome.storage.StorageChange>,
  ): Promise<void> => {
    if (!changes || typeof changes !== "object") return;

    if (changes[STORAGE_KEYS.CAPTURE_ACTIVE_TAB_ID]) {
      await settings.reconcile();
    }

    if (changes[STORAGE_KEYS.CAPTURE_TAB_IDS] || changes[STORAGE_KEYS.CAPTURE_ACTIVE_TAB_ID]) {
      await readSnapshot();
      const selected = settings.getActiveTabId();
      if (selected != null && !captureEnabled.has(selected)) {
        await selectCurrentBrowserTab();
      } else if (selected != null) {
        deps.setEnableButtonClass(captureEnabled.get(selected) === true);
      }
      await deps.renderCapturedTabs();
    }
  };

  return {
    init,
    startCapture,
    stopCapture,
    selectTab,
    toggleCaptureEnabled,
    handleStorageChange,
    isTabCaptured,
    getSelectedTabId,
    syncSnapshot,
  };
};
