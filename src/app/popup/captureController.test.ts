import { afterEach, describe, expect, test, vi } from "vitest";

import { RUNTIME_MESSAGES } from "../../infrastructure/chrome/runtimeMessages";
import { STORAGE_KEYS } from "../../infrastructure/chrome/storageKeys";
import {
  createCaptureController,
  requestTabCapture,
  type CaptureControllerDependencies,
} from "./captureController";

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

const createStorage = () => {
  const localValues: Record<string, unknown> = {};
  const sessionValues: Record<string, unknown> = {};
  return {
    localValues,
    sessionValues,
    local: {
      get: vi.fn((keys: string | string[]) => {
        const requested = Array.isArray(keys) ? keys : [keys];
        return Promise.resolve(Object.fromEntries(requested.map((key) => [key, localValues[key]])));
      }),
      set: vi.fn((values: Record<string, unknown>) => {
        Object.assign(localValues, values);
        return Promise.resolve();
      }),
    },
    session: {
      get: vi.fn((keys: string | string[]) => {
        const requested = Array.isArray(keys) ? keys : [keys];
        return Promise.resolve(
          Object.fromEntries(requested.map((key) => [key, sessionValues[key]])),
        );
      }),
      set: vi.fn((values: Record<string, unknown>) => {
        Object.assign(sessionValues, values);
        return Promise.resolve();
      }),
    },
  };
};

const createEffects = (): CaptureControllerDependencies => ({
  getPointCount: vi.fn(() => Promise.resolve(5)),
  setFilters: vi.fn(),
  initPoints: vi.fn(),
  resize: vi.fn(),
  setGainValue: vi.fn(),
  setEnableButtonClass: vi.fn(),
  setMuteButtonClass: vi.fn(),
  renderCaptureError: vi.fn(),
  renderTabCaptureError: vi.fn(),
  renderTabCaptureStopError: vi.fn(),
  onSpectrumTabChange: vi.fn(),
  renderCapturedTabs: vi.fn(() => Promise.resolve()),
});

const captureSettings = (enabled: boolean) => ({
  enabled,
  gainValue: 0,
  muted: false,
  volumeCompensationEnabled: false,
  filterSettings: [],
});

const setup = (
  options: {
    browserTabId?: number;
    capturedTabs?: Array<{ id: number; enabled: boolean }>;
  } = {},
) => {
  const browserTabId = options.browserTabId ?? 12;
  const capturedTabs = options.capturedTabs ?? [];
  const storage = createStorage();
  const effects = createEffects();
  const sendMessage = vi.fn<(message: { method: string; tabId?: number }) => Promise<unknown>>(
    (message) => {
      if (message.method === RUNTIME_MESSAGES.GET_CAPTURED_TABS) {
        return Promise.resolve({
          tabs: capturedTabs.map((tab) => ({ ...tab, title: `tab ${tab.id}` })),
          activeTabId: capturedTabs[0]?.id ?? null,
        });
      }
      if (message.method === RUNTIME_MESSAGES.START_TAB_CAPTURE) {
        return Promise.resolve({
          ok: true,
          captures: [{ tabId: browserTabId, settings: captureSettings(true) }],
        });
      }
      if (message.method === RUNTIME_MESSAGES.STOP_TAB_CAPTURE) {
        return Promise.resolve({ ok: true, captures: [] });
      }
      if (message.method === RUNTIME_MESSAGES.TOGGLE_CAPTURE_ENABLED) {
        return Promise.resolve({ ok: true });
      }
      return Promise.resolve(undefined);
    },
  );

  vi.stubGlobal("chrome", {
    runtime: { sendMessage },
    tabs: { query: vi.fn(() => Promise.resolve([{ id: browserTabId }])) },
    storage,
  });

  const controller = createCaptureController(effects);
  return { controller, effects, sendMessage, storage, browserTabId };
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("requestTabCapture", () => {
  test("sends a capture request without closing the popup", async () => {
    const reply = { ok: true, captures: [{ tabId: 12, settings: captureSettings(true) }] };
    const sendMessage = vi.fn().mockResolvedValue(reply);
    const close = vi.fn();
    vi.stubGlobal("chrome", { runtime: { sendMessage } });
    vi.stubGlobal("window", { close });

    await expect(requestTabCapture(12)).resolves.toEqual(reply);
    expect(sendMessage).toHaveBeenCalledWith({
      method: RUNTIME_MESSAGES.START_TAB_CAPTURE,
      tabId: 12,
    });
    expect(close).not.toHaveBeenCalled();
  });

  test("surfaces a failed capture response and a thrown error", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const sendMessage = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, error: "capture failed" })
      .mockRejectedValueOnce(new Error("runtime unavailable"));
    vi.stubGlobal("chrome", { runtime: { sendMessage } });

    await expect(requestTabCapture(12)).resolves.toEqual({ ok: false, error: "capture failed" });
    await expect(requestTabCapture(12)).resolves.toEqual({
      ok: false,
      error: "runtime unavailable",
    });
    expect(consoleError).toHaveBeenCalled();
  });
});

describe("capture controller selection", () => {
  test("selects the current browser tab first", async () => {
    const { controller, effects } = setup({
      browserTabId: 12,
      capturedTabs: [{ id: 90, enabled: true }],
    });

    await controller.init();
    await controller.syncSnapshot();

    expect(controller.getSelectedTabId()).toBe(12);
    expect(controller.isTabCaptured(12)).toBe(false);
    expect(controller.isTabCaptured(90)).toBe(true);
    expect(effects.renderCapturedTabs).toHaveBeenCalled();
  });

  test("selects a captured tab and keeps the previous parameters off a neighbour", async () => {
    const { controller, storage } = setup({
      browserTabId: 12,
      capturedTabs: [
        { id: 20, enabled: true },
        { id: 21, enabled: true },
      ],
    });
    await controller.init();

    storage.localValues[STORAGE_KEYS.tabFilters(20)] = [
      { type: "peaking", freq: 1000, gain: 3, q: 0.5 },
    ];
    await controller.selectTab(20);
    expect(controller.getSelectedTabId()).toBe(20);
    expect(storage.sessionValues[STORAGE_KEYS.CAPTURE_ACTIVE_TAB_ID]).toBe(20);

    await controller.selectTab(21);
    expect(controller.getSelectedTabId()).toBe(21);
    expect(storage.sessionValues[STORAGE_KEYS.CAPTURE_ACTIVE_TAB_ID]).toBe(21);
  });
});

describe("capture controller commands", () => {
  test("blocks re-entry while a start is pending and shows capture state on success", async () => {
    const { controller, effects, sendMessage } = setup({ browserTabId: 12 });
    await controller.init();
    const start = deferred<unknown>();
    sendMessage.mockImplementation((message) => {
      if (message.method === RUNTIME_MESSAGES.START_TAB_CAPTURE) return start.promise;
      if (message.method === RUNTIME_MESSAGES.GET_CAPTURED_TABS) {
        return Promise.resolve({ tabs: [{ id: 12, enabled: true }], activeTabId: 12 });
      }
      return Promise.resolve({ ok: true });
    });

    const first = controller.startCapture();
    const second = await controller.startCapture();
    expect(second).toEqual({ ok: false, error: "capture-start-pending" });
    await vi.waitFor(() => {
      expect(
        sendMessage.mock.calls.filter(([m]) => m.method === RUNTIME_MESSAGES.START_TAB_CAPTURE),
      ).toHaveLength(1);
    });

    start.resolve({
      ok: true,
      captures: [{ tabId: 12, settings: captureSettings(true) }],
    });
    await expect(first).resolves.toEqual({
      ok: true,
      captures: [{ tabId: 12, settings: captureSettings(true) }],
    });
    expect(controller.getSelectedTabId()).toBe(12);
    expect(controller.isTabCaptured(12)).toBe(true);
    expect(effects.renderTabCaptureError).not.toHaveBeenCalled();
  });

  test("preserves bypass when starting an already captured tab", async () => {
    const { controller, effects, sendMessage } = setup({
      browserTabId: 12,
      capturedTabs: [{ id: 12, enabled: false }],
    });
    await controller.init();
    sendMessage.mockImplementation((message) => {
      if (message.method === RUNTIME_MESSAGES.START_TAB_CAPTURE) {
        return Promise.resolve({
          ok: true,
          captures: [
            { tabId: 21, settings: captureSettings(true) },
            { tabId: 12, settings: captureSettings(false) },
          ],
        });
      }
      return Promise.resolve({ ok: true });
    });

    await controller.startCapture();

    expect(effects.setEnableButtonClass).toHaveBeenLastCalledWith(false);
    await controller.toggleCaptureEnabled(12);
    expect(effects.setEnableButtonClass).toHaveBeenLastCalledWith(true);
  });

  test("rejects a successful start reply without the requested capture", async () => {
    const { controller, effects, sendMessage } = setup({ browserTabId: 12 });
    await controller.init();
    sendMessage.mockImplementation((message) =>
      message.method === RUNTIME_MESSAGES.START_TAB_CAPTURE
        ? Promise.resolve({ ok: true, captures: [] })
        : Promise.resolve({ ok: true }),
    );

    const reply = await controller.startCapture();

    expect(reply.ok).toBe(false);
    expect(effects.renderTabCaptureError).toHaveBeenCalled();
    expect(controller.isTabCaptured(12)).toBe(false);
  });

  test("shows a localized start error and keeps controls available on failure", async () => {
    const { controller, effects, sendMessage } = setup({ browserTabId: 12 });
    await controller.init();
    sendMessage.mockImplementation(() =>
      Promise.resolve({ ok: false, error: "tabCapture denied" }),
    );

    const reply = await controller.startCapture();

    expect(reply).toEqual({ ok: false, error: "tabCapture denied" });
    expect(effects.renderTabCaptureError).toHaveBeenCalledOnce();
    // Controls stay usable: a later successful start is still possible.
    await expect(controller.startCapture()).resolves.toEqual(reply);
  });

  test("shows a localized stop error when stopping fails", async () => {
    const { controller, effects, sendMessage } = setup({
      browserTabId: 12,
      capturedTabs: [{ id: 20, enabled: true }],
    });
    await controller.init();
    sendMessage.mockImplementation((message) => {
      if (message.method === RUNTIME_MESSAGES.STOP_TAB_CAPTURE) {
        return Promise.resolve({ ok: false, error: "stop denied" });
      }
      return Promise.resolve(undefined);
    });

    await controller.stopCapture(20);

    expect(effects.renderTabCaptureStopError).toHaveBeenCalledOnce();
    expect(effects.renderCaptureError).not.toHaveBeenCalledWith("stop denied");
  });

  test("stops A while B stays alive and reverts selection to the browser tab", async () => {
    const { controller, effects, sendMessage, storage } = setup({
      browserTabId: 12,
      capturedTabs: [
        { id: 20, enabled: true },
        { id: 21, enabled: true },
      ],
    });
    await controller.init();
    await controller.selectTab(20);
    vi.mocked(effects.onSpectrumTabChange).mockClear();

    sendMessage.mockImplementation((message) => {
      if (message.method === RUNTIME_MESSAGES.GET_CAPTURED_TABS) {
        return Promise.resolve({ tabs: [{ id: 21, enabled: true }], activeTabId: 21 });
      }
      return Promise.resolve({ ok: true, captures: [] });
    });

    await controller.stopCapture(20);

    expect(controller.isTabCaptured(20)).toBe(false);
    expect(controller.isTabCaptured(21)).toBe(true);
    expect(controller.getSelectedTabId()).toBe(12);
    expect(effects.onSpectrumTabChange).toHaveBeenLastCalledWith(12);
    expect(effects.renderCapturedTabs).toHaveBeenCalled();

    storage.sessionValues[STORAGE_KEYS.CAPTURE_ACTIVE_TAB_ID] = 21;
    await controller.handleStorageChange({
      [STORAGE_KEYS.CAPTURE_ACTIVE_TAB_ID]: { oldValue: 20, newValue: 21 },
    });

    expect(controller.getSelectedTabId()).toBe(12);
  });

  test("moves spectrum to the browser tab when a selected capture ends externally", async () => {
    const { controller, effects, sendMessage } = setup({
      browserTabId: 12,
      capturedTabs: [{ id: 20, enabled: true }],
    });
    await controller.init();
    await controller.selectTab(20);
    vi.mocked(effects.onSpectrumTabChange).mockClear();

    sendMessage.mockImplementation((message) => {
      if (message.method === RUNTIME_MESSAGES.GET_CAPTURED_TABS) {
        return Promise.resolve({ tabs: [], activeTabId: null });
      }
      return Promise.resolve({ ok: true, captures: [] });
    });

    await controller.handleStorageChange({
      [STORAGE_KEYS.CAPTURE_TAB_IDS]: { oldValue: [{ tabId: 20 }], newValue: [] },
    });

    expect(controller.getSelectedTabId()).toBe(12);
    expect(effects.onSpectrumTabChange).toHaveBeenLastCalledWith(12);
    expect(
      sendMessage.mock.calls.filter(([m]) => m.method === RUNTIME_MESSAGES.STOP_TAB_CAPTURE),
    ).toHaveLength(0);
  });

  test("does not move spectrum for a superseded fallback load", async () => {
    const { controller, effects, storage } = setup({
      browserTabId: 12,
      capturedTabs: [
        { id: 20, enabled: true },
        { id: 21, enabled: true },
      ],
    });
    await controller.init();
    await controller.selectTab(20);
    vi.mocked(effects.onSpectrumTabChange).mockClear();

    const staleRead = deferred<Record<string, unknown>>();
    storage.local.get.mockImplementation((keys) => {
      const requested = Array.isArray(keys) ? keys : [keys];
      if (requested.includes(STORAGE_KEYS.tabFilters(12))) return staleRead.promise;
      return Promise.resolve(
        Object.fromEntries(requested.map((key) => [key, storage.localValues[key]])),
      );
    });

    const fallback = controller.stopCapture(20);
    await vi.waitFor(() => {
      expect(storage.local.get).toHaveBeenCalledWith(
        expect.arrayContaining([STORAGE_KEYS.tabFilters(12)]),
      );
    });
    await controller.selectTab(21);
    staleRead.resolve({});
    await fallback;

    expect(controller.getSelectedTabId()).toBe(21);
    expect(effects.onSpectrumTabChange).toHaveBeenLastCalledWith(21);
  });

  test("keeps the browser tab selected after a late active-capture removal", async () => {
    const { controller, sendMessage, storage } = setup({
      browserTabId: 12,
      capturedTabs: [{ id: 12, enabled: true }],
    });
    await controller.init();

    sendMessage.mockImplementation((message) => {
      if (message.method === RUNTIME_MESSAGES.GET_CAPTURED_TABS) {
        return Promise.resolve({ tabs: [], activeTabId: null });
      }
      return Promise.resolve({ ok: true, captures: [] });
    });

    await controller.stopCapture(12);
    storage.sessionValues[STORAGE_KEYS.CAPTURE_ACTIVE_TAB_ID] = null;
    await controller.handleStorageChange({
      [STORAGE_KEYS.CAPTURE_ACTIVE_TAB_ID]: { oldValue: 12, newValue: null },
    });

    expect(controller.getSelectedTabId()).toBe(12);
  });

  test("falls back to the browser tab when capture ends outside the popup", async () => {
    const { controller, sendMessage, storage } = setup({
      browserTabId: 12,
      capturedTabs: [{ id: 12, enabled: true }],
    });
    await controller.init();

    sendMessage.mockImplementation((message) =>
      message.method === RUNTIME_MESSAGES.GET_CAPTURED_TABS
        ? Promise.resolve({ tabs: [], activeTabId: null })
        : Promise.resolve({ ok: true }),
    );
    storage.sessionValues[STORAGE_KEYS.CAPTURE_ACTIVE_TAB_ID] = null;

    await controller.handleStorageChange({
      [STORAGE_KEYS.CAPTURE_TAB_IDS]: { oldValue: [{ tabId: 12 }], newValue: [] },
      [STORAGE_KEYS.CAPTURE_ACTIVE_TAB_ID]: { oldValue: 12, newValue: null },
    });

    expect(controller.getSelectedTabId()).toBe(12);
  });

  test("toggles the live bypass of the selected capture and refreshes the button", async () => {
    const { controller, effects, sendMessage } = setup({
      browserTabId: 12,
      capturedTabs: [
        { id: 20, enabled: true },
        { id: 21, enabled: true },
      ],
    });
    await controller.init();
    await controller.selectTab(20);

    await controller.toggleCaptureEnabled(20);

    expect(sendMessage).toHaveBeenCalledWith({
      method: RUNTIME_MESSAGES.TOGGLE_CAPTURE_ENABLED,
      tabId: 20,
    });
    expect(effects.setEnableButtonClass).toHaveBeenLastCalledWith(false);
  });

  test("re-renders captured tabs when capture storage changes", async () => {
    const { controller, effects } = setup({ browserTabId: 12 });
    await controller.init();
    vi.mocked(effects.renderCapturedTabs).mockClear();

    await controller.handleStorageChange({
      [STORAGE_KEYS.CAPTURE_TAB_IDS]: { newValue: [] },
    });

    expect(effects.renderCapturedTabs).toHaveBeenCalled();
  });
});
