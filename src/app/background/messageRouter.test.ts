import { beforeEach, describe, expect, test, vi } from "vitest";

import { RUNTIME_MESSAGES } from "../../infrastructure/chrome/runtimeMessages";
import { STORAGE_KEYS } from "../../infrastructure/chrome/storageKeys";
import { createRuntimeMessageHandler } from "./messageRouter";

const createChromeMock = () => {
  const localSet = vi.fn();
  const sessionGet = vi.fn();
  const sessionSet = vi.fn();
  const setBadgeText = vi.fn().mockResolvedValue(undefined);

  vi.stubGlobal("chrome", {
    action: {
      setBadgeText,
    },
    storage: {
      local: {
        set: localSet,
      },
      session: {
        get: sessionGet,
        set: sessionSet,
      },
    },
  });

  return {
    localSet,
    sessionGet,
    sessionSet,
    setBadgeText,
  };
};

const flushPromises = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

describe("createRuntimeMessageHandler", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test("returns captured tabs asynchronously", async () => {
    createChromeMock();
    const capturedTabs = {
      tabs: [{ id: 12, title: "Example", url: "https://example.com" }],
      activeTabId: 12,
    };
    const response = vi.fn();
    const handler = createRuntimeMessageHandler({
      applyAutostartForTab: vi.fn(),
      applyToolkitShortcut: vi.fn(() => true),
      clearUnusedStorage: vi.fn(),
      getCapturedTabs: vi.fn().mockResolvedValue(capturedTabs),
      acceptSpectrumFrame: vi.fn(),
      restoreSpectrumDemand: vi.fn(),
      startCapture: vi.fn(),
      stopCapture: vi.fn(),
      handleCaptureEnded: vi.fn(),
    });

    const result = handler({ method: RUNTIME_MESSAGES.GET_CAPTURED_TABS }, {}, response);
    await flushPromises();

    expect(result).toBe(true);
    expect(response).toHaveBeenCalledWith(capturedTabs);
  });

  test("falls back to empty captured tabs when retrieval fails", async () => {
    createChromeMock();
    const response = vi.fn();
    const handler = createRuntimeMessageHandler({
      applyAutostartForTab: vi.fn(),
      applyToolkitShortcut: vi.fn(() => true),
      clearUnusedStorage: vi.fn(),
      getCapturedTabs: vi.fn().mockRejectedValue(new Error("gone")),
      acceptSpectrumFrame: vi.fn(),
      restoreSpectrumDemand: vi.fn(),
      startCapture: vi.fn(),
      stopCapture: vi.fn(),
      handleCaptureEnded: vi.fn(),
    });

    const result = handler({ method: RUNTIME_MESSAGES.GET_CAPTURED_TABS }, {}, response);
    await flushPromises();

    expect(result).toBe(true);
    expect(response).toHaveBeenCalledWith({ tabs: [], activeTabId: null });
  });

  test("responds with the sender tab id without registering it", () => {
    const chromeMock = createChromeMock();
    const response = vi.fn();
    const handler = createRuntimeMessageHandler({
      applyAutostartForTab: vi.fn(),
      applyToolkitShortcut: vi.fn(() => true),
      clearUnusedStorage: vi.fn(),
      getCapturedTabs: vi.fn(),
      acceptSpectrumFrame: vi.fn(),
      restoreSpectrumDemand: vi.fn(),
      startCapture: vi.fn(),
      stopCapture: vi.fn(),
      handleCaptureEnded: vi.fn(),
    });

    const result = handler(
      { method: RUNTIME_MESSAGES.GET_TAB_ID },
      { tab: { id: 7 } as chrome.tabs.Tab },
      response,
    );

    expect(result).toBeUndefined();
    expect(chromeMock.sessionGet).not.toHaveBeenCalled();
    expect(chromeMock.sessionSet).not.toHaveBeenCalled();
    expect(response).toHaveBeenCalledWith(7);
  });

  test("reports a pending offscreen capture as captured mode", () => {
    const chromeMock = createChromeMock();
    chromeMock.sessionGet.mockImplementation((_keys, callback) => {
      callback({
        [STORAGE_KEYS.CAPTURE_TAB_IDS]: [
          { tabId: 7, previousTabEnabled: false, status: "starting" },
        ],
      });
    });
    const response = vi.fn();
    const handler = createRuntimeMessageHandler({
      applyAutostartForTab: vi.fn(),
      applyToolkitShortcut: vi.fn(() => true),
      clearUnusedStorage: vi.fn(),
      getCapturedTabs: vi.fn(),
      acceptSpectrumFrame: vi.fn(),
      restoreSpectrumDemand: vi.fn(),
      startCapture: vi.fn(),
      stopCapture: vi.fn(),
      handleCaptureEnded: vi.fn(),
    });

    const result = handler(
      { method: RUNTIME_MESSAGES.IS_TOOLKIT_CAPTURED },
      { tab: { id: 7 } as chrome.tabs.Tab },
      response,
    );

    expect(result).toBe(true);
    expect(response).toHaveBeenCalledWith(true);
  });

  test("reports an uncaptured tab as ordinary mode", () => {
    const chromeMock = createChromeMock();
    chromeMock.sessionGet.mockImplementation((_keys, callback) => {
      callback({
        [STORAGE_KEYS.CAPTURE_TAB_IDS]: [{ tabId: 8, previousTabEnabled: false, status: "active" }],
      });
    });
    const response = vi.fn();
    const handler = createRuntimeMessageHandler({
      applyAutostartForTab: vi.fn(),
      applyToolkitShortcut: vi.fn(() => true),
      clearUnusedStorage: vi.fn(),
      getCapturedTabs: vi.fn(),
      acceptSpectrumFrame: vi.fn(),
      restoreSpectrumDemand: vi.fn(),
      startCapture: vi.fn(),
      stopCapture: vi.fn(),
      handleCaptureEnded: vi.fn(),
    });

    handler(
      { method: RUNTIME_MESSAGES.IS_TOOLKIT_CAPTURED },
      { tab: { id: 7 } as chrome.tabs.Tab },
      response,
    );

    expect(response).toHaveBeenCalledWith(false);
  });

  test("routes a captured tab shortcut to background handling", async () => {
    createChromeMock();
    const applyToolkitShortcut = vi.fn(() => Promise.resolve(true));
    const handler = createRuntimeMessageHandler({
      applyAutostartForTab: vi.fn(),
      applyToolkitShortcut,
      clearUnusedStorage: vi.fn(),
      getCapturedTabs: vi.fn(),
      acceptSpectrumFrame: vi.fn(),
      restoreSpectrumDemand: vi.fn(),
      startCapture: vi.fn(),
      stopCapture: vi.fn(),
      handleCaptureEnded: vi.fn(),
    });

    handler(
      {
        method: RUNTIME_MESSAGES.TOOLKIT_SHORTCUT,
        payload: { action: "mute" },
      },
      { tab: { id: 7 } as chrome.tabs.Tab },
      vi.fn(),
    );
    await flushPromises();

    expect(applyToolkitShortcut).toHaveBeenCalledWith({ tabId: 7, action: "mute" });
  });

  test("applies autostart with reset when page starts", () => {
    createChromeMock();
    const applyAutostartForTab = vi.fn();
    const handler = createRuntimeMessageHandler({
      applyAutostartForTab,
      applyToolkitShortcut: vi.fn(() => true),
      clearUnusedStorage: vi.fn(),
      getCapturedTabs: vi.fn(),
      acceptSpectrumFrame: vi.fn(),
      restoreSpectrumDemand: vi.fn(),
      startCapture: vi.fn(),
      stopCapture: vi.fn(),
      handleCaptureEnded: vi.fn(),
    });

    const result = handler(
      { method: RUNTIME_MESSAGES.PAGE_STARTED },
      { tab: { id: 9, url: "https://example.com" } as chrome.tabs.Tab },
      vi.fn(),
    );

    expect(result).toBeUndefined();
    expect(applyAutostartForTab).toHaveBeenCalledWith(9, "https://example.com", {
      resetWhenNoMatch: true,
    });
  });

  test("updates connected tab badge without an async response", async () => {
    const chromeMock = createChromeMock();
    const handler = createRuntimeMessageHandler({
      applyAutostartForTab: vi.fn(),
      applyToolkitShortcut: vi.fn(() => true),
      clearUnusedStorage: vi.fn(),
      getCapturedTabs: vi.fn(),
      acceptSpectrumFrame: vi.fn(),
      restoreSpectrumDemand: vi.fn(),
      startCapture: vi.fn(),
      stopCapture: vi.fn(),
      handleCaptureEnded: vi.fn(),
    });

    const result = handler(
      { method: RUNTIME_MESSAGES.CONNECTED },
      { tab: { id: 11 } as chrome.tabs.Tab },
      vi.fn(),
    );
    await flushPromises();

    expect(result).toBeUndefined();
    expect(chromeMock.setBadgeText).toHaveBeenCalledWith({
      text: "ON",
      tabId: 11,
    });
  });

  test("tracks the sending frame and reports capture errors through the controller", async () => {
    createChromeMock();
    const captureErrors = {
      trackFrameConnected: vi.fn(),
      trackFrameDisconnected: vi.fn(),
      reportError: vi.fn(),
      clearTabFrames: vi.fn(),
    };
    const handler = createRuntimeMessageHandler({
      applyAutostartForTab: vi.fn(),
      applyToolkitShortcut: vi.fn(() => true),
      clearUnusedStorage: vi.fn(),
      getCapturedTabs: vi.fn(),
      acceptSpectrumFrame: vi.fn(),
      restoreSpectrumDemand: vi.fn(),
      startCapture: vi.fn(),
      stopCapture: vi.fn(),
      handleCaptureEnded: vi.fn(),
      captureErrors,
    });

    handler(
      { method: RUNTIME_MESSAGES.CONNECTED },
      { tab: { id: 11 } as chrome.tabs.Tab, frameId: 2 } as chrome.runtime.MessageSender,
      vi.fn(),
    );
    handler(
      { method: RUNTIME_MESSAGES.CAPTURE_ERROR, payload: { message: "Audio capture failed" } },
      { tab: { id: 11 } as chrome.tabs.Tab, frameId: 3 } as chrome.runtime.MessageSender,
      vi.fn(),
    );
    handler(
      { method: RUNTIME_MESSAGES.CAPTURE_ERROR, payload: { message: 42 } },
      { tab: { id: 11 } as chrome.tabs.Tab, frameId: 3 } as chrome.runtime.MessageSender,
      vi.fn(),
    );
    await flushPromises();

    expect(captureErrors.trackFrameConnected).toHaveBeenCalledWith(11, 2);
    expect(captureErrors.reportError).toHaveBeenCalledTimes(1);
    expect(captureErrors.reportError).toHaveBeenCalledWith(11, "Audio capture failed");
  });

  test("ignores page badge events for a tab with a live capture", async () => {
    const chromeMock = createChromeMock();
    const handler = createRuntimeMessageHandler({
      applyAutostartForTab: vi.fn(),
      applyToolkitShortcut: vi.fn(() => true),
      clearUnusedStorage: vi.fn(),
      getCapturedTabs: vi.fn(),
      acceptSpectrumFrame: vi.fn(),
      restoreSpectrumDemand: vi.fn(),
      isCaptureBadgeTab: (tabId) => tabId === 11,
      startCapture: vi.fn(),
      stopCapture: vi.fn(),
      handleCaptureEnded: vi.fn(),
    });

    handler(
      { method: RUNTIME_MESSAGES.CONNECTED },
      { tab: { id: 11 } as chrome.tabs.Tab },
      vi.fn(),
    );
    handler(
      { method: RUNTIME_MESSAGES.DISCONNECTED },
      { tab: { id: 11 } as chrome.tabs.Tab },
      vi.fn(),
    );
    await flushPromises();

    expect(chromeMock.setBadgeText).not.toHaveBeenCalled();
  });

  test("awaits capture ownership before applying a page badge", async () => {
    const chromeMock = createChromeMock();
    let resolveOwnership!: (owned: boolean) => void;
    const isCaptureBadgeTab = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          resolveOwnership = resolve;
        }),
    );
    const handler = createRuntimeMessageHandler({
      applyAutostartForTab: vi.fn(),
      applyToolkitShortcut: vi.fn(() => true),
      clearUnusedStorage: vi.fn(),
      getCapturedTabs: vi.fn(),
      acceptSpectrumFrame: vi.fn(),
      restoreSpectrumDemand: vi.fn(),
      isCaptureBadgeTab,
      startCapture: vi.fn(),
      stopCapture: vi.fn(),
      handleCaptureEnded: vi.fn(),
    });

    handler(
      { method: RUNTIME_MESSAGES.CONNECTED },
      { tab: { id: 11 } as chrome.tabs.Tab },
      vi.fn(),
    );
    await flushPromises();
    expect(chromeMock.setBadgeText).not.toHaveBeenCalled();

    resolveOwnership(true);
    await flushPromises();
    expect(chromeMock.setBadgeText).not.toHaveBeenCalled();

    handler(
      { method: RUNTIME_MESSAGES.CONNECTED },
      { tab: { id: 11 } as chrome.tabs.Tab },
      vi.fn(),
    );
    resolveOwnership(false);
    await flushPromises();
    expect(chromeMock.setBadgeText).toHaveBeenCalledWith({ text: "ON", tabId: 11 });

    handler(
      { method: RUNTIME_MESSAGES.DISCONNECTED },
      { tab: { id: 11 } as chrome.tabs.Tab },
      vi.fn(),
    );
    resolveOwnership(false);
    await flushPromises();
    expect(chromeMock.setBadgeText).toHaveBeenLastCalledWith({ text: "OFF", tabId: 11 });
  });

  test("logs a page badge ownership failure without writing the badge", async () => {
    const chromeMock = createChromeMock();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const failure = new Error("session storage unavailable");
    const handler = createRuntimeMessageHandler({
      applyAutostartForTab: vi.fn(),
      applyToolkitShortcut: vi.fn(() => true),
      clearUnusedStorage: vi.fn(),
      getCapturedTabs: vi.fn(),
      acceptSpectrumFrame: vi.fn(),
      restoreSpectrumDemand: vi.fn(),
      isCaptureBadgeTab: () => Promise.reject(failure),
      startCapture: vi.fn(),
      stopCapture: vi.fn(),
      handleCaptureEnded: vi.fn(),
    });

    handler(
      { method: RUNTIME_MESSAGES.CONNECTED },
      { tab: { id: 11 } as chrome.tabs.Tab },
      vi.fn(),
    );
    await flushPromises();

    expect(consoleError).toHaveBeenCalledWith("Failed to update page badge", {
      operation: "updatePageBadge",
      tabId: 11,
      error: failure,
    });
    expect(chromeMock.setBadgeText).not.toHaveBeenCalled();
  });

  test("reports a badge update failure with its operation and tab", async () => {
    const chromeMock = createChromeMock();
    const failure = new Error("badge failed");
    chromeMock.setBadgeText.mockRejectedValue(failure);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const handler = createRuntimeMessageHandler({
      applyAutostartForTab: vi.fn(),
      applyToolkitShortcut: vi.fn(() => true),
      clearUnusedStorage: vi.fn(),
      getCapturedTabs: vi.fn(),
      acceptSpectrumFrame: vi.fn(),
      restoreSpectrumDemand: vi.fn(),
      startCapture: vi.fn(),
      stopCapture: vi.fn(),
      handleCaptureEnded: vi.fn(),
    });

    handler(
      { method: RUNTIME_MESSAGES.CONNECTED },
      { tab: { id: 11 } as chrome.tabs.Tab },
      vi.fn(),
    );
    await flushPromises();

    expect(consoleError).toHaveBeenCalledWith("Failed to update tab badge", {
      operation: "setBadgeText",
      tabId: 11,
      error: failure,
    });
  });

  test("ignores unknown tab messages without an async response", () => {
    createChromeMock();
    const handler = createRuntimeMessageHandler({
      applyAutostartForTab: vi.fn(),
      applyToolkitShortcut: vi.fn(() => true),
      clearUnusedStorage: vi.fn(),
      getCapturedTabs: vi.fn(),
      acceptSpectrumFrame: vi.fn(),
      restoreSpectrumDemand: vi.fn(),
      startCapture: vi.fn(),
      stopCapture: vi.fn(),
      handleCaptureEnded: vi.fn(),
    });

    const result = handler(
      { method: "unknown" as typeof RUNTIME_MESSAGES.GET_TAB_ID },
      { tab: { id: 13 } as chrome.tabs.Tab },
      vi.fn(),
    );

    expect(result).toBeUndefined();
  });

  test("relays spectrum frames using the original sender without storage", () => {
    const chromeMock = createChromeMock();
    const acceptSpectrumFrame = vi.fn();
    const handler = createRuntimeMessageHandler({
      applyAutostartForTab: vi.fn(),
      applyToolkitShortcut: vi.fn(() => true),
      clearUnusedStorage: vi.fn(),
      getCapturedTabs: vi.fn(),
      acceptSpectrumFrame,
      restoreSpectrumDemand: vi.fn(),
      startCapture: vi.fn(),
      stopCapture: vi.fn(),
      handleCaptureEnded: vi.fn(),
    });
    const payload = {
      type: "spectrum" as const,
      buffer: [-42, -38],
      clipping: false,
    };
    const sender = {
      tab: { id: 12 } as chrome.tabs.Tab,
      frameId: 3,
    };

    handler({ method: RUNTIME_MESSAGES.SPECTRUM_FRAME, payload }, sender, vi.fn());

    expect(acceptSpectrumFrame).toHaveBeenCalledWith(payload, sender);
    expect(chromeMock.localSet).not.toHaveBeenCalled();
  });

  test("restores spectrum demand only for ready content with routing ids", () => {
    createChromeMock();
    const restoreSpectrumDemand = vi.fn();
    const handler = createRuntimeMessageHandler({
      applyAutostartForTab: vi.fn(),
      applyToolkitShortcut: vi.fn(() => true),
      clearUnusedStorage: vi.fn(),
      getCapturedTabs: vi.fn(),
      acceptSpectrumFrame: vi.fn(),
      restoreSpectrumDemand,
      startCapture: vi.fn(),
      stopCapture: vi.fn(),
      handleCaptureEnded: vi.fn(),
    });
    const routedSender = {
      tab: { id: 12 } as chrome.tabs.Tab,
      frameId: 3,
    };

    handler({ method: RUNTIME_MESSAGES.SPECTRUM_READY }, routedSender, vi.fn());
    handler(
      { method: RUNTIME_MESSAGES.SPECTRUM_READY },
      { tab: { id: 12 } as chrome.tabs.Tab },
      vi.fn(),
    );

    expect(restoreSpectrumDemand).toHaveBeenCalledOnce();
    expect(restoreSpectrumDemand).toHaveBeenCalledWith(routedSender);
  });

  test("starts tab capture and responds with its reply", async () => {
    createChromeMock();
    const response = vi.fn();
    const startCapture = vi.fn().mockResolvedValue({ ok: true, captures: [] });
    const handler = createRuntimeMessageHandler({
      applyAutostartForTab: vi.fn(),
      applyToolkitShortcut: vi.fn(() => true),
      clearUnusedStorage: vi.fn(),
      getCapturedTabs: vi.fn(),
      acceptSpectrumFrame: vi.fn(),
      restoreSpectrumDemand: vi.fn(),
      startCapture,
      stopCapture: vi.fn(),
      handleCaptureEnded: vi.fn(),
    });

    const result = handler({ method: RUNTIME_MESSAGES.START_TAB_CAPTURE, tabId: 12 }, {}, response);
    await flushPromises();

    expect(result).toBe(true);
    expect(startCapture).toHaveBeenCalledWith(12);
    expect(response).toHaveBeenCalledWith({ ok: true, captures: [] });
  });

  test("responds with a tab capture failure", async () => {
    createChromeMock();
    const response = vi.fn();
    const handler = createRuntimeMessageHandler({
      applyAutostartForTab: vi.fn(),
      applyToolkitShortcut: vi.fn(() => true),
      clearUnusedStorage: vi.fn(),
      getCapturedTabs: vi.fn(),
      acceptSpectrumFrame: vi.fn(),
      restoreSpectrumDemand: vi.fn(),
      startCapture: vi.fn().mockResolvedValue({ ok: false, error: "capture failed" }),
      stopCapture: vi.fn(),
      handleCaptureEnded: vi.fn(),
    });

    const result = handler({ method: RUNTIME_MESSAGES.START_TAB_CAPTURE, tabId: 12 }, {}, response);
    await flushPromises();

    expect(result).toBe(true);
    expect(response).toHaveBeenCalledWith({ ok: false, error: "capture failed" });
  });

  test("ignores a capture toggle from a content-script sender", async () => {
    createChromeMock();
    const toggleCaptureEnabled = vi.fn(() => Promise.resolve());
    const handler = createRuntimeMessageHandler({
      applyAutostartForTab: vi.fn(),
      applyToolkitShortcut: vi.fn(() => true),
      clearUnusedStorage: vi.fn(),
      getCapturedTabs: vi.fn(),
      acceptSpectrumFrame: vi.fn(),
      restoreSpectrumDemand: vi.fn(),
      toggleCaptureEnabled,
      startCapture: vi.fn(),
      stopCapture: vi.fn(),
      handleCaptureEnded: vi.fn(),
    });

    handler(
      { method: RUNTIME_MESSAGES.TOGGLE_CAPTURE_ENABLED, tabId: 7 },
      { tab: { id: 3 } as chrome.tabs.Tab },
      vi.fn(),
    );
    await flushPromises();

    expect(toggleCaptureEnabled).not.toHaveBeenCalled();
  });

  test("toggles capture bypass for a popup sender without a tab", async () => {
    createChromeMock();
    const response = vi.fn();
    const toggleCaptureEnabled = vi.fn(() => Promise.resolve());
    const handler = createRuntimeMessageHandler({
      applyAutostartForTab: vi.fn(),
      applyToolkitShortcut: vi.fn(() => true),
      clearUnusedStorage: vi.fn(),
      getCapturedTabs: vi.fn(),
      acceptSpectrumFrame: vi.fn(),
      restoreSpectrumDemand: vi.fn(),
      toggleCaptureEnabled,
      startCapture: vi.fn(),
      stopCapture: vi.fn(),
      handleCaptureEnded: vi.fn(),
    });

    const result = handler(
      { method: RUNTIME_MESSAGES.TOGGLE_CAPTURE_ENABLED, tabId: 7 },
      {},
      response,
    );
    await flushPromises();

    expect(result).toBe(true);
    expect(toggleCaptureEnabled).toHaveBeenCalledWith(7);
    expect(response).toHaveBeenCalledWith({ ok: true });
  });

  test("stops tab capture for the sender tab when no id is sent", async () => {
    createChromeMock();
    const response = vi.fn();
    const stopCapture = vi.fn().mockResolvedValue({ ok: true, captures: [] });
    const handler = createRuntimeMessageHandler({
      applyAutostartForTab: vi.fn(),
      applyToolkitShortcut: vi.fn(() => true),
      clearUnusedStorage: vi.fn(),
      getCapturedTabs: vi.fn(),
      acceptSpectrumFrame: vi.fn(),
      restoreSpectrumDemand: vi.fn(),
      startCapture: vi.fn(),
      stopCapture,
      handleCaptureEnded: vi.fn(),
    });

    handler(
      { method: RUNTIME_MESSAGES.STOP_TAB_CAPTURE },
      { tab: { id: 5 } as chrome.tabs.Tab },
      response,
    );
    await flushPromises();

    expect(stopCapture).toHaveBeenCalledWith(5);
    expect(response).toHaveBeenCalledWith({ ok: true, captures: [] });
  });

  test("accepts an offscreen capture frame only from a verified live capture", async () => {
    createChromeMock();
    const acceptCaptureFrame = vi.fn();
    const acceptSpectrumFrame = vi.fn();
    const isOffscreenSender = (candidate: chrome.runtime.MessageSender) =>
      candidate.id === "extension-id" &&
      candidate.url === "chrome-extension://extension-id/offscreen.html";
    const isLiveCapture = vi.fn(() => true);
    const handler = createRuntimeMessageHandler({
      applyAutostartForTab: vi.fn(),
      applyToolkitShortcut: vi.fn(() => true),
      clearUnusedStorage: vi.fn(),
      getCapturedTabs: vi.fn(),
      acceptSpectrumFrame,
      acceptCaptureFrame,
      isLiveCapture,
      isOffscreenSender,
      restoreSpectrumDemand: vi.fn(),
      startCapture: vi.fn(),
      stopCapture: vi.fn(),
      handleCaptureEnded: vi.fn(),
    });
    const payload = {
      type: "spectrum" as const,
      buffer: [-42, -38],
      clipping: false,
    };
    const offscreenSender = {
      id: "extension-id",
      url: "chrome-extension://extension-id/offscreen.html",
    } as chrome.runtime.MessageSender;

    handler(
      { target: "background", method: RUNTIME_MESSAGES.SPECTRUM_FRAME, tabId: 12, payload },
      offscreenSender,
      vi.fn(),
    );
    await flushPromises();

    expect(acceptCaptureFrame).toHaveBeenCalledWith(12, payload);
    expect(acceptSpectrumFrame).not.toHaveBeenCalled();
  });

  test("rejects capture frames without a live session or a verified sender", async () => {
    createChromeMock();
    const acceptCaptureFrame = vi.fn();
    const acceptSpectrumFrame = vi.fn();
    const isLiveCapture = vi.fn(() => false);
    const isOffscreenSender = (candidate: chrome.runtime.MessageSender) =>
      candidate.id === "extension-id" &&
      candidate.url === "chrome-extension://extension-id/offscreen.html";
    const handler = createRuntimeMessageHandler({
      applyAutostartForTab: vi.fn(),
      applyToolkitShortcut: vi.fn(() => true),
      clearUnusedStorage: vi.fn(),
      getCapturedTabs: vi.fn(),
      acceptSpectrumFrame,
      acceptCaptureFrame,
      isLiveCapture,
      isOffscreenSender,
      restoreSpectrumDemand: vi.fn(),
      startCapture: vi.fn(),
      stopCapture: vi.fn(),
      handleCaptureEnded: vi.fn(),
    });
    const payload = {
      type: "spectrum" as const,
      buffer: [-42, -38],
      clipping: false,
    };

    handler(
      { target: "background", method: RUNTIME_MESSAGES.SPECTRUM_FRAME, tabId: 12, payload },
      {
        id: "extension-id",
        url: "chrome-extension://extension-id/offscreen.html",
      } as chrome.runtime.MessageSender,
      vi.fn(),
    );
    await flushPromises();
    expect(acceptCaptureFrame).not.toHaveBeenCalled();

    handler(
      { target: "background", method: RUNTIME_MESSAGES.SPECTRUM_FRAME, tabId: 12, payload },
      { id: "other-extension", url: "chrome-extension://other/offscreen.html" } as never,
      vi.fn(),
    );
    await flushPromises();
    expect(acceptCaptureFrame).not.toHaveBeenCalled();

    handler(
      { method: RUNTIME_MESSAGES.SPECTRUM_FRAME, payload },
      { tab: { id: 13 } as chrome.tabs.Tab, frameId: 1 } as chrome.runtime.MessageSender,
      vi.fn(),
    );
    await flushPromises();
    expect(acceptSpectrumFrame).toHaveBeenCalledWith(payload, {
      tab: { id: 13 },
      frameId: 1,
    });
    expect(acceptCaptureFrame).not.toHaveBeenCalled();
  });

  test("routes a capture-ended background message with its sender", () => {
    createChromeMock();
    const handleCaptureEnded = vi.fn();
    const handler = createRuntimeMessageHandler({
      applyAutostartForTab: vi.fn(),
      applyToolkitShortcut: vi.fn(() => true),
      clearUnusedStorage: vi.fn(),
      getCapturedTabs: vi.fn(),
      acceptSpectrumFrame: vi.fn(),
      restoreSpectrumDemand: vi.fn(),
      startCapture: vi.fn(),
      stopCapture: vi.fn(),
      handleCaptureEnded,
    });
    const sender = { id: "test-extension" } as chrome.runtime.MessageSender;

    expect(
      handler(
        { target: "background", method: RUNTIME_MESSAGES.CAPTURE_ENDED, tabId: 9 },
        sender,
        vi.fn(),
      ),
    ).toBeUndefined();
    expect(handleCaptureEnded).toHaveBeenCalledWith(9, sender);
  });
});
