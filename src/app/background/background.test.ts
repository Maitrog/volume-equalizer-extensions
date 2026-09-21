import { beforeEach, describe, expect, test, vi } from "vitest";

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
  getCapturedTabs: vi.fn(),
  getToolkitWindowId: vi.fn(),
  removeTabIdFromToolkitWindowStore: vi.fn(),
  spectrumRelay: {
    acceptFrame: vi.fn(),
    connect: vi.fn(),
    contentReady: vi.fn(),
    removeTab: vi.fn(),
  },
  toggleWindowMode: vi.fn(),
}));

vi.mock("./autostartOnTab", () => ({
  applyAutostartForTab: mocks.applyAutostartForTab,
}));
vi.mock("./captureCoordinator", () => ({
  captureCoordinator: mocks.captureCoordinator,
}));
vi.mock("./installUpdateNotice", () => ({
  prepareInstallUpdateNotice: vi.fn(),
}));
vi.mock("./messageRouter", () => ({
  createRuntimeMessageHandler: vi.fn(() => vi.fn()),
}));
vi.mock("./registerContentScripts", () => ({ registerContentScripts: vi.fn() }));
vi.mock("./spectrumRelay", () => ({
  createSpectrumRelay: vi.fn(() => mocks.spectrumRelay),
}));
vi.mock("./storageCleanup", () => ({
  clearLegacyToolkitWindowState: vi.fn(),
  clearTabStorage: mocks.clearTabStorage,
  clearUnusedStorage: mocks.clearUnusedStorage,
}));
vi.mock("./windowModeCoordinator", () => ({
  clearToolkitWindowState: vi.fn(),
  getCapturedTabs: mocks.getCapturedTabs,
  getToolkitWindowId: mocks.getToolkitWindowId,
  removeTabIdFromToolkitWindowStore: mocks.removeTabIdFromToolkitWindowStore,
  toggleWindowMode: mocks.toggleWindowMode,
}));

const createChromeMock = (getTab: ReturnType<typeof vi.fn>) => {
  const onActivated = vi.fn();
  vi.stubGlobal("chrome", {
    action: { setBadgeText: vi.fn() },
    runtime: {
      onConnect: { addListener: vi.fn() },
      onInstalled: { addListener: vi.fn() },
      onMessage: { addListener: vi.fn() },
      onStartup: { addListener: vi.fn() },
      setUninstallURL: vi.fn(),
    },
    storage: {
      local: { get: vi.fn(), set: vi.fn() },
      session: { remove: vi.fn() },
      onChanged: { addListener: vi.fn() },
    },
    tabs: {
      get: getTab,
      onActivated: { addListener: onActivated },
      onRemoved: { addListener: vi.fn() },
      onUpdated: { addListener: vi.fn() },
      sendMessage: vi.fn(),
    },
    tabCapture: { onStatusChanged: { addListener: vi.fn() } },
    windows: { onRemoved: { addListener: vi.fn() } },
  });
  return { onActivated };
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
    expect(mocks.removeTabIdFromToolkitWindowStore).not.toHaveBeenCalled();
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
      expect(mocks.removeTabIdFromToolkitWindowStore).toHaveBeenCalledWith(12),
    );

    expect(mocks.clearTabStorage).toHaveBeenCalledWith(12);
    expect(mocks.captureCoordinator.handleTabRemoved).toHaveBeenCalledWith(12);
  });
});
