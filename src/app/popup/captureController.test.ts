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
        return Promise.resolve({ ok: true, captures: [] });
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
    const sendMessage = vi.fn().mockResolvedValue({ ok: true, captures: [] });
    const close = vi.fn();
    vi.stubGlobal("chrome", { runtime: { sendMessage } });
    vi.stubGlobal("window", { close });

    const reply = await requestTabCapture(12);

    expect(reply).toEqual({ ok: true, captures: [] });
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

    start.resolve({ ok: true, captures: [] });
    await expect(first).resolves.toEqual({ ok: true, captures: [] });
    expect(controller.getSelectedTabId()).toBe(12);
    expect(controller.isTabCaptured(12)).toBe(true);
    expect(effects.renderTabCaptureError).not.toHaveBeenCalled();
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
    const { controller, effects, sendMessage } = setup({
      browserTabId: 12,
      capturedTabs: [
        { id: 20, enabled: true },
        { id: 21, enabled: true },
      ],
    });
    await controller.init();
    await controller.selectTab(20);

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
    expect(effects.renderCapturedTabs).toHaveBeenCalled();
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
