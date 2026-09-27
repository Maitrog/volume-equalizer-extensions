import { beforeEach, describe, expect, test, vi } from "vitest";

import { RUNTIME_MESSAGES } from "../../infrastructure/chrome/runtimeMessages";
import { STORAGE_KEYS } from "../../infrastructure/chrome/storageKeys";

const mocks = vi.hoisted(() => ({
  applyAutostartForTab: vi.fn(),
  clearTabStorage: vi.fn(),
  clearUnusedStorage: vi.fn(),
  captureCoordinator: {
    getCapturedTabs: vi.fn(),
    getCaptures: vi.fn(() => Promise.resolve([])),
    handleCaptureEnded: vi.fn(),
    handleStorageChange: vi.fn(() => Promise.resolve()),
    handleTabRemoved: vi.fn(),
    startCapture: vi.fn(),
    stopCapture: vi.fn(),
    toggleCaptureEnabled: vi.fn(),
  },
  messageRouterDeps: null as null | {
    startCapture(tabId?: number): Promise<unknown>;
    stopCapture(tabId?: number): Promise<unknown>;
    toggleCaptureEnabled(tabId?: number): Promise<void>;
    handleCaptureEnded(tabId: number, sender: chrome.runtime.MessageSender): void;
  },
  spectrumRelay: {
    acceptFrame: vi.fn(),
    acceptCaptureFrame: vi.fn(),
    connect: vi.fn(),
    contentReady: vi.fn(),
    removeTab: vi.fn(),
    resetSources: vi.fn(),
  },
  spectrumRelayDeps: null as null | {
    setDemand(tabId: number, enabled: boolean, frameId?: number): void;
  },
}));

vi.mock("./autostartOnTab", () => ({
  applyAutostartForTab: mocks.applyAutostartForTab,
}));
vi.mock("./captureCoordinator", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./captureCoordinator")>();
  return { ...actual, captureCoordinator: mocks.captureCoordinator };
});
vi.mock("./installUpdateNotice", () => ({
  prepareInstallUpdateNotice: vi.fn(),
}));
vi.mock("./messageRouter", () => ({
  createRuntimeMessageHandler: vi.fn(
    (deps: {
      startCapture(tabId?: number): Promise<unknown>;
      stopCapture(tabId?: number): Promise<unknown>;
      toggleCaptureEnabled(tabId?: number): Promise<void>;
      handleCaptureEnded(tabId: number, sender: chrome.runtime.MessageSender): void;
    }) => {
      mocks.messageRouterDeps = deps;
      return vi.fn();
    },
  ),
}));
vi.mock("./registerContentScripts", () => ({ registerContentScripts: vi.fn() }));
vi.mock("./spectrumRelay", () => ({
  createSpectrumRelay: vi.fn(
    (deps: { setDemand(tabId: number, enabled: boolean, frameId?: number): void }) => {
      mocks.spectrumRelayDeps = deps;
      return mocks.spectrumRelay;
    },
  ),
}));
vi.mock("./storageCleanup", () => ({
  clearLegacyToolkitWindowState: vi.fn(),
  clearTabStorage: mocks.clearTabStorage,
  clearUnusedStorage: mocks.clearUnusedStorage,
}));
const captureSettings = (enabled: boolean) => ({
  enabled,
  gainValue: 0,
  muted: false,
  volumeCompensationEnabled: false,
  filterSettings: [],
});

const createChromeMock = (getTab: ReturnType<typeof vi.fn>) => {
  const onActivated = vi.fn();
  const onStorageChanged = vi.fn();
  const runtimeSendMessage = vi.fn(() => Promise.resolve(undefined));
  const storageGet = vi.fn((): Promise<Record<string, unknown>> =>
    Promise.resolve({ [STORAGE_KEYS.ENABLE_SPECTRUM]: true }),
  );
  const tabsSendMessage = vi.fn(() => Promise.resolve(undefined));
  const setBadgeText = vi.fn(() => Promise.resolve(undefined));
  vi.stubGlobal("chrome", {
    action: { setBadgeText },
    runtime: {
      id: "extension-id",
      getURL: vi.fn((path: string) => `chrome-extension://extension-id/${path}`),
      onConnect: { addListener: vi.fn() },
      onInstalled: { addListener: vi.fn() },
      onMessage: { addListener: vi.fn() },
      onStartup: { addListener: vi.fn() },
      sendMessage: runtimeSendMessage,
      setUninstallURL: vi.fn(),
    },
    storage: {
      local: { get: storageGet, set: vi.fn() },
      session: { remove: vi.fn() },
      onChanged: { addListener: onStorageChanged },
    },
    tabs: {
      get: getTab,
      onActivated: { addListener: onActivated },
      onRemoved: { addListener: vi.fn() },
      onUpdated: { addListener: vi.fn() },
      sendMessage: tabsSendMessage,
    },
    tabCapture: { onStatusChanged: { addListener: vi.fn() } },
  });
  return {
    onActivated,
    onStorageChanged,
    runtimeSendMessage,
    storageGet,
    tabsSendMessage,
    setBadgeText,
  };
};
describe("background tab activation", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  test("reports an autostart failure without treating the tab as missing", async () => {
    const failure = new Error("autostart failed");
    const { onActivated } = createChromeMock(
      vi.fn().mockResolvedValue({ id: 12, url: "https://example.com" }),
    );
    mocks.applyAutostartForTab.mockRejectedValue(failure);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    await import("./background");
    const listener = onActivated.mock.calls[0][0];

    listener({ tabId: 12 });
    await vi.waitFor(() => expect(consoleError).toHaveBeenCalled());

    expect(consoleError).toHaveBeenCalledWith("Failed to apply autostart for activated tab", {
      operation: "applyAutostartForTab",
      tabId: 12,
      error: failure,
    });
    expect(mocks.clearTabStorage).not.toHaveBeenCalled();
  });

  test("cleans state when the activated tab disappeared", async () => {
    const { onActivated } = createChromeMock(
      vi.fn().mockRejectedValue(new Error("No tab with id: 12")),
    );
    await import("./background");
    const listener = onActivated.mock.calls[0][0];

    listener({ tabId: 12 });
    await vi.waitFor(() =>
      expect(mocks.captureCoordinator.handleTabRemoved).toHaveBeenCalledWith(12),
    );

    expect(mocks.clearTabStorage).toHaveBeenCalledWith(12);
  });

  test("routes spectrum demand to the offscreen capture for a live tab", async () => {
    const { runtimeSendMessage, tabsSendMessage } = createChromeMock(vi.fn());
    mocks.captureCoordinator.getCaptures.mockResolvedValue([{ tabId: 7, settings: {} }] as never);
    await import("./background");

    mocks.spectrumRelayDeps?.setDemand(7, true);

    await vi.waitFor(() =>
      expect(runtimeSendMessage).toHaveBeenCalledWith({
        target: "offscreen",
        method: RUNTIME_MESSAGES.CAPTURE_SPECTRUM_DEMAND,
        tabId: 7,
        enabled: true,
      }),
    );
    expect(tabsSendMessage).not.toHaveBeenCalled();
  });

  test("keeps capture spectrum demand off while the enabled setting is disabled", async () => {
    const { runtimeSendMessage, storageGet, tabsSendMessage } = createChromeMock(vi.fn());
    storageGet.mockResolvedValue({ [STORAGE_KEYS.ENABLE_SPECTRUM]: false });
    mocks.captureCoordinator.getCaptures.mockResolvedValue([{ tabId: 7, settings: {} }] as never);
    await import("./background");

    mocks.spectrumRelayDeps?.setDemand(7, true);

    await vi.waitFor(() =>
      expect(runtimeSendMessage).toHaveBeenCalledWith({
        target: "offscreen",
        method: RUNTIME_MESSAGES.CAPTURE_SPECTRUM_DEMAND,
        tabId: 7,
        enabled: false,
      }),
    );
    expect(runtimeSendMessage).not.toHaveBeenCalledWith(expect.objectContaining({ enabled: true }));
    expect(tabsSendMessage).not.toHaveBeenCalled();
  });

  test("re-evaluates capture demand when the enabled setting changes", async () => {
    const { onStorageChanged } = createChromeMock(vi.fn());
    mocks.captureCoordinator.getCaptures.mockResolvedValue([{ tabId: 7, settings: {} }] as never);
    await import("./background");
    const listener = onStorageChanged.mock.calls[0][0];

    listener({ [STORAGE_KEYS.ENABLE_SPECTRUM]: { oldValue: true, newValue: false } }, "local");

    await vi.waitFor(() => expect(mocks.spectrumRelay.resetSources).toHaveBeenCalledWith(7));
  });

  test("forwards only capture-relevant storage changes to the coordinator", async () => {
    const { onStorageChanged } = createChromeMock(vi.fn());
    await import("./background");
    const listener = onStorageChanged.mock.calls[0][0];

    listener({ [STORAGE_KEYS.THEME]: { oldValue: "dark", newValue: "light" } }, "local");
    listener({ [STORAGE_KEYS.tabVolume(7)]: { oldValue: 1, newValue: 0.5 } }, "local");
    await Promise.resolve();

    expect(mocks.captureCoordinator.handleStorageChange).not.toHaveBeenCalled();

    const gainChange = { [STORAGE_KEYS.tabGain(7)]: { oldValue: 0, newValue: -6 } };
    listener(gainChange, "local");
    await vi.waitFor(() =>
      expect(mocks.captureCoordinator.handleStorageChange).toHaveBeenCalledWith(gainChange),
    );
  });

  test("resets spectrum sources when capture starts and stops", async () => {
    createChromeMock(vi.fn());
    mocks.captureCoordinator.startCapture.mockResolvedValue({
      ok: true,
      captures: [{ tabId: 7, settings: captureSettings(true) }],
    });
    mocks.captureCoordinator.stopCapture.mockResolvedValue({ ok: true, captures: [] });
    await import("./background");

    await mocks.messageRouterDeps?.startCapture(7);
    expect(mocks.spectrumRelay.resetSources).toHaveBeenCalledWith(7);
    await mocks.messageRouterDeps?.stopCapture(7);
    expect(mocks.spectrumRelay.resetSources).toHaveBeenCalledTimes(2);
    expect(mocks.spectrumRelay.resetSources).toHaveBeenLastCalledWith(7);
  });

  test("routes spectrum demand to the page for an ordinary tab", async () => {
    const { runtimeSendMessage, tabsSendMessage } = createChromeMock(vi.fn());
    mocks.captureCoordinator.getCaptures.mockResolvedValue([]);
    await import("./background");

    mocks.spectrumRelayDeps?.setDemand(7, true, 3);

    await vi.waitFor(() =>
      expect(tabsSendMessage).toHaveBeenCalledWith(
        7,
        {
          method: RUNTIME_MESSAGES.SET_SPECTRUM_DEMAND,
          payload: { enabled: true },
        },
        { frameId: 3 },
      ),
    );
    expect(runtimeSendMessage).not.toHaveBeenCalled();
  });

  test("turns the tab badge ON when capture starts and OFF when it stops", async () => {
    const { setBadgeText } = createChromeMock(vi.fn());
    mocks.captureCoordinator.startCapture.mockResolvedValue({
      ok: true,
      captures: [{ tabId: 7, settings: captureSettings(true) }],
    });
    mocks.captureCoordinator.stopCapture.mockResolvedValue({ ok: true, captures: [] });
    await import("./background");

    await mocks.messageRouterDeps?.startCapture(7);
    expect(setBadgeText).toHaveBeenCalledWith({ text: "ON", tabId: 7 });

    await mocks.messageRouterDeps?.stopCapture(7);
    expect(setBadgeText).toHaveBeenCalledWith({ text: "OFF", tabId: 7 });
  });

  test("uses the requested capture enabled state for the start badge", async () => {
    const { setBadgeText } = createChromeMock(vi.fn());
    mocks.captureCoordinator.startCapture.mockResolvedValue({
      ok: true,
      captures: [
        { tabId: 21, settings: captureSettings(true) },
        { tabId: 12, settings: captureSettings(false) },
      ],
    });
    await import("./background");

    await mocks.messageRouterDeps?.startCapture(12);

    expect(setBadgeText).toHaveBeenLastCalledWith({ tabId: 12, text: "OFF" });
  });

  test("updates the tab badge from the bypass toggle result", async () => {
    const { setBadgeText } = createChromeMock(vi.fn());
    mocks.captureCoordinator.toggleCaptureEnabled.mockResolvedValue(false);
    await import("./background");

    await mocks.messageRouterDeps?.toggleCaptureEnabled(7);
    expect(setBadgeText).toHaveBeenCalledWith({ text: "OFF", tabId: 7 });

    mocks.captureCoordinator.toggleCaptureEnabled.mockResolvedValue(true);
    await mocks.messageRouterDeps?.toggleCaptureEnabled(7);
    expect(setBadgeText).toHaveBeenCalledWith({ text: "ON", tabId: 7 });
  });

  test("clears the tab badge when capture ends", async () => {
    const { setBadgeText } = createChromeMock(vi.fn());
    mocks.captureCoordinator.handleCaptureEnded.mockResolvedValue(undefined);
    await import("./background");

    mocks.messageRouterDeps?.handleCaptureEnded(7, {
      id: "extension-id",
      url: "chrome-extension://extension-id/offscreen.html",
    } as chrome.runtime.MessageSender);

    expect(setBadgeText).toHaveBeenCalledWith({ text: "OFF", tabId: 7 });
  });
});
