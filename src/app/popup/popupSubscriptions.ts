import {
  isEditableShortcutTarget,
  matchesShortcut,
  SHORTCUT_ACTION_MUTE_NAME,
  SHORTCUT_ACTION_TOGGLE_EQ_NAME,
  type ShortcutMap,
} from "../../domains/shortcuts/shortcuts";
import {
  isSameSpectrumSource,
  SPECTRUM_PORT_NAME,
  type RelayedSpectrumMessage,
  type SpectrumMetaPayload,
  type SpectrumSource,
} from "../../infrastructure/chrome/runtimeMessages";
import { STORAGE_KEYS } from "../../infrastructure/chrome/storageKeys";

export const attachPopupSubscriptions = (deps: {
  handleToolkitStorageChange(changes: Record<string, chrome.storage.StorageChange>): Promise<void>;
  renderAutostartWhitelist(): Promise<void>;
  refreshAutostartPresetSelects(): Promise<void>;
  refreshPresetDropdown(): Promise<void>;
  getCurrentTabId(): Promise<number | null>;
  isTabCaptured(tabId: number): boolean;
  setEnableButtonClass(enabled: boolean): void;
  setMuteButtonClass(muted: boolean): void;
  renderCaptureError(message: string | null): void;
  getShortcutSettings(): ShortcutMap;
  toggleMute(tabId?: number): Promise<void>;
  toggleEqualizer(tabId?: number): Promise<void>;
  onSpectrumMeta(meta: SpectrumMetaPayload): void;
  onSpectrumFrame(buffer: number[] | null, clipping: boolean): void;
  onResize(): void;
  onPagehide(): void;
}) => {
  let disposed = false;
  let activeSource: SpectrumSource | null = null;
  let spectrumTabId: number | null = null;
  let currentPort: chrome.runtime.Port | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  const reportFailure = (operation: string, error: unknown): void => {
    console.error(`Failed to ${operation}`, { operation, error });
  };

  const onKeydown = (event: KeyboardEvent): void => {
    if (disposed || event.repeat || isEditableShortcutTarget(event.target)) {
      return;
    }
    const shortcuts = deps.getShortcutSettings();
    if (matchesShortcut(event, shortcuts[SHORTCUT_ACTION_MUTE_NAME])) {
      event.preventDefault();
      event.stopPropagation();
      void deps.toggleMute().catch((error: unknown) => {
        reportFailure("apply mute shortcut", error);
      });
      return;
    }
    if (matchesShortcut(event, shortcuts[SHORTCUT_ACTION_TOGGLE_EQ_NAME])) {
      event.preventDefault();
      event.stopPropagation();
      void deps.toggleEqualizer().catch((error: unknown) => {
        reportFailure("apply equalizer shortcut", error);
      });
    }
  };

  const onStorageChange = (changes: Record<string, chrome.storage.StorageChange>): void => {
    if (disposed) return;
    void (async () => {
      await deps.handleToolkitStorageChange(changes);
      if (disposed) return;
      if (changes[STORAGE_KEYS.AUTOSTART_RULES]) {
        await deps.renderAutostartWhitelist();
        if (disposed) return;
      }
      if (changes[STORAGE_KEYS.PRESET_NAMES] || changes[STORAGE_KEYS.HIDE_DEFAULT_PRESETS]) {
        await deps.refreshAutostartPresetSelects();
        if (disposed) return;
        await deps.refreshPresetDropdown();
        if (disposed) return;
      }

      const tabId = await deps.getCurrentTabId();
      if (disposed || tabId == null) return;
      if (changes[STORAGE_KEYS.tabEnabled(tabId)] && !deps.isTabCaptured(tabId)) {
        deps.setEnableButtonClass(changes[STORAGE_KEYS.tabEnabled(tabId)].newValue === true);
      }
      if (changes[STORAGE_KEYS.tabMute(tabId)]) {
        deps.setMuteButtonClass(changes[STORAGE_KEYS.tabMute(tabId)].newValue === true);
      }
      if (changes[STORAGE_KEYS.tabCaptureError(tabId)]) {
        const error = changes[STORAGE_KEYS.tabCaptureError(tabId)].newValue;
        deps.renderCaptureError(typeof error === "string" ? error : null);
      }
    })().catch((error: unknown) => {
      reportFailure("handle popup storage change", error);
    });
  };

  const onPagehide = (): void => {
    if (disposed) return;
    dispose();
    try {
      deps.onPagehide();
    } catch (error) {
      reportFailure("dispose popup", error);
    }
  };

  const onResize = (): void => {
    if (disposed) return;
    try {
      deps.onResize();
    } catch (error) {
      reportFailure("resize popup", error);
    }
  };

  const connectPort = (): void => {
    if (disposed || spectrumTabId == null) return;
    const tabId = spectrumTabId;
    const port = chrome.runtime.connect(undefined, {
      name: SPECTRUM_PORT_NAME,
    });
    currentPort = port;
    port.onMessage.addListener((value: unknown) => {
      if (disposed || currentPort !== port || !value || typeof value !== "object") {
        return;
      }
      const message = value as Partial<RelayedSpectrumMessage>;
      const source = message.source;
      const payload = message.payload;
      if (message.tabId !== tabId || !source || !payload) return;
      if (payload.type === "meta") {
        activeSource = source;
        deps.onSpectrumMeta(payload);
        return;
      }
      if (payload.type !== "spectrum") return;
      if (activeSource === null || !isSameSpectrumSource(source, activeSource)) return;
      deps.onSpectrumFrame(payload.buffer, payload.clipping);
      if (payload.buffer === null) activeSource = null;
    });
    port.onDisconnect.addListener(() => {
      if (disposed || currentPort !== port) return;
      currentPort = null;
      activeSource = null;
      deps.onSpectrumFrame(null, false);
      reconnectTimer = setTimeout(connectPort, 100);
    });
    port.postMessage({ type: "subscribe", tabId });
  };

  const connectSpectrum = (tabId: number): void => {
    if (disposed) return;
    if (reconnectTimer !== null) clearTimeout(reconnectTimer);
    reconnectTimer = null;
    const previousPort = currentPort;
    currentPort = null;
    previousPort?.disconnect();
    activeSource = null;
    spectrumTabId = tabId;
    connectPort();
  };

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    chrome.storage.onChanged.removeListener(onStorageChange);
    document.removeEventListener("keydown", onKeydown);
    window.removeEventListener("resize", onResize);
    window.removeEventListener("pagehide", onPagehide);
    if (reconnectTimer !== null) clearTimeout(reconnectTimer);
    reconnectTimer = null;
    spectrumTabId = null;
    activeSource = null;
    const port = currentPort;
    currentPort = null;
    port?.disconnect();
  };

  chrome.storage.onChanged.addListener(onStorageChange);
  document.addEventListener("keydown", onKeydown);
  window.addEventListener("resize", onResize);
  window.addEventListener("pagehide", onPagehide);

  return {
    connectSpectrum,
    dispose,
  };
};
