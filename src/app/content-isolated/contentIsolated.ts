import {
  SHORTCUT_ACTION_MUTE_NAME,
  SHORTCUT_ACTION_TOGGLE_EQ_NAME,
  isEditableShortcutTarget,
  matchesShortcut,
  resolveShortcuts,
  type ShortcutMap,
} from "../../domains/shortcuts/shortcuts";
import {
  createDefaultFilterSettings,
  normalizeFilterSettings,
} from "../../domains/equalizer/defaultFilters";

import {
  RUNTIME_MESSAGES,
  TOOLKIT_SHORTCUT_ACTIONS,
  normalizeSpectrumPayload,
  type ToolkitShortcutAction,
  type RuntimeMessage,
} from "../../infrastructure/chrome/runtimeMessages";
import { STORAGE_KEYS } from "../../infrastructure/chrome/storageKeys";
import { claimContentInstance } from "./contentInstance";
import { isLatestModeCheck, resolveShortcutToggle, resolveTabEnabled } from "./toolkitCaptureState";

type SendRuntimeMessageWithCallback = (
  message: RuntimeMessage,
  callback: (response: unknown) => void,
) => void;

const sendRuntimeMessageWithCallback = chrome.runtime
  .sendMessage as unknown as SendRuntimeMessageWithCallback;

const failingOperations = new Set<string>();

const reportAsyncFailure = (operation: string, promise: Promise<unknown>): void => {
  void promise.then(
    () => failingOperations.delete(operation),
    (error: unknown) => {
      if (failingOperations.has(operation)) return;
      failingOperations.add(operation);
      console.error(`Failed to ${operation}`, { operation, error });
    },
  );
};

const existingPort = document.getElementById("eq-tools-port");
const port =
  existingPort instanceof HTMLSpanElement ? existingPort : document.createElement("span");
port.id = "eq-tools-port";
port.hidden = true;
if (!port.isConnected) document.documentElement.append(port);
const isCurrentInstance = claimContentInstance(port);
port.dataset.enabled = "false";
port.dataset.spectrumDemand = "false";
port.dispatchEvent(new Event("enabled-changed"));

chrome.runtime.onMessage.addListener((message, _sender, sendResponse): boolean | undefined => {
  if (!isCurrentInstance()) return undefined;

  if (message?.method === RUNTIME_MESSAGES.CONTENT_SCRIPT_PING) {
    (sendResponse as unknown as (response: boolean) => void)(port.dataset.mainReady === "true");
    return undefined;
  }

  if (message?.method === RUNTIME_MESSAGES.CAPTURE_MODE_CHANGED) {
    void applyTabEnabledState(lastRequestedEnabled).then(
      () => (sendResponse as unknown as (response: boolean) => void)(true),
      (error: unknown) => {
        console.error("Failed to apply capture mode change", {
          operation: "captureModeChanged",
          error,
        });
        (sendResponse as unknown as (response: boolean) => void)(false);
      },
    );
    return true;
  }

  if (message?.method !== RUNTIME_MESSAGES.SET_SPECTRUM_DEMAND) return undefined;
  const enabled = (message.payload as { enabled?: unknown } | undefined)?.enabled;
  if (typeof enabled !== "boolean") return undefined;
  port.dataset.spectrumDemand = String(enabled);
  port.dispatchEvent(new Event("spectrum-state-changed"));
  return undefined;
});

let currentTabId: number | null = null;
let shortcuts = resolveShortcuts(null);

const getTabId = (): Promise<number> => {
  if (currentTabId !== null) return Promise.resolve(currentTabId);

  return new Promise((resolve, reject) => {
    sendRuntimeMessageWithCallback({ method: RUNTIME_MESSAGES.GET_TAB_ID }, (tabId) => {
      if (!isCurrentInstance() || typeof tabId !== "number") {
        reject(new Error("Failed to resolve tab id"));
        return;
      }

      currentTabId = tabId;
      resolve(tabId);
    });
  });
};

const withTabId = (callback: (tabId: number) => void): void => {
  void getTabId().then(callback, () => undefined);
};

const isToolkitCaptured = (): Promise<boolean> => {
  return new Promise((resolve) => {
    sendRuntimeMessageWithCallback({ method: RUNTIME_MESSAGES.IS_TOOLKIT_CAPTURED }, (captured) =>
      resolve(captured === true),
    );
  });
};

let lastRequestedEnabled = false;
let modeCheckGeneration = 0;

const applyTabEnabledState = async (requestedEnabled: boolean): Promise<void> => {
  lastRequestedEnabled = requestedEnabled;
  const generation = ++modeCheckGeneration;
  const captured = await isToolkitCaptured();
  // A newer mode check (for example after capture-mode-changed) must win over a stale reply.
  if (!isCurrentInstance() || !isLatestModeCheck(generation, modeCheckGeneration)) return;

  port.dataset.enabled = String(resolveTabEnabled(requestedEnabled, captured));
  port.dispatchEvent(new Event("enabled-changed"));
};

const setCaptureError = (message: string): void => {
  reportAsyncFailure(
    "report capture error",
    chrome.runtime.sendMessage({
      method: RUNTIME_MESSAGES.CAPTURE_ERROR,
      payload: { message },
    }),
  );
};

const getCaptureErrorMessage = (event: Event): string => {
  const detail = (event as CustomEvent<{ message?: unknown }>).detail;
  return typeof detail?.message === "string" ? detail.message : "Audio capture failed";
};

port.addEventListener("connected", () => {
  if (!isCurrentInstance()) return;

  reportAsyncFailure(
    "report connected state",
    chrome.runtime.sendMessage({ method: RUNTIME_MESSAGES.CONNECTED }),
  );
});

port.addEventListener("disconnected", () => {
  if (!isCurrentInstance()) return;

  reportAsyncFailure(
    "report disconnected state",
    chrome.runtime.sendMessage({ method: RUNTIME_MESSAGES.DISCONNECTED }),
  );
});

port.addEventListener("capture-error", (event) => {
  if (!isCurrentInstance()) return;

  setCaptureError(getCaptureErrorMessage(event));
});

void getTabId().then(
  (tabId) => {
    const defaultFilters = createDefaultFilterSettings();
    chrome.storage.local.get(
      {
        [STORAGE_KEYS.tabVolume(tabId)]: 1,
        [STORAGE_KEYS.tabPan(tabId)]: 0,
        [STORAGE_KEYS.tabFilters(tabId)]: defaultFilters,
        [STORAGE_KEYS.ENABLE_SPECTRUM]: false,
        [STORAGE_KEYS.ENABLE_VOLUME_COMPENSATION]: true,
        [STORAGE_KEYS.tabEnabled(tabId)]: false,
        [STORAGE_KEYS.tabMute(tabId)]: false,
      },
      (prefs) => {
        void (async () => {
          if (!isCurrentInstance()) return;

          const filters = prefs[STORAGE_KEYS.tabFilters(tabId)] ?? defaultFilters;
          const freqsMapped = normalizeFilterSettings(filters);
          port.dataset.freqs = JSON.stringify(freqsMapped);
          port.dataset.pan = String(prefs[STORAGE_KEYS.tabPan(tabId)]);
          port.dataset.preamp = String(prefs[STORAGE_KEYS.tabVolume(tabId)]);
          port.dataset.mute = String(prefs[STORAGE_KEYS.tabMute(tabId)]);
          port.dataset.enableSpectrum = String(prefs[STORAGE_KEYS.ENABLE_SPECTRUM]);
          port.dataset.enableVolumeCompensation = String(
            prefs[STORAGE_KEYS.ENABLE_VOLUME_COMPENSATION],
          );
          await applyTabEnabledState(prefs[STORAGE_KEYS.tabEnabled(tabId)] === true);
          if (!isCurrentInstance()) return;
          console.log("[contentIsolated] State ready", {
            tabId,
            enabled: port.dataset.enabled,
            filters: freqsMapped.length,
          });

          if (prefs[STORAGE_KEYS.tabMute(tabId)]) {
            port.dispatchEvent(new Event("mute-enabled"));
          }
        })();
      },
    );
  },
  () => undefined,
);

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (!isCurrentInstance()) return;

  if (areaName !== "local") return;

  if (changes[STORAGE_KEYS.SHORTCUTS]) {
    shortcuts = resolveShortcuts(
      changes[STORAGE_KEYS.SHORTCUTS].newValue as Partial<ShortcutMap> | null,
    );
  }

  if (changes[STORAGE_KEYS.ENABLE_SPECTRUM]) {
    port.dataset.enableSpectrum = String(changes[STORAGE_KEYS.ENABLE_SPECTRUM].newValue);
    port.dispatchEvent(new Event("spectrum-state-changed"));
  }

  if (changes[STORAGE_KEYS.ENABLE_VOLUME_COMPENSATION]) {
    port.dataset.enableVolumeCompensation = String(
      changes[STORAGE_KEYS.ENABLE_VOLUME_COMPENSATION].newValue !== false,
    );
    port.dispatchEvent(new Event("volume-compensation-changed"));
  }

  withTabId((tabId) => {
    const tabFiltersKey = STORAGE_KEYS.tabFilters(tabId);
    if (changes[tabFiltersKey]) {
      const newFilters = normalizeFilterSettings(changes[tabFiltersKey].newValue);
      port.dataset.freqs = JSON.stringify(newFilters);
      port.dispatchEvent(new Event("filters-changed"));
    }

    const tabVolumeKey = STORAGE_KEYS.tabVolume(tabId);
    if (changes[tabVolumeKey]) {
      port.dataset.preamp = String(changes[tabVolumeKey].newValue);
      if (port.dataset.mute !== "true") {
        port.dispatchEvent(new Event("preamp-changed"));
      }
    }

    const tabEnabledKey = STORAGE_KEYS.tabEnabled(tabId);
    if (changes[tabEnabledKey]) {
      void applyTabEnabledState(changes[tabEnabledKey].newValue === true);
    }

    const tabMuteKey = STORAGE_KEYS.tabMute(tabId);
    if (changes[tabMuteKey]) {
      port.dataset.mute = String(changes[tabMuteKey].newValue);
      if (changes[tabMuteKey].newValue) {
        port.dispatchEvent(new Event("mute-enabled"));
      } else {
        port.dispatchEvent(new Event("mute-disabled"));
      }
    }
  });
});

chrome.storage.local.get([STORAGE_KEYS.SHORTCUTS], (prefs) => {
  if (!isCurrentInstance()) return;

  shortcuts = resolveShortcuts(prefs[STORAGE_KEYS.SHORTCUTS] as Partial<ShortcutMap> | null);
});

const toggleTabStorageValue = (
  tabId: number,
  key: string,
  toolkitAction: ToolkitShortcutAction,
  options: { enableTab?: boolean } = {},
): void => {
  reportAsyncFailure(
    "toggle shortcut state",
    Promise.all([chrome.storage.local.get([key]), isToolkitCaptured()]).then(
      async ([prefs, captured]) => {
        if (!isCurrentInstance()) return;

        const values = resolveShortcutToggle({
          key,
          currentValue: prefs[key],
          enabledKey: STORAGE_KEYS.tabEnabled(tabId),
          enableTab: options.enableTab === true,
          isToolkitCaptured: captured,
          toolkitAction,
        });
        if ("toolkitAction" in values) {
          await chrome.runtime.sendMessage({
            method: RUNTIME_MESSAGES.TOOLKIT_SHORTCUT,
            payload: { action: values.toolkitAction },
          });
          return;
        }
        await chrome.storage.local.set(values.storageValues);
      },
    ),
  );
};

document.addEventListener(
  "keydown",
  (event) => {
    if (!isCurrentInstance()) return;

    if (event.repeat || isEditableShortcutTarget(event.target)) return;

    if (matchesShortcut(event, shortcuts[SHORTCUT_ACTION_MUTE_NAME])) {
      event.preventDefault();
      event.stopPropagation();
      withTabId((tabId) => {
        toggleTabStorageValue(tabId, STORAGE_KEYS.tabMute(tabId), TOOLKIT_SHORTCUT_ACTIONS.MUTE, {
          enableTab: true,
        });
      });
      return;
    }

    if (matchesShortcut(event, shortcuts[SHORTCUT_ACTION_TOGGLE_EQ_NAME])) {
      event.preventDefault();
      event.stopPropagation();
      withTabId((tabId) => {
        toggleTabStorageValue(
          tabId,
          STORAGE_KEYS.tabEnabled(tabId),
          TOOLKIT_SHORTCUT_ACTIONS.TOGGLE_EQ,
        );
      });
    }
  },
  true,
);

port.addEventListener("spectrum-frame", (event) => {
  if (!isCurrentInstance()) return;
  const payload = normalizeSpectrumPayload((event as CustomEvent<unknown>).detail);
  if (!payload) return;

  reportAsyncFailure(
    "relay spectrum frame",
    chrome.runtime.sendMessage({
      method: RUNTIME_MESSAGES.SPECTRUM_FRAME,
      payload,
    }),
  );
});

reportAsyncFailure(
  "restore spectrum demand",
  chrome.runtime.sendMessage({ method: RUNTIME_MESSAGES.SPECTRUM_READY }),
);

const start = (): void => {
  if (window.top !== window) return;

  sendRuntimeMessageWithCallback({ method: RUNTIME_MESSAGES.GET_TAB_ID }, () => {
    if (!isCurrentInstance()) return;

    reportAsyncFailure(
      "report page start",
      chrome.runtime.sendMessage({ method: RUNTIME_MESSAGES.PAGE_STARTED }),
    );
  });

  setTimeout(() => {
    if (!isCurrentInstance()) return;

    reportAsyncFailure(
      "request storage cleanup",
      chrome.runtime.sendMessage({ method: RUNTIME_MESSAGES.CLEAR_STORAGE }),
    );
  }, 1000);
};

start();
