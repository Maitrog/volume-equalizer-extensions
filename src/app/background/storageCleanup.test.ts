import { describe, expect, test, vi } from "vitest";

import { STORAGE_KEYS } from "../../infrastructure/chrome/storageKeys";
import { clearUnusedStorage } from "./storageCleanup";

describe("clearUnusedStorage", () => {
  test("keeps the configured point count", async () => {
    const remove = vi.fn();
    vi.stubGlobal("chrome", {
      storage: {
        session: {
          get: vi.fn().mockResolvedValue({ tabs: [] }),
        },
        local: {
          getKeys: vi.fn((callback: (keys: string[]) => void) =>
            callback([STORAGE_KEYS.POINT_COUNT]),
          ),
          remove,
        },
      },
    });

    await clearUnusedStorage();

    expect(remove).not.toHaveBeenCalled();
  });
});
