import { beforeEach, describe, expect, test, vi } from "vitest";

import { STORAGE_KEYS } from "../../infrastructure/chrome/storageKeys";
import {
  clearLegacyToolkitWindowState,
  clearTabStorage,
  clearUnusedStorage,
  parseTabStorageKey,
} from "./storageCleanup";

describe("clearUnusedStorage", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test("keeps the configured point count", async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("chrome", {
      tabs: {
        query: vi.fn().mockResolvedValue([]),
      },
      storage: {
        local: {
          getKeys: vi.fn().mockResolvedValue([STORAGE_KEYS.POINT_COUNT]),
          remove,
        },
      },
    });

    await clearUnusedStorage();

    expect(remove).not.toHaveBeenCalled();
  });

  test("removes only known tab values for closed tabs", async () => {
    let finishRemove!: () => void;
    const remove = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishRemove = resolve;
        }),
    );
    vi.stubGlobal("chrome", {
      tabs: {
        query: vi.fn().mockResolvedValue([{ id: 12 }]),
      },
      storage: {
        local: {
          getKeys: vi
            .fn()
            .mockResolvedValue([
              STORAGE_KEYS.HIDE_DEFAULT_PRESETS,
              STORAGE_KEYS.SKIP_POINTS_CONFIRM,
              "futureSetting",
              STORAGE_KEYS.tabFilters(12),
              STORAGE_KEYS.tabVolume(13),
              "custom.13",
            ]),
          remove,
        },
      },
    });

    let cleanupFinished = false;
    const cleanup = clearUnusedStorage().then(() => {
      cleanupFinished = true;
    });
    await vi.waitFor(() => expect(remove).toHaveBeenCalled());

    expect(remove).toHaveBeenCalledWith(["volume.13"]);
    expect(remove).not.toHaveBeenCalledWith(
      expect.arrayContaining(["hideDefaultPresets", "skipPointsResetConfirm", "futureSetting"]),
    );
    expect(cleanupFinished).toBe(false);

    finishRemove();
    await cleanup;

    expect(cleanupFinished).toBe(true);
  });
});

describe("parseTabStorageKey", () => {
  test("requires a known prefix and an exact safe integer suffix", () => {
    expect(parseTabStorageKey("filters.12")).toBe(12);
    expect(parseTabStorageKey("filters.12junk")).toBeNull();
    expect(parseTabStorageKey("custom.12")).toBeNull();
    expect(parseTabStorageKey("filters.9007199254740992")).toBeNull();
  });
});

describe("clearTabStorage", () => {
  test("removes every known local value for the tab", async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("chrome", {
      storage: {
        local: { remove },
      },
    });

    await clearTabStorage(7);

    expect(remove).toHaveBeenCalledWith([
      "filters.7",
      "enabled.7",
      "mute.7",
      "gain.7",
      "volume.7",
      "pan.7",
      "captureError.7",
      "spectrum.7",
    ]);
  });
});

describe("clearLegacyToolkitWindowState", () => {
  test("removes the four legacy session keys without touching other storage", async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("chrome", {
      storage: {
        session: { remove },
      },
    });

    await clearLegacyToolkitWindowState();

    expect(remove).toHaveBeenCalledWith([
      STORAGE_KEYS.TOOLKIT_WINDOW_ID,
      STORAGE_KEYS.TOOLKIT_WINDOW_TAB_IDS,
      STORAGE_KEYS.TOOLKIT_WINDOW_ACTIVE_TAB_ID,
      STORAGE_KEYS.TOOLKIT_WINDOW_CAPTURE_STREAM_IDS,
    ]);
  });
});
