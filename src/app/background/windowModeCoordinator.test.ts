import { beforeEach, describe, expect, test, vi } from "vitest";

import { STORAGE_KEYS } from "../../infrastructure/chrome/storageKeys";
import {
  addTabIdToToolkitWindowStore,
  getCapturedTabs,
  toggleWindowMode,
  removeTabIdFromToolkitWindowStore,
} from "./windowModeCoordinator";

const createChromeMock = (activeTabId: number) => {
  const stored = {
    [STORAGE_KEYS.TOOLKIT_WINDOW_TAB_IDS]: [12, 13, 14],
    [STORAGE_KEYS.CAPTURE_ACTIVE_TAB_ID]: activeTabId,
    [STORAGE_KEYS.TOOLKIT_WINDOW_CAPTURE_STREAM_IDS]: {
      12: "stream-12",
      13: "stream-13",
      14: "stream-14",
    },
  };
  const set = vi.fn().mockResolvedValue(undefined);

  vi.stubGlobal("chrome", {
    storage: {
      session: {
        get: vi.fn().mockResolvedValue(stored),
        set,
      },
    },
  });

  return set;
};

describe("removeTabIdFromToolkitWindowStore", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test("selects the first remaining tab when the active tab closes", async () => {
    const set = createChromeMock(13);

    await removeTabIdFromToolkitWindowStore(13);

    expect(set).toHaveBeenCalledWith({
      [STORAGE_KEYS.TOOLKIT_WINDOW_TAB_IDS]: [12, 14],
      [STORAGE_KEYS.CAPTURE_ACTIVE_TAB_ID]: 12,
      [STORAGE_KEYS.TOOLKIT_WINDOW_CAPTURE_STREAM_IDS]: {
        12: "stream-12",
        14: "stream-14",
      },
    });
  });

  test("keeps the active tab when another captured tab closes", async () => {
    const set = createChromeMock(12);

    await removeTabIdFromToolkitWindowStore(13);

    expect(set).toHaveBeenCalledWith({
      [STORAGE_KEYS.TOOLKIT_WINDOW_TAB_IDS]: [12, 14],
      [STORAGE_KEYS.CAPTURE_ACTIVE_TAB_ID]: 12,
      [STORAGE_KEYS.TOOLKIT_WINDOW_CAPTURE_STREAM_IDS]: {
        12: "stream-12",
        14: "stream-14",
      },
    });
  });

  test("serializes concurrent additions and removals", async () => {
    const state: Record<string, unknown> = {
      [STORAGE_KEYS.TOOLKIT_WINDOW_TAB_IDS]: [12, 13],
      [STORAGE_KEYS.CAPTURE_ACTIVE_TAB_ID]: 12,
      [STORAGE_KEYS.TOOLKIT_WINDOW_CAPTURE_STREAM_IDS]: {
        12: "stream-12",
        13: "stream-13",
      },
    };
    vi.stubGlobal("chrome", {
      storage: {
        session: {
          get: vi.fn(async () => ({
            ...state,
            [STORAGE_KEYS.TOOLKIT_WINDOW_TAB_IDS]: [
              ...(state[STORAGE_KEYS.TOOLKIT_WINDOW_TAB_IDS] as number[]),
            ],
            [STORAGE_KEYS.TOOLKIT_WINDOW_CAPTURE_STREAM_IDS]: {
              ...(state[STORAGE_KEYS.TOOLKIT_WINDOW_CAPTURE_STREAM_IDS] as Record<string, string>),
            },
          })),
          set: vi.fn(async (values: Record<string, unknown>) => {
            Object.assign(state, values);
          }),
        },
      },
    });

    await Promise.all([addTabIdToToolkitWindowStore(14), removeTabIdFromToolkitWindowStore(13)]);

    expect(state).toEqual({
      [STORAGE_KEYS.TOOLKIT_WINDOW_TAB_IDS]: [12, 14],
      [STORAGE_KEYS.CAPTURE_ACTIVE_TAB_ID]: 12,
      [STORAGE_KEYS.TOOLKIT_WINDOW_CAPTURE_STREAM_IDS]: {
        12: "stream-12",
      },
    });
  });
});

describe("getCapturedTabs", () => {
  test("removes a captured tab that disappeared", async () => {
    const state: Record<string, unknown> = {
      [STORAGE_KEYS.TOOLKIT_WINDOW_TAB_IDS]: [12, 13],
      [STORAGE_KEYS.CAPTURE_ACTIVE_TAB_ID]: 13,
      [STORAGE_KEYS.TOOLKIT_WINDOW_CAPTURE_STREAM_IDS]: {
        12: "stream-12",
        13: "stream-13",
      },
    };
    vi.stubGlobal("chrome", {
      storage: {
        session: {
          get: vi.fn(async () => structuredClone(state)),
          set: vi.fn(async (values: Record<string, unknown>) => {
            Object.assign(state, values);
          }),
        },
      },
      tabs: {
        get: vi.fn(async (tabId: number) => {
          if (tabId === 13) throw new Error("No tab with id: 13");
          return { id: tabId, title: `Tab ${tabId}` };
        }),
      },
    });

    const result = await getCapturedTabs();

    expect(result.tabs.map((tab) => tab.id)).toEqual([12]);
    expect(result.activeTabId).toBe(12);
    expect(state[STORAGE_KEYS.TOOLKIT_WINDOW_TAB_IDS]).toEqual([12]);
    expect(state[STORAGE_KEYS.TOOLKIT_WINDOW_CAPTURE_STREAM_IDS]).toEqual({
      12: "stream-12",
    });
  });
});

describe("capture transaction", () => {
  const setupCapture = () => {
    const state: Record<string, unknown> = {
      [STORAGE_KEYS.TOOLKIT_WINDOW_ID]: 5,
      [STORAGE_KEYS.TOOLKIT_WINDOW_TAB_IDS]: [12, 13],
      [STORAGE_KEYS.CAPTURE_ACTIVE_TAB_ID]: 12,
      [STORAGE_KEYS.TOOLKIT_WINDOW_CAPTURE_STREAM_IDS]: { 12: "old-12", 13: "old-13" },
    };
    let resolveStream!: (value: string) => void;
    const stream = new Promise<string>((resolve) => {
      resolveStream = resolve;
    });
    const set = vi.fn(async (values: Record<string, unknown>) => {
      Object.assign(state, values);
    });
    const getMediaStreamId = vi.fn(() => stream);
    const localSet = vi.fn(async () => {});
    vi.stubGlobal("chrome", {
      storage: {
        local: { set: localSet },
        session: {
          get: vi.fn(async () => structuredClone(state)),
          set,
        },
      },
      tabCapture: { getMediaStreamId },
      windows: {
        get: vi.fn(async () => ({ id: 5, state: "normal" })),
        update: vi.fn(async () => {}),
      },
    });
    return { state, set, resolveStream, getMediaStreamId, localSet };
  };

  test("does not restore a tab closed while capture acquisition is pending", async () => {
    const { state, resolveStream, getMediaStreamId } = setupCapture();
    const capture = toggleWindowMode(13);
    await vi.waitFor(() => expect(getMediaStreamId).toHaveBeenCalled());
    const removed = removeTabIdFromToolkitWindowStore(13);
    resolveStream("new-13");
    await Promise.all([capture, removed]);
    expect(state[STORAGE_KEYS.TOOLKIT_WINDOW_TAB_IDS]).toEqual([12]);
    expect(state[STORAGE_KEYS.CAPTURE_ACTIVE_TAB_ID]).toBe(12);
    expect(state[STORAGE_KEYS.TOOLKIT_WINDOW_CAPTURE_STREAM_IDS]).toEqual({ 12: "old-12" });
  });

  test("hands the active tab off through captureActiveTabId for the legacy window", async () => {
    const { state, resolveStream, getMediaStreamId } = setupCapture();
    const capture = toggleWindowMode(13);
    await vi.waitFor(() => expect(getMediaStreamId).toHaveBeenCalled());
    resolveStream("new-13");
    await capture;

    // The legacy window controller reconciles on CAPTURE_ACTIVE_TAB_ID, the
    // same key captureCoordinator writes when the popup selects a tab.
    expect(state[STORAGE_KEYS.CAPTURE_ACTIVE_TAB_ID]).toBe(13);
    expect(state).not.toHaveProperty(STORAGE_KEYS.TOOLKIT_WINDOW_ACTIVE_TAB_ID);
  });

  test("propagates session failures without relabeling them as capture errors", async () => {
    const { set, resolveStream, localSet } = setupCapture();
    const failure = new Error("session write failed");
    set.mockRejectedValueOnce(failure);
    const capture = toggleWindowMode(13);
    const rejection = expect(capture).rejects.toBe(failure);
    resolveStream("new-13");
    await rejection;
    expect(localSet).not.toHaveBeenCalledWith(
      expect.objectContaining({ "captureError.13": expect.anything() }),
    );
  });
});
