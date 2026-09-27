import { describe, expect, test, vi } from "vitest";

import { RUNTIME_MESSAGES } from "../../infrastructure/chrome/runtimeMessages";
import { applyToolkitShortcut, resolveToolkitShortcutMessage } from "./toolkitShortcut";

describe("resolveToolkitShortcutMessage", () => {
  test("routes a captured tab shortcut to its originating tab", () => {
    expect(
      resolveToolkitShortcutMessage(
        {
          method: RUNTIME_MESSAGES.TOOLKIT_SHORTCUT,
          payload: { action: "toggleEq" },
        },
        { tab: { id: 456 } } as chrome.runtime.MessageSender,
      ),
    ).toEqual({ tabId: 456, action: "toggleEq" });
  });

  test("rejects malformed actions and messages without an originating tab", () => {
    expect(resolveToolkitShortcutMessage(null, {} as chrome.runtime.MessageSender)).toBeNull();

    expect(
      resolveToolkitShortcutMessage(
        {
          method: RUNTIME_MESSAGES.TOOLKIT_SHORTCUT,
          payload: { action: "reset" },
        },
        { tab: { id: 123 } } as chrome.runtime.MessageSender,
      ),
    ).toBeNull();

    expect(
      resolveToolkitShortcutMessage(
        {
          method: RUNTIME_MESSAGES.TOOLKIT_SHORTCUT,
          payload: { action: "mute" },
        },
        {} as chrome.runtime.MessageSender,
      ),
    ).toBeNull();
  });
});

describe("applyToolkitShortcut", () => {
  test("applies exactly one action for the originating captured tab", async () => {
    const calls: string[] = [];

    expect(
      await applyToolkitShortcut(
        { tabId: 456, action: "toggleEq" },
        {
          hasCapture: (tabId) => Promise.resolve(tabId === 456),
          toggleMute: async (tabId) => {
            calls.push(`mute:${tabId}`);
          },
          toggleEqualizer: async (tabId) => {
            calls.push(`toggleEq:${tabId}`);
          },
        },
      ),
    ).toBe(true);
    expect(calls).toEqual(["toggleEq:456"]);
  });

  test("does not alter a tab that is no longer captured", async () => {
    const toggleMute = vi.fn(() => Promise.resolve());
    const toggleEqualizer = vi.fn(() => Promise.resolve());

    expect(
      await applyToolkitShortcut(
        { tabId: 456, action: "mute" },
        {
          hasCapture: () => Promise.resolve(false),
          toggleMute,
          toggleEqualizer,
        },
      ),
    ).toBe(false);
    expect(toggleMute).not.toHaveBeenCalled();
    expect(toggleEqualizer).not.toHaveBeenCalled();
  });
});
