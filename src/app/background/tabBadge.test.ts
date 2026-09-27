import { afterEach, expect, test, vi } from "vitest";

import { setTabBadge } from "./tabBadge";

afterEach(() => vi.unstubAllGlobals());

test("sets the ON/OFF badge text for the target tab", () => {
  const setBadgeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("chrome", { action: { setBadgeText } });

  setTabBadge(7, true);
  expect(setBadgeText).toHaveBeenCalledWith({ text: "ON", tabId: 7 });

  setTabBadge(7, false);
  expect(setBadgeText).toHaveBeenCalledWith({ text: "OFF", tabId: 7 });
});

test("reports a badge update failure without throwing", async () => {
  const failure = new Error("badge failed");
  vi.stubGlobal("chrome", { action: { setBadgeText: vi.fn().mockRejectedValue(failure) } });
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

  setTabBadge(11, true);
  await Promise.resolve();

  expect(consoleError).toHaveBeenCalledWith("Failed to update tab badge", {
    operation: "setBadgeText",
    tabId: 11,
    error: failure,
  });
});
