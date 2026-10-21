import { afterEach, expect, test, vi } from "vitest";
import { STORAGE_KEYS } from "../../infrastructure/chrome/storageKeys";
import { RUNTIME_MESSAGES } from "../../infrastructure/chrome/runtimeMessages";
import {
  createDefaultFilterSettings,
  normalizeFilterSettings,
} from "../../domains/equalizer/defaultFilters";

class Bridge extends EventTarget {
  id = "eq-tools-port";
  hidden = false;
  isConnected = true;
  dataset: Record<string, string> = {};
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test("updates content shortcuts spectrum and compensation from one local change", async () => {
  vi.resetModules();
  vi.useFakeTimers();
  const bridge = new Bridge();
  const document = new EventTarget();
  Object.assign(document, { getElementById: () => bridge });
  vi.stubGlobal("document", document);
  vi.stubGlobal("HTMLSpanElement", Bridge);
  vi.stubGlobal("window", { top: null });
  const values: Record<string, unknown> = { [STORAGE_KEYS.tabEnabled(7)]: true };
  const storageSet = vi.fn(async (patch: Record<string, unknown>) => Object.assign(values, patch));
  const storageChanged = vi.fn();
  vi.stubGlobal("chrome", {
    runtime: {
      onMessage: { addListener: vi.fn() },
      sendMessage: vi.fn((message, callback) => {
        if (callback) callback(message.method === RUNTIME_MESSAGES.GET_TAB_ID ? 7 : false);
        return Promise.resolve();
      }),
    },
    storage: {
      onChanged: { addListener: storageChanged },
      local: {
        get: vi.fn((keys, callback) => {
          const result = Array.isArray(keys) ? { ...values } : { ...keys, ...values };
          if (callback) callback(result);
          return Promise.resolve(result);
        }),
        set: storageSet,
      },
    },
  });
  vi.spyOn(console, "log").mockImplementation(() => {});
  await import("./contentIsolated");
  await vi.waitFor(() => expect(bridge.dataset.enabled).toBe("true"));
  const events: string[] = [];
  for (const event of ["filters-changed", "spectrum-state-changed", "volume-compensation-changed"])
    bridge.addEventListener(event, () => events.push(event));
  const filters = createDefaultFilterSettings();
  const shortcuts = {
    mute: { alt: false, ctrl: true, shift: true, meta: false, key: "U" },
    toggleEq: { alt: false, ctrl: true, shift: true, meta: false, key: "E" },
  };
  const changes = {
    [STORAGE_KEYS.SHORTCUTS]: { newValue: shortcuts },
    [STORAGE_KEYS.ENABLE_SPECTRUM]: { newValue: false },
    [STORAGE_KEYS.ENABLE_VOLUME_COMPENSATION]: { newValue: true },
    [STORAGE_KEYS.tabFilters(7)]: { newValue: filters },
  };
  const listener = storageChanged.mock.calls[0][0];
  listener(changes, "sync");
  await Promise.resolve();
  expect(events).toEqual([]);
  listener(changes, "local");
  await vi.waitFor(() => expect(events).toContain("filters-changed"));
  expect(events).toEqual([
    "spectrum-state-changed",
    "volume-compensation-changed",
    "filters-changed",
  ]);
  expect(bridge.dataset).toMatchObject({
    enabled: "true",
    mute: "false",
    preamp: "1",
    enableSpectrum: "false",
    enableVolumeCompensation: "true",
    freqs: JSON.stringify(normalizeFilterSettings(filters)),
  });
  const press = (key: string) => {
    const event = new Event("keydown", { cancelable: true });
    Object.assign(event, {
      code: `Key${key}`,
      key,
      ctrlKey: true,
      shiftKey: true,
      altKey: false,
      metaKey: false,
      repeat: false,
    });
    document.dispatchEvent(event);
    return event;
  };
  expect(press("U").defaultPrevented).toBe(true);
  await vi.waitFor(() =>
    expect(storageSet).toHaveBeenCalledWith({ "mute.7": true, "enabled.7": true }),
  );
  expect(press("E").defaultPrevented).toBe(true);
  await vi.waitFor(() => expect(storageSet).toHaveBeenCalledWith({ "enabled.7": false }));
  storageSet.mockClear();
  const oldShortcut = new Event("keydown", { cancelable: true });
  Object.assign(oldShortcut, { code: "KeyM", key: "M", altKey: true });
  document.dispatchEvent(oldShortcut);
  await Promise.resolve();
  expect(oldShortcut.defaultPrevented).toBe(false);
  expect(storageSet).not.toHaveBeenCalled();
});
