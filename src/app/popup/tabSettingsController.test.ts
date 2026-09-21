import { beforeEach, describe, expect, test, vi } from "vitest";

import type { EqualizerFilter } from "../../domains/equalizer/types";
import { STORAGE_KEYS } from "../../infrastructure/chrome/storageKeys";
import { createTabSettingsController } from "./tabSettingsController";

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
  const read = (
    values: Record<string, unknown>,
    keys: string | string[],
  ): Record<string, unknown> => {
    const requested = Array.isArray(keys) ? keys : [keys];
    return Object.fromEntries(requested.map((key) => [key, values[key]]));
  };
  const localGet = vi.fn((keys: string | string[]) => Promise.resolve(read(localValues, keys)));
  const sessionGet = vi.fn((keys: string | string[]) => Promise.resolve(read(sessionValues, keys)));
  const sessionSet = vi.fn((values: Record<string, unknown>) => {
    Object.assign(sessionValues, values);
    return Promise.resolve();
  });
  return {
    localValues,
    sessionValues,
    localGet,
    sessionGet,
    sessionSet,
    local: {
      get: localGet,
    } as unknown as chrome.storage.StorageArea,
    session: {
      get: sessionGet,
      set: sessionSet,
    } as unknown as chrome.storage.StorageArea,
  };
};

const setup = () => {
  const storage = createStorage();
  const captures = new Map<number, { enabled: boolean; filterSettings: EqualizerFilter[] }>();
  const effects = {
    updateCapture: vi.fn(),
    setFilters: vi.fn(),
    initPoints: vi.fn(),
    resize: vi.fn(),
    setGainValue: vi.fn(),
    setEnableButtonClass: vi.fn(),
    setMuteButtonClass: vi.fn(),
    renderCaptureError: vi.fn(),
    refreshCaptureFilters: vi.fn(),
    renderCapturedTabs: vi.fn(() => Promise.resolve()),
    restartSpectrum: vi.fn(),
  };
  const getPointCount = vi.fn(() => Promise.resolve(5));
  const controller = createTabSettingsController({
    localStorage: storage.local,
    sessionStorage: storage.session,
    getPointCount,
    getCapture: (tabId) => captures.get(tabId),
    ...effects,
  });
  return { controller, storage, captures, effects, getPointCount };
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("tab settings selection", () => {
  test("applies only the final A snapshot during an A/B/A race", async () => {
    const { controller, storage, effects } = setup();
    const firstA = deferred<Record<string, unknown>>();
    const tabB = deferred<Record<string, unknown>>();
    const finalA = deferred<Record<string, unknown>>();
    storage.localGet
      .mockImplementationOnce(() => firstA.promise)
      .mockImplementationOnce(() => tabB.promise)
      .mockImplementationOnce(() => finalA.promise);

    const staleASelection = controller.select(1);
    const staleBSelection = controller.select(2);
    const finalASelection = controller.select(1);
    const finalFilters = [{ type: "peaking", freq: 2000, gain: 2, q: 0.8 }];
    finalA.resolve({
      [STORAGE_KEYS.tabFilters(1)]: finalFilters,
      [STORAGE_KEYS.tabGain(1)]: 7,
      [STORAGE_KEYS.tabMute(1)]: true,
      [STORAGE_KEYS.tabCaptureError(1)]: "final error",
    });
    await finalASelection;

    tabB.resolve({
      [STORAGE_KEYS.tabFilters(2)]: [{ type: "peaking", freq: 4000, gain: 4, q: 0.5 }],
      [STORAGE_KEYS.tabGain(2)]: 9,
    });
    firstA.resolve({
      [STORAGE_KEYS.tabFilters(1)]: [{ type: "peaking", freq: 100, gain: 10, q: 0.5 }],
      [STORAGE_KEYS.tabGain(1)]: 12,
    });
    await Promise.all([staleASelection, staleBSelection]);

    expect(controller.getActiveTabId()).toBe(1);
    expect(effects.setFilters).toHaveBeenCalledOnce();
    expect(effects.setFilters).toHaveBeenCalledWith(finalFilters);
    expect(effects.setGainValue).toHaveBeenCalledWith(7);
    expect(effects.setMuteButtonClass).toHaveBeenCalledWith(true);
    expect(effects.renderCaptureError).toHaveBeenCalledWith("final error");
    expect(effects.resize).toHaveBeenCalledOnce();
    expect(effects.renderCapturedTabs).toHaveBeenCalledOnce();
    expect(effects.restartSpectrum).toHaveBeenCalledOnce();
    expect(effects.restartSpectrum).toHaveBeenCalledWith(1);
  });

  test("serializes selection writes so A/B/A persists the final A", async () => {
    const { controller, storage } = setup();
    const pendingWrites: Array<{
      values: Record<string, unknown>;
      resolve(): void;
    }> = [];
    storage.sessionSet.mockImplementation(
      (values) =>
        new Promise<void>((resolve) => {
          pendingWrites.push({
            values,
            resolve: () => {
              Object.assign(storage.sessionValues, values);
              resolve();
            },
          });
        }),
    );

    const firstA = controller.select(1);
    const tabB = controller.select(2);
    const finalA = controller.select(1);
    await Promise.resolve();
    expect(storage.sessionSet).toHaveBeenCalledOnce();

    pendingWrites[0].resolve();
    await vi.waitFor(() => {
      expect(storage.sessionSet).toHaveBeenCalledTimes(2);
    });
    pendingWrites[1].resolve();
    await vi.waitFor(() => {
      expect(storage.sessionSet).toHaveBeenCalledTimes(3);
    });
    pendingWrites[2].resolve();
    await Promise.all([firstA, tabB, finalA]);

    expect(storage.sessionValues[STORAGE_KEYS.CAPTURE_ACTIVE_TAB_ID]).toBe(1);
    expect(
      storage.sessionSet.mock.calls.map(([values]) => values[STORAGE_KEYS.CAPTURE_ACTIVE_TAB_ID]),
    ).toEqual([1, 2, 1]);
  });

  test("does not initialize stale defaults after point count resolves", async () => {
    const { controller, storage, effects, getPointCount } = setup();
    const pointCount = deferred<number>();
    getPointCount.mockReturnValueOnce(pointCount.promise);
    storage.localGet.mockResolvedValueOnce({}).mockResolvedValueOnce({
      [STORAGE_KEYS.tabFilters(2)]: [{ type: "peaking", freq: 2000, gain: 2, q: 0.5 }],
    });

    const stale = controller.load(1);
    await Promise.resolve();
    await controller.load(2);
    pointCount.resolve(5);
    await stale;

    expect(effects.initPoints).not.toHaveBeenCalled();
    expect(effects.setFilters).toHaveBeenCalledOnce();
  });

  test("ignores its own selection storage notification", async () => {
    const { controller, storage, effects } = setup();
    const settings = deferred<Record<string, unknown>>();
    storage.localGet.mockImplementationOnce(() => settings.promise);

    const selected = controller.select(1);
    await controller.reconcile();
    expect(storage.localGet).toHaveBeenCalledOnce();
    settings.resolve({
      [STORAGE_KEYS.tabFilters(1)]: [{ type: "peaking", freq: 500, gain: 3, q: 0.5 }],
    });
    await selected;
    await controller.reconcile();

    expect(storage.localGet).toHaveBeenCalledOnce();
    expect(effects.setFilters).toHaveBeenCalledOnce();
  });

  test("keeps the latest external selection when reads finish out of order", async () => {
    const { controller, storage, effects } = setup();
    const tabB = deferred<Record<string, unknown>>();
    const tabC = deferred<Record<string, unknown>>();
    storage.sessionGet
      .mockImplementationOnce(() => tabB.promise)
      .mockImplementationOnce(() => tabC.promise);
    storage.localValues[STORAGE_KEYS.tabFilters(3)] = [
      { type: "peaking", freq: 3000, gain: 3, q: 0.5 },
    ];

    const stale = controller.reconcile();
    const latest = controller.reconcile();
    tabC.resolve({ [STORAGE_KEYS.CAPTURE_ACTIVE_TAB_ID]: 3 });
    await latest;
    tabB.resolve({ [STORAGE_KEYS.CAPTURE_ACTIVE_TAB_ID]: 2 });
    await stale;

    expect(controller.getActiveTabId()).toBe(3);
    expect(effects.setFilters).toHaveBeenCalledOnce();
    expect(effects.setFilters).toHaveBeenCalledWith([
      { type: "peaking", freq: 3000, gain: 3, q: 0.5 },
    ]);
  });

  test("invalidates an in-flight snapshot", async () => {
    const { controller, storage, effects } = setup();
    const settings = deferred<Record<string, unknown>>();
    storage.localGet.mockImplementationOnce(() => settings.promise);

    const pending = controller.load(1);
    controller.invalidate();
    settings.resolve({
      [STORAGE_KEYS.tabFilters(1)]: [{ type: "peaking", freq: 100, gain: 10, q: 0.5 }],
    });
    await pending;

    expect(effects.setFilters).not.toHaveBeenCalled();
    expect(effects.setGainValue).not.toHaveBeenCalled();
  });

  test.each(["not-a-number", "Infinity", Number.POSITIVE_INFINITY])(
    "falls back from a non-finite stored gain: %s",
    async (storedGain) => {
      const { controller, storage, captures, effects } = setup();
      captures.set(1, {
        enabled: true,
        filterSettings: [{ type: "peaking", freq: 1000, gain: 0, q: 0.5 }],
      });
      storage.localValues[STORAGE_KEYS.tabGain(1)] = storedGain;

      await controller.load(1);

      expect(effects.setGainValue).toHaveBeenCalledWith(0);
      expect(effects.updateCapture).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ gainValue: 0 }),
      );
    },
  );
});
