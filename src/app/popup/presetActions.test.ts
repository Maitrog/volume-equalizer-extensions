import { afterEach, describe, expect, test, vi } from "vitest";

import { STORAGE_KEYS } from "../../infrastructure/chrome/storageKeys";
import { createPresetActions } from "./presetActions";

afterEach(() => vi.unstubAllGlobals());

const setup = (stored: Record<string, unknown>, rejectWrite = false) => {
  const storage = {
    get: vi.fn(async () => structuredClone(stored)),
    set: rejectWrite
      ? vi.fn(async () => {
          throw new Error("write failed");
        })
      : vi.fn(async () => undefined),
  };
  vi.stubGlobal("chrome", { storage: { local: storage } });
  return {
    actions: createPresetActions({
      getCurrentTabId: vi.fn(async () => 7),
      getCurrentFilters: vi.fn(() => [
        {
          freq: 1000,
          gain: 2,
          q: 0.5,
          type: "peaking" as const,
        },
      ]),
    }),
    storage,
  };
};

describe("presetActions", () => {
  test("rejects an invalid save without writing storage", async () => {
    const { actions, storage } = setup({
      [STORAGE_KEYS.PRESET_NAMES]: ["Mine"],
      [STORAGE_KEYS.PRESETS]: {},
    });
    await expect(actions.savePreset("Mine")).resolves.toEqual({
      ok: false,
      reason: "duplicate",
    });
    expect(storage.set).not.toHaveBeenCalled();
  });

  test("strips legacy canvas coordinates before saving a preset", async () => {
    const { actions, storage } = setup({
      [STORAGE_KEYS.PRESET_NAMES]: [],
      [STORAGE_KEYS.PRESETS]: {},
      [STORAGE_KEYS.tabFilters(7)]: [
        { type: "peaking", freq: "1000", gain: "6", q: "0.5", x: 10, y: 20 },
      ],
    });

    await expect(actions.savePreset("Legacy")).resolves.toMatchObject({ ok: true });
    expect(storage.set).toHaveBeenCalledWith({
      [STORAGE_KEYS.PRESETS]: {
        Legacy: [{ type: "peaking", freq: 1000, gain: 6, q: 0.5 }],
      },
      [STORAGE_KEYS.PRESET_NAMES]: ["Legacy"],
    });
  });

  test("refuses default and whitelist-referenced preset deletion", async () => {
    const { actions, storage } = setup({
      [STORAGE_KEYS.PRESET_NAMES]: ["Mine"],
      [STORAGE_KEYS.PRESETS]: { Mine: [] },
      [STORAGE_KEYS.AUTOSTART_RULES]: [{ id: "x", presetName: "Mine" }],
    });
    await expect(actions.deletePreset("Bass Boost")).resolves.toEqual({
      ok: false,
      reason: "default",
    });
    await expect(actions.deletePreset("Mine")).resolves.toEqual({ ok: false, reason: "used" });
    expect(storage.set).not.toHaveBeenCalled();
  });
});

test("saves exact and fractional preset frequencies to storage", async () => {
  const filters = [20001, 1000.4].map((freq) => ({ type: "peaking", freq, gain: 2, q: 0.5 }));
  const { actions, storage } = setup({
    [STORAGE_KEYS.PRESET_NAMES]: [],
    [STORAGE_KEYS.PRESETS]: {},
    [STORAGE_KEYS.tabFilters(7)]: filters,
  });
  await expect(actions.savePreset("Precise")).resolves.toMatchObject({ ok: true });
  expect(storage.set).toHaveBeenCalledWith({
    [STORAGE_KEYS.PRESETS]: { Precise: filters },
    [STORAGE_KEYS.PRESET_NAMES]: ["Precise"],
  });
});
