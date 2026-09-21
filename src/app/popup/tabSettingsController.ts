import { readStoredGain } from "../../domains/equalizer/persistedGain";
import { readPersistedFilters } from "../../domains/equalizer/persistedFilters";
import type { EqualizerFilter } from "../../domains/equalizer/types";
import { STORAGE_KEYS } from "../../infrastructure/chrome/storageKeys";

interface CaptureSettings {
  enabled: boolean;
  filterSettings: EqualizerFilter[];
}

interface CaptureSettingsUpdate {
  filterSettings: EqualizerFilter[];
  gainValue: number;
  muted: boolean;
}

export const createTabSettingsController = (deps: {
  localStorage: chrome.storage.StorageArea;
  sessionStorage: chrome.storage.StorageArea;
  getPointCount(): Promise<number>;
  getCapture(tabId: number): CaptureSettings | undefined;
  updateCapture(tabId: number, settings: CaptureSettingsUpdate): void;
  setFilters(filters: EqualizerFilter[]): void;
  initPoints(count: number): void;
  resize(): void;
  setGainValue(value: number): void;
  setEnableButtonClass(enabled: boolean): void;
  setMuteButtonClass(muted: boolean): void;
  renderCaptureError(message: string | null): void;
  refreshCaptureFilters(tabId: number): void;
  renderCapturedTabs(): Promise<void>;
  restartSpectrum(tabId: number | null): void;
}) => {
  let activeTabId: number | null = null;
  let settingsGeneration = 0;
  let selectionWrites = 0;
  let selectionReadGeneration = 0;
  let selectionWriteChain = Promise.resolve();

  const load = async (tabId: number | null): Promise<boolean> => {
    const generation = ++settingsGeneration;
    activeTabId = tabId;
    if (tabId == null) return true;

    const result = await deps.localStorage.get([
      STORAGE_KEYS.FILTERS,
      STORAGE_KEYS.tabFilters(tabId),
      STORAGE_KEYS.tabGain(tabId),
      STORAGE_KEYS.tabMute(tabId),
      STORAGE_KEYS.tabCaptureError(tabId),
    ]);
    const tabFilters = readPersistedFilters(result[STORAGE_KEYS.tabFilters(tabId)]);
    const defaultFilters = readPersistedFilters(result[STORAGE_KEYS.FILTERS]);
    const filters = tabFilters?.length
      ? tabFilters
      : defaultFilters?.length
        ? defaultFilters
        : null;
    const pointCount = filters ? null : await deps.getPointCount();
    if (generation !== settingsGeneration) return false;

    const gainValue = readStoredGain(result[STORAGE_KEYS.tabGain(tabId)]);
    const muted = result[STORAGE_KEYS.tabMute(tabId)] === true;
    const capture = deps.getCapture(tabId);
    if (capture) {
      deps.updateCapture(tabId, {
        filterSettings: filters ?? capture.filterSettings,
        gainValue,
        muted,
      });
    }

    deps.setGainValue(gainValue);
    if (filters) deps.setFilters(filters);
    else deps.initPoints(pointCount as number);
    deps.resize();
    deps.setEnableButtonClass(capture?.enabled === true);
    deps.setMuteButtonClass(muted);
    deps.renderCaptureError(
      typeof result[STORAGE_KEYS.tabCaptureError(tabId)] === "string"
        ? (result[STORAGE_KEYS.tabCaptureError(tabId)] as string)
        : null,
    );
    deps.refreshCaptureFilters(tabId);
    return true;
  };

  const reconcile = async (): Promise<void> => {
    const readGeneration = ++selectionReadGeneration;
    if (selectionWrites > 0) return;
    const generation = settingsGeneration;
    const stored = await deps.sessionStorage.get(STORAGE_KEYS.TOOLKIT_WINDOW_ACTIVE_TAB_ID);
    if (
      selectionWrites > 0 ||
      generation !== settingsGeneration ||
      readGeneration !== selectionReadGeneration
    ) {
      return;
    }
    const tabId = (stored[STORAGE_KEYS.TOOLKIT_WINDOW_ACTIVE_TAB_ID] as number | undefined) ?? null;
    if (tabId === activeTabId) return;
    if (!(await load(tabId))) return;
    const appliedGeneration = settingsGeneration;
    await deps.renderCapturedTabs();
    if (appliedGeneration !== settingsGeneration) return;
    deps.restartSpectrum(activeTabId);
  };

  const select = async (tabId: number): Promise<void> => {
    const loading = load(tabId);
    selectionWrites++;
    const writing = selectionWriteChain.then(() =>
      deps.sessionStorage.set({
        [STORAGE_KEYS.TOOLKIT_WINDOW_ACTIVE_TAB_ID]: tabId,
      }),
    );
    selectionWriteChain = writing.then(
      () => undefined,
      () => undefined,
    );
    let applied: boolean;
    try {
      const [loaded] = await Promise.all([loading, writing]);
      applied = loaded;
    } finally {
      selectionWrites--;
    }
    if (!applied) return;
    const appliedGeneration = settingsGeneration;
    await reconcile();
    if (appliedGeneration !== settingsGeneration) return;
    await deps.renderCapturedTabs();
    if (appliedGeneration !== settingsGeneration) return;
    deps.restartSpectrum(activeTabId);
  };

  return {
    getActiveTabId: (): number | null => activeTabId,
    setActiveTabId: (tabId: number | null): void => {
      if (tabId === activeTabId) return;
      activeTabId = tabId;
      settingsGeneration++;
      selectionReadGeneration++;
    },
    load,
    reconcile,
    select,
    invalidate: (): void => {
      settingsGeneration++;
      selectionReadGeneration++;
    },
  };
};
