import { beforeEach, describe, expect, test, vi } from "vitest";

import type {
  CaptureReply,
  CaptureState,
  OffscreenCommand,
} from "../../infrastructure/chrome/runtimeMessages";
import { STORAGE_KEYS } from "../../infrastructure/chrome/storageKeys";
import { createCaptureCoordinator } from "./captureCoordinator";

interface Harness {
  open: boolean;
  captures: Map<number, CaptureState>;
  commands: OffscreenCommand[];
  events: string[];
  local: Record<string, unknown>;
  session: Record<string, unknown>;
  onCommand?: (command: OffscreenCommand) => CaptureReply;
  createDocument: ReturnType<typeof vi.fn>;
  closeDocument: ReturnType<typeof vi.fn>;
  getMediaStreamId: ReturnType<typeof vi.fn>;
}

const readStore = (
  store: Record<string, unknown>,
  keys: string | string[],
): Record<string, unknown> => {
  const list = typeof keys === "string" ? [keys] : keys;
  const result: Record<string, unknown> = {};
  for (const key of list) {
    if (key in store) result[key] = store[key];
  }
  return result;
};

const removeStore = (store: Record<string, unknown>, keys: string | string[]): void => {
  const list = typeof keys === "string" ? [keys] : keys;
  for (const key of list) delete store[key];
};

const createHarness = (): Harness => {
  const harness: Harness = {
    open: false,
    captures: new Map(),
    commands: [],
    events: [],
    local: {},
    session: {},
    createDocument: vi.fn(),
    closeDocument: vi.fn(),
    getMediaStreamId: vi.fn(),
  };
  let streamCounter = 0;

  const defaultCommand = (command: OffscreenCommand): CaptureReply => {
    if (command.method === "capture-start") {
      harness.captures.set(command.tabId, { tabId: command.tabId, settings: command.settings });
    } else if (command.method === "capture-stop") {
      harness.captures.delete(command.tabId);
    } else if (command.method === "capture-settings") {
      const existing = harness.captures.get(command.tabId);
      if (existing) {
        harness.captures.set(command.tabId, { ...existing, settings: command.settings });
      }
    }
    return { ok: true, captures: [...harness.captures.values()] };
  };

  harness.createDocument.mockImplementation(async (parameters: { reasons: string[] }) => {
    harness.events.push("create-document");
    expect(parameters.reasons).toContain("USER_MEDIA");
    harness.open = true;
  });
  harness.closeDocument.mockImplementation(async () => {
    harness.events.push("close-document");
    harness.open = false;
  });
  harness.getMediaStreamId.mockImplementation(async (options: { targetTabId: number }) => {
    harness.events.push(`stream-id:${options.targetTabId}`);
    streamCounter += 1;
    return `stream-${streamCounter}`;
  });

  const sendMessage = vi.fn(async (command: OffscreenCommand) => {
    harness.commands.push(command);
    harness.events.push(`send:${command.method}`);
    return harness.onCommand ? harness.onCommand(command) : defaultCommand(command);
  });

  vi.stubGlobal("chrome", {
    runtime: {
      id: "test-extension",
      getURL: vi.fn((path: string) => `chrome-extension://test-extension/${path}`),
      getContexts: vi.fn(async () =>
        harness.open ? [{ documentUrl: "chrome-extension://test-extension/offscreen.html" }] : [],
      ),
      sendMessage,
    },
    offscreen: {
      Reason: { USER_MEDIA: "USER_MEDIA" },
      createDocument: harness.createDocument,
      closeDocument: harness.closeDocument,
    },
    storage: {
      local: {
        get: vi.fn(async (keys: string | string[]) => readStore(harness.local, keys)),
        set: vi.fn(async (values: Record<string, unknown>) => {
          Object.assign(harness.local, values);
        }),
        remove: vi.fn(async (keys: string | string[]) => removeStore(harness.local, keys)),
      },
      session: {
        get: vi.fn(async (keys: string | string[]) => readStore(harness.session, keys)),
        set: vi.fn(async (values: Record<string, unknown>) => {
          Object.assign(harness.session, values);
        }),
        remove: vi.fn(async (keys: string | string[]) => removeStore(harness.session, keys)),
      },
    },
    tabCapture: { getMediaStreamId: harness.getMediaStreamId },
    tabs: {
      get: vi.fn(async (tabId: number) => ({
        id: tabId,
        title: `Tab ${tabId}`,
        url: `https://example.com/${tabId}`,
        favIconUrl: "icon.png",
      })),
    },
  });

  return harness;
};

describe("captureCoordinator", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test("starts two tabs with one document and a fresh stream id per tab", async () => {
    const harness = createHarness();
    const coordinator = createCaptureCoordinator();

    const [first, second] = await Promise.all([
      coordinator.startCapture(1),
      coordinator.startCapture(2),
    ]);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(harness.createDocument).toHaveBeenCalledTimes(1);
    expect(harness.getMediaStreamId).toHaveBeenCalledWith({ targetTabId: 1 });
    expect(harness.getMediaStreamId).toHaveBeenCalledWith({ targetTabId: 2 });
    const starts = harness.commands.filter((command) => command.method === "capture-start");
    expect(starts).toHaveLength(2);
    expect(new Set(starts.map((command) => command.streamId)).size).toBe(2);
    expect([...harness.captures.keys()].sort()).toEqual([1, 2]);
  });

  test("does not request a new stream id for an already active tab", async () => {
    const harness = createHarness();
    const coordinator = createCaptureCoordinator();

    await coordinator.startCapture(1);
    const again = await coordinator.startCapture(1);

    expect(again.ok).toBe(true);
    expect(harness.getMediaStreamId).toHaveBeenCalledTimes(1);
    expect(harness.commands.filter((command) => command.method === "capture-start")).toHaveLength(
      1,
    );
  });

  test("orders document, stream id and handoff before reporting success", async () => {
    const harness = createHarness();
    const coordinator = createCaptureCoordinator();

    await coordinator.startCapture(1);

    expect(harness.events).toEqual(["create-document", "stream-id:1", "send:capture-start"]);
  });

  test("keeps the document when one of several captures is stopped", async () => {
    const harness = createHarness();
    const coordinator = createCaptureCoordinator();
    await coordinator.startCapture(1);
    await coordinator.startCapture(2);

    const reply = await coordinator.stopCapture(1);

    expect(reply.ok).toBe(true);
    expect(harness.open).toBe(true);
    expect([...harness.captures.keys()]).toEqual([2]);
  });

  test("keeps a newly started capture alive when another stops concurrently", async () => {
    const harness = createHarness();
    const coordinator = createCaptureCoordinator();
    await coordinator.startCapture(1);

    await Promise.all([coordinator.stopCapture(1), coordinator.startCapture(2)]);

    expect(harness.open).toBe(true);
    expect([...harness.captures.keys()]).toEqual([2]);
  });

  test("releases the queue after a start failure", async () => {
    const harness = createHarness();
    harness.getMediaStreamId.mockRejectedValueOnce(new Error("no stream id"));
    const coordinator = createCaptureCoordinator();

    const failed = await coordinator.startCapture(1);
    const recovered = await coordinator.startCapture(2);

    expect(failed).toEqual({ ok: false, error: "no stream id" });
    expect(recovered.ok).toBe(true);
  });

  test("restores the page equalizer and records the error when the stream id fails", async () => {
    const harness = createHarness();
    harness.local[STORAGE_KEYS.tabEnabled(1)] = true;
    harness.getMediaStreamId.mockRejectedValueOnce(new Error("no stream id"));
    const coordinator = createCaptureCoordinator();

    const reply = await coordinator.startCapture(1);

    expect(reply).toEqual({ ok: false, error: "no stream id" });
    expect(harness.local[STORAGE_KEYS.tabEnabled(1)]).toBe(true);
    expect(harness.local[STORAGE_KEYS.tabCaptureError(1)]).toBe("no stream id");
    expect(harness.session[STORAGE_KEYS.CAPTURE_TAB_IDS]).toEqual([]);
  });

  test("does not overwrite a newer user change while rolling back the page equalizer", async () => {
    const harness = createHarness();
    harness.local[STORAGE_KEYS.tabEnabled(1)] = false;
    harness.getMediaStreamId.mockImplementationOnce(async () => {
      harness.local[STORAGE_KEYS.tabEnabled(1)] = true;
      throw new Error("no stream id");
    });
    const coordinator = createCaptureCoordinator();

    await coordinator.startCapture(1);

    expect(harness.local[STORAGE_KEYS.tabEnabled(1)]).toBe(true);
  });

  test("reports a stream handoff failure without marking a session active", async () => {
    const harness = createHarness();
    harness.local[STORAGE_KEYS.tabEnabled(1)] = true;
    harness.onCommand = (command) =>
      command.method === "capture-start"
        ? { ok: false, error: "getUserMedia failed" }
        : { ok: true, captures: [...harness.captures.values()] };
    const coordinator = createCaptureCoordinator();

    const reply = await coordinator.startCapture(1);

    expect(reply).toEqual({ ok: false, error: "getUserMedia failed" });
    expect(harness.captures.size).toBe(0);
    expect(harness.local[STORAGE_KEYS.tabCaptureError(1)]).toBe("getUserMedia failed");
    expect(harness.local[STORAGE_KEYS.tabEnabled(1)]).toBe(true);
    expect(harness.session[STORAGE_KEYS.CAPTURE_TAB_IDS]).toEqual([]);
  });

  test("clears stale state and uses a fresh id when the document is gone", async () => {
    const harness = createHarness();
    const coordinator = createCaptureCoordinator();
    await coordinator.startCapture(1);
    const firstStreamId = harness.commands.find(
      (command) => command.method === "capture-start",
    )?.streamId;

    harness.open = false;
    harness.captures.clear();
    const restarted = createCaptureCoordinator();

    expect(await restarted.getCaptures()).toEqual([]);
    expect(harness.session[STORAGE_KEYS.CAPTURE_TAB_IDS]).toEqual([]);

    const reply = await restarted.startCapture(3);

    expect(reply.ok).toBe(true);
    const startCommands = harness.commands.filter((command) => command.method === "capture-start");
    expect(startCommands.at(-1)?.streamId).not.toBe(firstStreamId);
  });

  test("restores ordinary mode for an interrupted start when the document is gone", async () => {
    const harness = createHarness();
    harness.session[STORAGE_KEYS.CAPTURE_TAB_IDS] = [
      { tabId: 4, previousTabEnabled: true, status: "starting" },
    ];
    harness.local[STORAGE_KEYS.tabEnabled(4)] = false;
    const coordinator = createCaptureCoordinator();

    expect(await coordinator.getCaptures()).toEqual([]);
    expect(harness.local[STORAGE_KEYS.tabEnabled(4)]).toBe(true);
    expect(harness.session[STORAGE_KEYS.CAPTURE_TAB_IDS]).toEqual([]);
  });

  test("restores ordinary mode and notifies an interrupted start when the document survives", async () => {
    const harness = createHarness();
    harness.open = true;
    harness.session[STORAGE_KEYS.CAPTURE_TAB_IDS] = [
      { tabId: 4, previousTabEnabled: true, status: "starting" },
    ];
    harness.local[STORAGE_KEYS.tabEnabled(4)] = false;
    const notifyCaptureModeChanged = vi.fn(() => Promise.resolve());
    const coordinator = createCaptureCoordinator({ notifyCaptureModeChanged });

    expect(await coordinator.getCaptures()).toEqual([]);

    expect(harness.local[STORAGE_KEYS.tabEnabled(4)]).toBe(true);
    expect(harness.session[STORAGE_KEYS.CAPTURE_TAB_IDS]).toEqual([]);
    expect(notifyCaptureModeChanged).toHaveBeenCalledWith(4);
  });

  test("restores ordinary mode for a vanished active session when the document is gone", async () => {
    const harness = createHarness();
    harness.session[STORAGE_KEYS.CAPTURE_TAB_IDS] = [
      { tabId: 5, previousTabEnabled: true, status: "active" },
    ];
    harness.local[STORAGE_KEYS.tabEnabled(5)] = false;
    const coordinator = createCaptureCoordinator();

    expect(await coordinator.getCaptures()).toEqual([]);

    expect(harness.local[STORAGE_KEYS.tabEnabled(5)]).toBe(true);
    expect(harness.session[STORAGE_KEYS.CAPTURE_TAB_IDS]).toEqual([]);
  });

  test("clears stale capture state before restoring ordinary mode", async () => {
    const harness = createHarness();
    harness.session[STORAGE_KEYS.CAPTURE_TAB_IDS] = [
      { tabId: 5, previousTabEnabled: true, status: "active" },
    ];
    harness.session[STORAGE_KEYS.CAPTURE_ACTIVE_TAB_ID] = 5;
    harness.local[STORAGE_KEYS.tabEnabled(5)] = false;
    const notifyCaptureModeChanged = vi.fn(async () => {
      expect(harness.session[STORAGE_KEYS.CAPTURE_TAB_IDS]).toEqual([]);
      expect(harness.session[STORAGE_KEYS.CAPTURE_ACTIVE_TAB_ID]).toBeNull();
    });
    const coordinator = createCaptureCoordinator({ notifyCaptureModeChanged });

    expect(await coordinator.getCaptures()).toEqual([]);

    expect(harness.local[STORAGE_KEYS.tabEnabled(5)]).toBe(true);
    expect(notifyCaptureModeChanged).toHaveBeenCalledOnce();
    expect(notifyCaptureModeChanged).toHaveBeenCalledWith(5);
  });

  test("keeps live captures and syncs storage after a service worker restart", async () => {
    const harness = createHarness();
    const first = createCaptureCoordinator();
    await first.startCapture(1);

    harness.closeDocument.mockClear();
    const restarted = createCaptureCoordinator();
    const captures = await restarted.getCaptures();

    expect(captures.map((capture) => capture.tabId)).toEqual([1]);
    expect(harness.closeDocument).not.toHaveBeenCalled();
    expect(harness.open).toBe(true);
    expect(harness.session[STORAGE_KEYS.CAPTURE_TAB_IDS]).toEqual([
      { tabId: 1, previousTabEnabled: false, status: "active" },
    ]);
  });

  test("closes a surviving offscreen document when reconciliation finds no captures", async () => {
    const harness = createHarness();
    harness.open = true;
    const coordinator = createCaptureCoordinator();

    expect(await coordinator.getCaptures()).toEqual([]);

    expect(harness.closeDocument).toHaveBeenCalledOnce();
    expect(harness.open).toBe(false);
  });

  test("closes the document when the last capture ends", async () => {
    const harness = createHarness();
    const coordinator = createCaptureCoordinator();
    await coordinator.startCapture(1);

    harness.captures.delete(1);
    await coordinator.handleCaptureEnded(1);

    expect(harness.closeDocument).toHaveBeenCalledTimes(1);
    expect(harness.open).toBe(false);
    expect(harness.session[STORAGE_KEYS.CAPTURE_TAB_IDS]).toEqual([]);
  });

  test("removes a capture when its tab closes and keeps the document for others", async () => {
    const harness = createHarness();
    const coordinator = createCaptureCoordinator();
    await coordinator.startCapture(1);
    await coordinator.startCapture(2);

    await coordinator.handleTabRemoved(1);

    expect([...harness.captures.keys()]).toEqual([2]);
    expect(harness.closeDocument).not.toHaveBeenCalled();
    expect(
      harness.commands.some((command) => command.method === "capture-stop" && command.tabId === 1),
    ).toBe(true);
  });

  test("updates settings only for live sessions", async () => {
    const harness = createHarness();
    const coordinator = createCaptureCoordinator();
    await coordinator.startCapture(1);

    await coordinator.updateCaptureSettings(1);
    await coordinator.updateCaptureSettings(99);

    const settingsCommands = harness.commands.filter(
      (command) => command.method === "capture-settings",
    );
    expect(settingsCommands).toHaveLength(1);
    expect(settingsCommands[0]).toMatchObject({ tabId: 1 });
  });

  test("applies a per-tab storage change only to its live session", async () => {
    const harness = createHarness();
    const coordinator = createCaptureCoordinator();
    await coordinator.startCapture(1);
    await coordinator.startCapture(2);
    harness.local[STORAGE_KEYS.tabGain(1)] = -6;
    harness.local[STORAGE_KEYS.tabMute(1)] = true;

    await coordinator.handleStorageChange({
      [STORAGE_KEYS.tabGain(1)]: { newValue: -6, oldValue: 0 },
      [STORAGE_KEYS.tabMute(1)]: { newValue: true, oldValue: false },
    });

    const settingsCommands = harness.commands.filter(
      (command) => command.method === "capture-settings",
    );
    expect(settingsCommands).toHaveLength(1);
    expect(settingsCommands[0]).toMatchObject({
      tabId: 1,
      settings: { gainValue: -6, muted: true },
    });
    expect(harness.captures.get(2)?.settings.gainValue).toBe(0);
  });

  test("applies global storage changes to every live session", async () => {
    const harness = createHarness();
    const coordinator = createCaptureCoordinator();
    await coordinator.startCapture(1);
    await coordinator.startCapture(2);
    harness.local[STORAGE_KEYS.ENABLE_VOLUME_COMPENSATION] = false;

    await coordinator.handleStorageChange({
      [STORAGE_KEYS.ENABLE_VOLUME_COMPENSATION]: { newValue: false, oldValue: true },
    });

    const settingsCommands = harness.commands.filter(
      (command) => command.method === "capture-settings",
    );
    expect(settingsCommands.map((command) => command.tabId).sort()).toEqual([1, 2]);
    expect(harness.captures.get(1)?.settings.volumeCompensationEnabled).toBe(false);
    expect(harness.captures.get(2)?.settings.volumeCompensationEnabled).toBe(false);
  });

  test("ignores storage changes for tabs without a live session", async () => {
    const harness = createHarness();
    const coordinator = createCaptureCoordinator();
    await coordinator.startCapture(1);

    await coordinator.handleStorageChange({
      [STORAGE_KEYS.tabGain(99)]: { newValue: -6, oldValue: 0 },
    });

    expect(
      harness.commands.filter((command) => command.method === "capture-settings"),
    ).toHaveLength(0);
  });

  test("notifies content scripts to bypass before the capture graph connects", async () => {
    const harness = createHarness();
    const notifyCaptureModeChanged = vi.fn(async (tabId: number) => {
      harness.events.push(`mode-changed:${tabId}`);
    });
    const coordinator = createCaptureCoordinator({ notifyCaptureModeChanged });

    await coordinator.startCapture(1);

    expect(harness.events).toEqual([
      "create-document",
      "mode-changed:1",
      "stream-id:1",
      "send:capture-start",
    ]);
  });

  test("notifies content scripts when a capture stops", async () => {
    createHarness();
    const notifyCaptureModeChanged = vi.fn(() => Promise.resolve());
    const coordinator = createCaptureCoordinator({ notifyCaptureModeChanged });
    await coordinator.startCapture(1);
    notifyCaptureModeChanged.mockClear();

    await coordinator.stopCapture(1);

    expect(notifyCaptureModeChanged).toHaveBeenCalledWith(1);
  });

  test("toggles bypass in the live offscreen session without stopping audio", async () => {
    const harness = createHarness();
    const coordinator = createCaptureCoordinator();
    await coordinator.startCapture(1);

    await coordinator.toggleCaptureEnabled(1);

    expect(harness.captures.get(1)?.settings.enabled).toBe(false);
    expect(harness.commands.some((command) => command.method === "capture-stop")).toBe(false);
    expect(harness.captures.has(1)).toBe(true);

    await coordinator.toggleCaptureEnabled(1);

    expect(harness.captures.get(1)?.settings.enabled).toBe(true);
  });

  test("reports the resulting enabled state so a caller can update the tab badge", async () => {
    createHarness();
    const coordinator = createCaptureCoordinator();
    await coordinator.startCapture(1);

    expect(await coordinator.toggleCaptureEnabled(1)).toBe(false);
    expect(await coordinator.toggleCaptureEnabled(1)).toBe(true);
    expect(await coordinator.toggleCaptureEnabled(99)).toBeNull();
  });

  test("keeps ordinary mode off after stop and lets a normal enable through", async () => {
    const harness = createHarness();
    harness.local[STORAGE_KEYS.tabEnabled(1)] = true;
    const coordinator = createCaptureCoordinator();
    await coordinator.startCapture(1);
    expect(harness.local[STORAGE_KEYS.tabEnabled(1)]).toBe(false);

    await coordinator.stopCapture(1);

    expect(harness.local[STORAGE_KEYS.tabEnabled(1)]).toBe(false);
    expect(await coordinator.getCaptures()).toEqual([]);

    harness.local[STORAGE_KEYS.tabEnabled(1)] = true;
    await coordinator.handleStorageChange({
      [STORAGE_KEYS.tabEnabled(1)]: { newValue: true, oldValue: false },
    });

    expect(harness.local[STORAGE_KEYS.tabEnabled(1)]).toBe(true);
    expect(harness.open).toBe(false);
  });

  test("starts the offscreen session while disabling an active page equalizer", async () => {
    const harness = createHarness();
    harness.local[STORAGE_KEYS.tabEnabled(1)] = true;
    const coordinator = createCaptureCoordinator();

    await coordinator.startCapture(1);

    expect(harness.local[STORAGE_KEYS.tabEnabled(1)]).toBe(false);
    expect(harness.captures.get(1)?.settings.enabled).toBe(true);
  });

  test("returns captured tabs with metadata and the selected active tab", async () => {
    const harness = createHarness();
    const coordinator = createCaptureCoordinator();
    await coordinator.startCapture(1);
    await coordinator.startCapture(2);

    const result = await coordinator.getCapturedTabs();

    expect(result.tabs.map((tab) => tab.id)).toEqual([1, 2]);
    expect(result.tabs.every((tab) => tab.title === `Tab ${tab.id}`)).toBe(true);
    expect(result.activeTabId).toBe(2);
    expect(harness.open).toBe(true);
  });
});
