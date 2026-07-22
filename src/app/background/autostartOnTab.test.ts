import { describe, expect, test, vi } from "vitest";

import { DEFAULT_PRESETS } from "../../domains/presets/defaultPresets";
import { STORAGE_KEYS } from "../../infrastructure/chrome/storageKeys";
import { applyAutostartForTab } from "./autostartOnTab";

describe("applyAutostartForTab", () => {
  test("applies a default preset matched by whitelist", async () => {
    const set = vi.fn();
    vi.stubGlobal("chrome", {
      storage: {
        local: {
          get: vi.fn().mockResolvedValue({
            [STORAGE_KEYS.AUTOSTART_RULES]: [
              {
                type: "domain",
                value: "example.com",
                presetName: DEFAULT_PRESETS[0].name,
              },
            ],
            [STORAGE_KEYS.PRESETS]: {},
          }),
          set,
        },
      },
    });

    await applyAutostartForTab(123, "https://example.com/watch");

    expect(set).toHaveBeenCalledWith({
      [STORAGE_KEYS.tabFilters(123)]: DEFAULT_PRESETS[0].filters,
      [STORAGE_KEYS.FILTERS]: DEFAULT_PRESETS[0].filters,
      [STORAGE_KEYS.tabEnabled(123)]: true,
    });
  });
});
