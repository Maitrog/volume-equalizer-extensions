import { beforeEach, describe, expect, test, vi } from "vitest";

import { RUNTIME_MESSAGES } from "../../infrastructure/chrome/runtimeMessages";
import { STORAGE_KEYS } from "../../infrastructure/chrome/storageKeys";
import { createRuntimeMessageHandler } from "./messageRouter";

const createChromeMock = () => {
  const localSet = vi.fn();
  const sessionGet = vi.fn();
  const sessionSet = vi.fn();
  const setBadgeText = vi.fn();

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
      clearUnusedStorage: vi.fn(),
      getCapturedTabs: vi.fn().mockResolvedValue(capturedTabs),
      toggleWindowMode: vi.fn(),
    });

    const result = handler(
      { method: RUNTIME_MESSAGES.GET_CAPTURED_TABS },
      {},
      response
    );
    await flushPromises();

    expect(result).toBe(true);
    expect(response).toHaveBeenCalledWith(capturedTabs);
  });

  test("falls back to empty captured tabs when retrieval fails", async () => {
    createChromeMock();
    const response = vi.fn();
    const handler = createRuntimeMessageHandler({
      applyAutostartForTab: vi.fn(),
      clearUnusedStorage: vi.fn(),
      getCapturedTabs: vi.fn().mockRejectedValue(new Error("gone")),
      toggleWindowMode: vi.fn(),
    });

    const result = handler(
      { method: RUNTIME_MESSAGES.GET_CAPTURED_TABS },
      {},
      response
    );
    await flushPromises();

    expect(result).toBe(true);
    expect(response).toHaveBeenCalledWith({ tabs: [], activeTabId: null });
  });

  test("registers sender tab id before responding", () => {
    const chromeMock = createChromeMock();
    chromeMock.sessionGet.mockImplementation((_keys, callback) => {
      callback({ [STORAGE_KEYS.REGISTERED_TAB_IDS]: [3] });
    });
    const response = vi.fn();
    const handler = createRuntimeMessageHandler({
      applyAutostartForTab: vi.fn(),
      clearUnusedStorage: vi.fn(),
      getCapturedTabs: vi.fn(),
      toggleWindowMode: vi.fn(),
    });

    const result = handler(
      { method: RUNTIME_MESSAGES.GET_TAB_ID },
      { tab: { id: 7 } as chrome.tabs.Tab },
      response
    );

    expect(result).toBeUndefined();
    expect(chromeMock.sessionSet).toHaveBeenCalledWith({
      [STORAGE_KEYS.REGISTERED_TAB_IDS]: [3, 7],
    });
    expect(response).toHaveBeenCalledWith(7);
  });

  test("applies autostart with reset when page starts", () => {
    createChromeMock();
    const applyAutostartForTab = vi.fn();
    const handler = createRuntimeMessageHandler({
      applyAutostartForTab,
      clearUnusedStorage: vi.fn(),
      getCapturedTabs: vi.fn(),
      toggleWindowMode: vi.fn(),
    });

    const result = handler(
      { method: RUNTIME_MESSAGES.PAGE_STARTED },
      { tab: { id: 9, url: "https://example.com" } as chrome.tabs.Tab },
      vi.fn()
    );

    expect(result).toBeUndefined();
    expect(applyAutostartForTab).toHaveBeenCalledWith(
      9,
      "https://example.com",
      { resetWhenNoMatch: true }
    );
  });

  test("does not keep channel open for fire-and-forget tab messages", () => {
    const chromeMock = createChromeMock();
    const handler = createRuntimeMessageHandler({
      applyAutostartForTab: vi.fn(),
      clearUnusedStorage: vi.fn(),
      getCapturedTabs: vi.fn(),
      toggleWindowMode: vi.fn(),
    });

    const result = handler(
      { method: RUNTIME_MESSAGES.CONNECTED },
      { tab: { id: 11 } as chrome.tabs.Tab },
      vi.fn()
    );

    expect(result).toBeUndefined();
    expect(chromeMock.setBadgeText).toHaveBeenCalledWith({
      text: "ON",
      tabId: 11,
    });
  });

  test("does not keep channel open for unknown tab messages", () => {
    createChromeMock();
    const handler = createRuntimeMessageHandler({
      applyAutostartForTab: vi.fn(),
      clearUnusedStorage: vi.fn(),
      getCapturedTabs: vi.fn(),
      toggleWindowMode: vi.fn(),
    });

    const result = handler(
      { method: "unknown" as typeof RUNTIME_MESSAGES.GET_TAB_ID },
      { tab: { id: 13 } as chrome.tabs.Tab },
      vi.fn()
    );

    expect(result).toBeUndefined();
  });
});
