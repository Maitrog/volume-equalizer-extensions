import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { ensureContentScripts } from "./ensureContentScripts";

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ensureContentScripts", () => {
  test("does not inject scripts when the content script answers", async () => {
    const executeScript = vi.fn();
    vi.stubGlobal("chrome", {
      tabs: { sendMessage: vi.fn().mockResolvedValue(true) },
      scripting: { executeScript },
    });

    await ensureContentScripts(7);

    expect(executeScript).not.toHaveBeenCalled();
  });

  test("injects both scripts in order when the ping has no receiver", async () => {
    const executeScript = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("chrome", {
      tabs: { sendMessage: vi.fn().mockRejectedValue(new Error("No receiver")) },
      scripting: { executeScript },
    });

    await ensureContentScripts(7);

    expect(executeScript.mock.calls).toEqual([
      [
        {
          target: { tabId: 7, allFrames: true },
          files: ["scripts/content-isolated.js"],
          world: "ISOLATED",
        },
      ],
      [
        {
          target: { tabId: 7, allFrames: true },
          files: ["scripts/content-main.js"],
          world: "MAIN",
        },
      ],
    ]);
  });

  test("does not reject when scripts cannot be injected", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal("chrome", {
      tabs: { sendMessage: vi.fn().mockRejectedValue(new Error("No receiver")) },
      scripting: {
        executeScript: vi.fn().mockRejectedValue(new Error("Restricted page")),
      },
    });

    await expect(ensureContentScripts(7)).resolves.toBeUndefined();
  });
});
