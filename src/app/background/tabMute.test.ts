import { describe, expect, test, vi } from "vitest";

import { STORAGE_KEYS } from "../../infrastructure/chrome/storageKeys";
import { createTabMuteToggle } from "./tabMute";

const createStorage = () => {
  const values: Record<string, unknown> = {};
  return {
    values,
    get: vi.fn((key: string) => Promise.resolve({ [key]: values[key] })),
    set: vi.fn((next: Record<string, unknown>) => {
      Object.assign(values, next);
      return Promise.resolve();
    }),
  };
};

describe("createTabMuteToggle", () => {
  test("applies each of two consecutive mutes as a separate flip", async () => {
    const storage = createStorage();
    const toggleMute = createTabMuteToggle(storage);

    await Promise.all([toggleMute(7), toggleMute(7)]);

    expect(storage.values[STORAGE_KEYS.tabMute(7)]).toBe(false);
    expect(storage.set).toHaveBeenCalledTimes(2);
  });

  test("tracks the mute state of each tab independently", async () => {
    const storage = createStorage();
    const toggleMute = createTabMuteToggle(storage);

    await toggleMute(7);

    expect(storage.values[STORAGE_KEYS.tabMute(7)]).toBe(true);
    expect(storage.values[STORAGE_KEYS.tabMute(8)]).toBeUndefined();
  });
});
