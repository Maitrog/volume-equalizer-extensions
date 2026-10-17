import { afterEach, expect, test, vi } from "vitest";

import { resolveShortcuts } from "../../domains/shortcuts/shortcuts";
import { createShortcutSettingsView } from "./shortcutSettingsView";

class FakeInput extends EventTarget {
  value = "";
  classList = { add: vi.fn(), remove: vi.fn(), toggle: vi.fn() };
}

class FakeKeyboardEvent extends Event {
  key: string;
  code: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
  isComposing = false;

  constructor(type: string, init: KeyboardEventInit) {
    super(type, { cancelable: init.cancelable });
    this.key = init.key ?? "";
    this.code = init.code ?? "";
    this.ctrlKey = init.ctrlKey ?? false;
    this.altKey = init.altKey ?? false;
    this.shiftKey = init.shiftKey ?? false;
    this.metaKey = init.metaKey ?? false;
  }
}

afterEach(() => vi.unstubAllGlobals());

test("shortcut view preserves Tab and validates modifier, invalid, duplicate and successful input", async () => {
  vi.stubGlobal("KeyboardEvent", FakeKeyboardEvent);
  const mute = new FakeInput();
  const toggle = new FakeInput();
  const error = { textContent: "", style: { display: "" } } as HTMLElement;
  const saveShortcuts = vi.fn(async () => undefined);
  const view = createShortcutSettingsView({
    muteInput: mute as unknown as HTMLInputElement,
    toggleEqInput: toggle as unknown as HTMLInputElement,
    error,
    getMessage: (key) => key,
    saveShortcuts,
  });
  view.setShortcuts(resolveShortcuts(null));

  const tab = new KeyboardEvent("keydown", { key: "Tab", cancelable: true });
  mute.dispatchEvent(tab);
  expect(tab.defaultPrevented).toBe(false);

  mute.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Shift", shiftKey: true, cancelable: true }),
  );
  expect(saveShortcuts).not.toHaveBeenCalled();

  mute.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", cancelable: true }));
  expect(error.textContent).toBe("shortcut_validation_error");

  toggle.dispatchEvent(new KeyboardEvent("keydown", { key: "m", altKey: true, cancelable: true }));
  await Promise.resolve();
  expect(error.textContent).toBe("shortcut_duplicate_error");

  toggle.dispatchEvent(new KeyboardEvent("keydown", { key: "e", altKey: true, cancelable: true }));
  await vi.waitFor(() => expect(saveShortcuts).toHaveBeenCalled());
});

test("shortcut saves are serialized and only the latest result updates the view", async () => {
  vi.stubGlobal("KeyboardEvent", FakeKeyboardEvent);
  const mute = new FakeInput();
  const toggle = new FakeInput();
  let resolveFirst = (): void => undefined;
  let resolveSecond = (): void => undefined;
  const first = new Promise<void>((resolve) => {
    resolveFirst = resolve;
  });
  const second = new Promise<void>((resolve) => {
    resolveSecond = resolve;
  });
  const saveShortcuts = vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second);
  const view = createShortcutSettingsView({
    muteInput: mute as unknown as HTMLInputElement,
    toggleEqInput: toggle as unknown as HTMLInputElement,
    error: { textContent: "", style: { display: "" } } as HTMLElement,
    getMessage: (key) => key,
    saveShortcuts,
  });
  view.setShortcuts(resolveShortcuts(null));

  toggle.dispatchEvent(new KeyboardEvent("keydown", { key: "e", altKey: true }));
  toggle.dispatchEvent(new KeyboardEvent("keydown", { key: "f", altKey: true }));
  await vi.waitFor(() => expect(saveShortcuts).toHaveBeenCalledOnce());
  resolveFirst();
  await vi.waitFor(() => expect(saveShortcuts).toHaveBeenCalledTimes(2));
  expect(view.getShortcuts().toggleEq?.key).toBe("E");
  resolveSecond();
  await vi.waitFor(() => expect(view.getShortcuts().toggleEq?.key).toBe("F"));
});

test("rapid edits to different shortcuts preserve both requested values", async () => {
  vi.stubGlobal("KeyboardEvent", FakeKeyboardEvent);
  const mute = new FakeInput();
  const toggle = new FakeInput();
  let resolveFirst = (): void => undefined;
  let resolveSecond = (): void => undefined;
  const first = new Promise<void>((resolve) => {
    resolveFirst = resolve;
  });
  const second = new Promise<void>((resolve) => {
    resolveSecond = resolve;
  });
  const saveShortcuts = vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second);
  const view = createShortcutSettingsView({
    muteInput: mute as unknown as HTMLInputElement,
    toggleEqInput: toggle as unknown as HTMLInputElement,
    error: { textContent: "", style: { display: "" } } as HTMLElement,
    getMessage: (key) => key,
    saveShortcuts,
  });
  view.setShortcuts(resolveShortcuts(null));

  mute.dispatchEvent(new KeyboardEvent("keydown", { key: "u", altKey: true }));
  toggle.dispatchEvent(new KeyboardEvent("keydown", { key: "f", altKey: true }));

  await vi.waitFor(() => expect(saveShortcuts).toHaveBeenCalledOnce());
  expect(saveShortcuts.mock.calls[0][0].mute?.key).toBe("U");
  resolveFirst();
  await vi.waitFor(() => expect(saveShortcuts).toHaveBeenCalledTimes(2));
  expect(saveShortcuts.mock.calls[1][0].mute?.key).toBe("U");
  expect(saveShortcuts.mock.calls[1][0].toggleEq?.key).toBe("F");
  resolveSecond();
  await vi.waitFor(() => {
    expect(view.getShortcuts().mute?.key).toBe("U");
    expect(view.getShortcuts().toggleEq?.key).toBe("F");
  });
});

test("a pending valid save cannot clear a newer validation error", async () => {
  vi.stubGlobal("KeyboardEvent", FakeKeyboardEvent);
  const mute = new FakeInput();
  const toggle = new FakeInput();
  const error = { textContent: "", style: { display: "" } } as HTMLElement;
  let resolveSave = (): void => undefined;
  const saveShortcuts = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        resolveSave = resolve;
      }),
  );
  const view = createShortcutSettingsView({
    muteInput: mute as unknown as HTMLInputElement,
    toggleEqInput: toggle as unknown as HTMLInputElement,
    error,
    getMessage: (key) => key,
    saveShortcuts,
  });
  view.setShortcuts(resolveShortcuts(null));

  toggle.dispatchEvent(new KeyboardEvent("keydown", { key: "e", altKey: true }));
  await vi.waitFor(() => expect(saveShortcuts).toHaveBeenCalledOnce());
  mute.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  expect(error.textContent).toBe("shortcut_validation_error");

  resolveSave();
  await Promise.resolve();
  await Promise.resolve();
  expect(error.textContent).toBe("shortcut_validation_error");
  expect(view.getShortcuts().toggleEq?.key).toBe("E");
});

test("applying saved shortcuts invalidates old render callbacks and cached values", async () => {
  vi.stubGlobal("KeyboardEvent", FakeKeyboardEvent);
  const mute = new FakeInput();
  const toggle = new FakeInput();
  let finishSave!: () => void;
  const view = createShortcutSettingsView({
    muteInput: mute as unknown as HTMLInputElement,
    toggleEqInput: toggle as unknown as HTMLInputElement,
    error: { textContent: "", style: { display: "" } } as HTMLElement,
    getMessage: (key) => key,
    saveShortcuts: () =>
      new Promise<void>((resolve) => {
        finishSave = resolve;
      }),
  });
  toggle.dispatchEvent(new KeyboardEvent("keydown", { key: "e", altKey: true }));
  await vi.waitFor(() => expect(finishSave).toBeTypeOf("function"));
  const finished = vi.fn();
  const wait = view.waitForPendingChanges().then(finished);
  await Promise.resolve();
  expect(finished).not.toHaveBeenCalled();
  view.setShortcuts({ mute: null, toggleEq: null });
  const importedText = toggle.value;
  finishSave();
  await wait;
  expect(toggle.value).toBe(importedText);
  expect(view.getShortcuts()).toEqual({ mute: null, toggleEq: null });
});

test("shortcut wait rejects pending failures without poisoning later waits", async () => {
  vi.stubGlobal("KeyboardEvent", FakeKeyboardEvent);
  vi.spyOn(console, "error").mockImplementation(() => {});
  const mute = new FakeInput();
  let failSave!: (error: Error) => void;
  const view = createShortcutSettingsView({
    muteInput: mute as unknown as HTMLInputElement,
    toggleEqInput: new FakeInput() as unknown as HTMLInputElement,
    error: { textContent: "", style: { display: "" } } as HTMLElement,
    getMessage: (key) => key,
    saveShortcuts: () =>
      new Promise<void>((_resolve, reject) => {
        failSave = reject;
      }),
  });
  mute.dispatchEvent(new KeyboardEvent("keydown", { key: "u", altKey: true }));
  await vi.waitFor(() => expect(failSave).toBeTypeOf("function"));
  const waiting = expect(view.waitForPendingChanges()).rejects.toThrow("write failed");
  failSave(new Error("write failed"));
  await waiting;
  await expect(view.waitForPendingChanges()).resolves.toBeUndefined();
});
