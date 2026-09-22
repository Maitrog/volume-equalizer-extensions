import { afterEach, describe, expect, test, vi } from "vitest";

import {
  RUNTIME_MESSAGES,
  TOOLKIT_SHORTCUT_ACTIONS,
} from "../../infrastructure/chrome/runtimeMessages";
import { STORAGE_KEYS } from "../../infrastructure/chrome/storageKeys";
import { DEFAULT_SHORTCUTS } from "../../domains/shortcuts/shortcuts";
import { attachPopupSubscriptions } from "./popupSubscriptions";

const createEvent = <T extends (...args: never[]) => void>() => {
  const listeners = new Set<T>();
  return {
    addListener: vi.fn((listener: T) => listeners.add(listener)),
    removeListener: vi.fn((listener: T) => listeners.delete(listener)),
    fire: (...args: Parameters<T>) => {
      [...listeners].forEach((listener) => listener(...args));
    },
  };
};

const createDomTarget = <T extends Event>() => {
  const listeners = new Map<string, Set<(event: T) => void>>();
  return {
    addEventListener: vi.fn((type: string, listener: (event: T) => void) => {
      const registered = listeners.get(type) ?? new Set();
      registered.add(listener);
      listeners.set(type, registered);
    }),
    removeEventListener: vi.fn((type: string, listener: (event: T) => void) => {
      listeners.get(type)?.delete(listener);
    }),
    fire: (type: string, event: T) => {
      [...(listeners.get(type) ?? [])].forEach((listener) => listener(event));
    },
  };
};

const createPort = () => {
  const onMessage = createEvent<(message: unknown) => void>();
  const onDisconnect = createEvent<() => void>();
  return {
    onMessage,
    onDisconnect,
    postMessage: vi.fn(),
    disconnect: vi.fn(),
  };
};

const setup = () => {
  const runtimeMessage =
    createEvent<(message: unknown, sender: chrome.runtime.MessageSender) => void>();
  const storageChange =
    createEvent<(changes: Record<string, chrome.storage.StorageChange>) => void>();
  const documentTarget = createDomTarget<KeyboardEvent>();
  const windowTarget = createDomTarget<PageTransitionEvent>();
  const port = createPort();
  const connect = vi.fn(() => port as unknown as chrome.runtime.Port);
  vi.stubGlobal("chrome", {
    runtime: { onMessage: runtimeMessage, connect },
    storage: { onChanged: storageChange },
  });
  vi.stubGlobal("document", documentTarget);
  vi.stubGlobal("window", windowTarget);
  const callbacks = {
    handleToolkitStorageChange: vi.fn(() => Promise.resolve()),
    renderAutostartWhitelist: vi.fn(() => Promise.resolve()),
    refreshAutostartPresetSelects: vi.fn(() => Promise.resolve()),
    refreshPresetDropdown: vi.fn(() => Promise.resolve()),
    getCurrentTabId: vi.fn(() => Promise.resolve(12)),
    isTabCaptured: vi.fn(() => false),
    setEnableButtonClass: vi.fn(),
    setMuteButtonClass: vi.fn(),
    renderCaptureError: vi.fn(),
    getShortcutSettings: vi.fn(() => DEFAULT_SHORTCUTS),
    toggleMute: vi.fn(() => Promise.resolve()),
    toggleEqualizer: vi.fn(() => Promise.resolve()),
    onSpectrumMeta: vi.fn(),
    onSpectrumFrame: vi.fn(),
    onResize: vi.fn(),
    onPagehide: vi.fn(),
  };
  const subscriptions = attachPopupSubscriptions({
    ...callbacks,
  });
  return {
    subscriptions,
    callbacks,
    runtimeMessage,
    storageChange,
    documentTarget,
    windowTarget,
    port,
    connect,
  };
};

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("popup subscriptions", () => {
  test("routes events before disposal and ignores them afterward", async () => {
    const { subscriptions, callbacks, storageChange, documentTarget } = setup();
    storageChange.fire({
      [STORAGE_KEYS.AUTOSTART_RULES]: { newValue: [] },
    });
    const keydown = {
      repeat: false,
      target: null,
      altKey: true,
      ctrlKey: false,
      shiftKey: false,
      metaKey: false,
      key: "m",
      code: "KeyM",
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as KeyboardEvent;
    documentTarget.fire("keydown", keydown);
    await Promise.resolve();
    await Promise.resolve();

    expect(callbacks.toggleMute).toHaveBeenCalledTimes(1);
    expect(callbacks.renderAutostartWhitelist).toHaveBeenCalledOnce();
    expect(keydown.preventDefault).toHaveBeenCalledOnce();

    subscriptions.dispose();
    subscriptions.dispose();
    storageChange.fire({
      [STORAGE_KEYS.AUTOSTART_RULES]: { newValue: [] },
    });
    documentTarget.fire("keydown", keydown);
    await Promise.resolve();

    expect(callbacks.toggleMute).toHaveBeenCalledTimes(1);
    expect(callbacks.renderAutostartWhitelist).toHaveBeenCalledOnce();
  });

  test("leaves captured tab shortcuts to the background", async () => {
    const { subscriptions, callbacks, runtimeMessage } = setup();

    runtimeMessage.fire(
      {
        method: RUNTIME_MESSAGES.TOOLKIT_SHORTCUT,
        payload: { action: TOOLKIT_SHORTCUT_ACTIONS.MUTE },
      },
      { tab: { id: 12 } } as chrome.runtime.MessageSender,
    );
    await Promise.resolve();

    expect(callbacks.toggleMute).not.toHaveBeenCalled();
    expect(callbacks.toggleEqualizer).not.toHaveBeenCalled();
    subscriptions.dispose();
  });

  test("blocks late async work and clears a pending port reconnect", async () => {
    vi.useFakeTimers();
    const { subscriptions, callbacks, storageChange, port, connect } = setup();
    const storageHandled = deferred<void>();
    callbacks.handleToolkitStorageChange.mockReturnValueOnce(storageHandled.promise);
    storageChange.fire({
      [STORAGE_KEYS.PRESET_NAMES]: { newValue: ["custom"] },
    });
    subscriptions.connectSpectrum(12);
    port.onDisconnect.fire();

    subscriptions.dispose();
    storageHandled.resolve();
    await Promise.resolve();
    vi.advanceTimersByTime(100);

    expect(callbacks.refreshAutostartPresetSelects).not.toHaveBeenCalled();
    expect(callbacks.refreshPresetDropdown).not.toHaveBeenCalled();
    expect(connect).toHaveBeenCalledOnce();
  });

  test("does not let a late tabEnabled write override an active capture button", async () => {
    const { subscriptions, callbacks, storageChange } = setup();
    callbacks.isTabCaptured.mockReturnValue(true);
    storageChange.fire({
      [STORAGE_KEYS.tabEnabled(12)]: { newValue: false, oldValue: true },
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(callbacks.setEnableButtonClass).not.toHaveBeenCalled();
    subscriptions.dispose();
  });

  test("hides the capture error when a removal reports no new value", async () => {
    const { subscriptions, callbacks, storageChange } = setup();
    storageChange.fire({
      [STORAGE_KEYS.tabCaptureError(12)]: {
        oldValue: "Audio capture failed",
        newValue: undefined,
      },
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(callbacks.renderCaptureError).toHaveBeenCalledWith(null);
    subscriptions.dispose();
  });

  test("pairs spectrum frames with current metadata", () => {
    const { subscriptions, callbacks, port } = setup();
    subscriptions.connectSpectrum(12);
    const meta = {
      type: "meta" as const,
      sampleRate: 48000,
      fftSize: 2048,
      minDb: -100,
      maxDb: -30,
      frequencyBinCount: 1024,
    };

    port.onMessage.fire({
      tabId: 12,
      source: { kind: "content", frameId: 3 },
      payload: { type: "spectrum", buffer: [-42], clipping: false },
    });
    port.onMessage.fire({
      tabId: 13,
      source: { kind: "content", frameId: 3 },
      payload: meta,
    });
    expect(callbacks.onSpectrumFrame).not.toHaveBeenCalled();

    port.onMessage.fire({ tabId: 12, source: { kind: "content", frameId: 3 }, payload: meta });
    port.onMessage.fire({
      tabId: 12,
      source: { kind: "content", frameId: 3 },
      payload: { type: "spectrum", buffer: [-42], clipping: true },
    });
    port.onMessage.fire({
      tabId: 12,
      source: { kind: "content", frameId: 3 },
      payload: { type: "spectrum", buffer: null, clipping: false },
    });
    port.onMessage.fire({
      tabId: 12,
      source: { kind: "content", frameId: 3 },
      payload: { type: "spectrum", buffer: [-30], clipping: false },
    });

    expect(callbacks.onSpectrumMeta).toHaveBeenCalledWith(meta);
    expect(callbacks.onSpectrumFrame.mock.calls).toEqual([
      [[-42], true],
      [null, false],
    ]);
    subscriptions.dispose();
  });

  test("switches between content and capture sources and follows the new metadata", () => {
    const { subscriptions, callbacks, port } = setup();
    subscriptions.connectSpectrum(12);
    const meta = {
      type: "meta" as const,
      sampleRate: 48000,
      fftSize: 2048,
      minDb: -100,
      maxDb: -30,
      frequencyBinCount: 1024,
    };
    const captureSource = { kind: "capture" as const };

    port.onMessage.fire({
      tabId: 12,
      source: { kind: "content", frameId: 1 },
      payload: meta,
    });
    port.onMessage.fire({
      tabId: 12,
      source: { kind: "content", frameId: 1 },
      payload: { type: "spectrum", buffer: [-40], clipping: false },
    });
    port.onMessage.fire({ tabId: 12, source: captureSource, payload: meta });
    port.onMessage.fire({
      tabId: 12,
      source: { kind: "content", frameId: 1 },
      payload: { type: "spectrum", buffer: [-10], clipping: false },
    });
    port.onMessage.fire({
      tabId: 12,
      source: captureSource,
      payload: { type: "spectrum", buffer: [-20], clipping: false },
    });

    expect(callbacks.onSpectrumMeta).toHaveBeenCalledTimes(2);
    expect(callbacks.onSpectrumFrame.mock.calls).toEqual([
      [[-40], false],
      [[-20], false],
    ]);
    subscriptions.dispose();
  });

  test("runs composed page cleanup once and disconnects an active port", () => {
    const canvasCleanup = vi.fn();
    const stopCapture = vi.fn();
    const flushFilters = vi.fn(() => Promise.resolve());
    const setupResult = setup();
    const { subscriptions, callbacks, windowTarget, port } = setupResult;
    const disposeApp = vi.fn(() => {
      subscriptions.dispose();
      canvasCleanup();
      stopCapture();
      void flushFilters();
    });
    callbacks.onPagehide.mockImplementation(disposeApp);
    subscriptions.connectSpectrum(12);

    windowTarget.fire("pagehide", {} as PageTransitionEvent);
    windowTarget.fire("pagehide", {} as PageTransitionEvent);
    subscriptions.dispose();

    expect(disposeApp).toHaveBeenCalledOnce();
    expect(port.disconnect).toHaveBeenCalledOnce();
    expect(canvasCleanup).toHaveBeenCalledOnce();
    expect(stopCapture).toHaveBeenCalledOnce();
    expect(flushFilters).toHaveBeenCalledOnce();
  });

  test("reports rejected listener work", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const { subscriptions, callbacks, documentTarget, storageChange } = setup();
    const shortcutFailure = new Error("shortcut failed");
    const storageFailure = new Error("storage failed");
    callbacks.toggleMute.mockRejectedValueOnce(shortcutFailure);
    callbacks.handleToolkitStorageChange.mockRejectedValueOnce(storageFailure);
    const keydown = {
      repeat: false,
      target: null,
      altKey: true,
      ctrlKey: false,
      shiftKey: false,
      metaKey: false,
      key: "m",
      code: "KeyM",
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as KeyboardEvent;

    documentTarget.fire("keydown", keydown);
    storageChange.fire({
      [STORAGE_KEYS.AUTOSTART_RULES]: { newValue: [] },
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(consoleError).toHaveBeenCalledWith("Failed to apply mute shortcut", {
      operation: "apply mute shortcut",
      error: shortcutFailure,
    });
    expect(consoleError).toHaveBeenCalledWith("Failed to handle popup storage change", {
      operation: "handle popup storage change",
      error: storageFailure,
    });
    subscriptions.dispose();
  });
});

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
