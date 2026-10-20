import { describe, expect, test } from "vitest";

import {
  DEFAULT_SHORTCUTS,
  formatShortcut,
  normalizeShortcut,
  resolveShortcuts,
  validateShortcutConfig,
} from "./shortcuts";

describe("shortcuts", () => {
  test("validates explicit disabled bindings but rejects missing or invalid active bindings", () => {
    expect(validateShortcutConfig({ mute: null, toggleEq: null })).toBeNull();
    expect(validateShortcutConfig({ ...DEFAULT_SHORTCUTS, mute: null })).toBeNull();
    expect(validateShortcutConfig({ ...DEFAULT_SHORTCUTS, toggleEq: null })).toBeNull();
    expect(validateShortcutConfig({ mute: null })).toBe("invalid");
    expect(validateShortcutConfig(null)).toBe("invalid");
    expect(
      validateShortcutConfig({
        mute: { alt: false, ctrl: false, shift: false, meta: false, key: "M" },
        toggleEq: null,
      }),
    ).toBe("invalid");
  });
  test("resolves null shortcuts to defaults", () => {
    expect(resolveShortcuts(null)).toEqual(DEFAULT_SHORTCUTS);
  });

  test("formats shortcuts with modifiers in legacy order", () => {
    expect(
      formatShortcut({
        ctrl: true,
        alt: true,
        shift: false,
        meta: false,
        key: "K",
      }),
    ).toBe("Ctrl+Alt+K");
  });

  test("normalizes shortcuts without modifiers to null", () => {
    expect(
      normalizeShortcut({
        ctrl: false,
        alt: false,
        shift: false,
        meta: false,
        key: "K",
      }),
    ).toBeNull();
  });

  test("validates duplicate mute and toggle equalizer shortcuts", () => {
    const duplicateShortcut = {
      ctrl: true,
      alt: false,
      shift: false,
      meta: false,
      key: "M",
    };

    expect(
      validateShortcutConfig({
        mute: duplicateShortcut,
        toggleEq: duplicateShortcut,
      }),
    ).toBe("duplicate");
  });
});
