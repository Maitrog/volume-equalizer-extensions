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

import type { RuntimeMessageMethod } from "../../infrastructure/chrome/runtimeMessages";
import type { STORAGE_KEYS as INFRASTRUCTURE_STORAGE_KEYS } from "../../infrastructure/chrome/storageKeys";

type InfrastructureStorageKeys = typeof INFRASTRUCTURE_STORAGE_KEYS;
type RuntimeMessagePayload = {
  method: RuntimeMessageMethod;
  payload?: unknown;
};
type SendRuntimeMessageWithCallback = (
  message: RuntimeMessagePayload,
  callback: (response: unknown) => void,
) => void;

const CONTENT_RUNTIME_MESSAGES = {
  GET_TAB_ID: "getTabId",
  CONNECTED: "connected",
  DISCONNECTED: "disconnected",
  SPECTRUM_FRAME: "spectrum-frame",
  PAGE_STARTED: "pageStarted",
  CLEAR_STORAGE: "clearStorage",
} as const satisfies Record<string, RuntimeMessageMethod>;

const STORAGE_KEYS = {
  ENABLE_SPECTRUM: "enableSpectrum",
  SHORTCUTS: "shortcuts",
  tabFilters: (tabId: number | string) => `filters.${tabId}`,
  tabEnabled: (tabId: number | string) => `enabled.${tabId}`,
  tabMute: (tabId: number | string) => `mute.${tabId}`,
  tabVolume: (tabId: number | string) => `volume.${tabId}`,
  tabPan: (tabId: number | string) => `pan.${tabId}`,
  tabCaptureError: (tabId: number | string) => `captureError.${tabId}`,
} as const satisfies Pick<
  InfrastructureStorageKeys,
  | "ENABLE_SPECTRUM"
  | "SHORTCUTS"
  | "tabFilters"
  | "tabEnabled"
  | "tabMute"
  | "tabVolume"
  | "tabPan"
  | "tabCaptureError"
>;

const sendRuntimeMessageWithCallback =
  chrome.runtime.sendMessage as unknown as SendRuntimeMessageWithCallback;

const port = document.createElement("span");
port.id = "eq-tools-port";
document.documentElement.append(port);

let currentTabId: number | null = null;
let shortcuts = resolveShortcuts(null);

const getTabId = (callback: (tabId: number) => void): void => {
  sendRuntimeMessageWithCallback(
    { method: CONTENT_RUNTIME_MESSAGES.GET_TAB_ID },
    (tabId) => {
      if (typeof tabId !== "number") return;

      currentTabId = tabId;
      callback(tabId);
    },
  );
};

const withTabId = (callback: (tabId: number) => void): void => {
  if (currentTabId !== null) {
    callback(currentTabId);
    return;
  }

  getTabId(callback);
};

const setCaptureError = (message: string): void => {
  withTabId((tabId) => {
    chrome.storage.local.set({
      [STORAGE_KEYS.tabCaptureError(tabId)]: message,
    });
  });
};

const clearCaptureError = (): void => {
  withTabId((tabId) => {
    chrome.storage.local.remove(STORAGE_KEYS.tabCaptureError(tabId));
  });
};

const getCaptureErrorMessage = (event: Event): string => {
  const detail = (event as CustomEvent<{ message?: unknown }>).detail;
  return typeof detail?.message === "string"
    ? detail.message
    : "Audio capture failed";
};

port.addEventListener("connected", () => {
  clearCaptureError();
  chrome.runtime.sendMessage({
    method: CONTENT_RUNTIME_MESSAGES.CONNECTED,
  });
});

port.addEventListener("disconnected", () => {
  chrome.runtime.sendMessage({
    method: CONTENT_RUNTIME_MESSAGES.DISCONNECTED,
  });
});

port.addEventListener("capture-error", (event) => {
  setCaptureError(getCaptureErrorMessage(event));
});

getTabId((tabId) => {
  const defaultFilters = createDefaultFilterSettings();
  chrome.storage.local.get(
    {
      [STORAGE_KEYS.tabVolume(tabId)]: 1,
      [STORAGE_KEYS.tabPan(tabId)]: 0,
      [STORAGE_KEYS.tabFilters(tabId)]: defaultFilters,
      [STORAGE_KEYS.ENABLE_SPECTRUM]: false,
      [STORAGE_KEYS.tabEnabled(tabId)]: false,
      [STORAGE_KEYS.tabMute(tabId)]: false,
    },
    (prefs) => {
      const filters = prefs[STORAGE_KEYS.tabFilters(tabId)] ?? defaultFilters;
      const freqsMapped = normalizeFilterSettings(filters);
      port.dataset.freqs = JSON.stringify(freqsMapped);
      port.dataset.pan = String(prefs[STORAGE_KEYS.tabPan(tabId)]);
      port.dataset.preamp = String(prefs[STORAGE_KEYS.tabVolume(tabId)]);
      port.dataset.enabled = String(prefs[STORAGE_KEYS.tabEnabled(tabId)]);
      port.dataset.mute = String(prefs[STORAGE_KEYS.tabMute(tabId)]);
      port.dataset.enableSpectrum = String(prefs[STORAGE_KEYS.ENABLE_SPECTRUM]);

      if (prefs[STORAGE_KEYS.tabMute(tabId)]) {
        port.dispatchEvent(new Event("mute-enabled"));
      }
      if (prefs[STORAGE_KEYS.tabEnabled(tabId)]) {
        port.dispatchEvent(new Event("enabled-changed"));
      }
    },
  );
});

chrome.storage.onChanged.addListener((changes) => {
  if (changes[STORAGE_KEYS.SHORTCUTS]) {
    shortcuts = resolveShortcuts(
      changes[STORAGE_KEYS.SHORTCUTS].newValue as Partial<ShortcutMap> | null,
    );
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
      port.dataset.enabled = String(changes[tabEnabledKey].newValue);
      port.dispatchEvent(new Event("enabled-changed"));
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
  shortcuts = resolveShortcuts(
    prefs[STORAGE_KEYS.SHORTCUTS] as Partial<ShortcutMap> | null,
  );
});

const toggleTabStorageValue = (
  tabId: number,
  key: string,
  options: { enableTab?: boolean } = {},
): void => {
  chrome.storage.local.get([key]).then((prefs) => {
    const values: Record<string, boolean> = {
      [key]: !prefs[key],
    };
    if (options.enableTab) {
      values[STORAGE_KEYS.tabEnabled(tabId)] = true;
    }
    chrome.storage.local.set(values);
  });
};

document.addEventListener(
  "keydown",
  (event) => {
    if (event.repeat || isEditableShortcutTarget(event.target)) return;

    if (matchesShortcut(event, shortcuts[SHORTCUT_ACTION_MUTE_NAME])) {
      event.preventDefault();
      event.stopPropagation();
      withTabId((tabId) => {
        toggleTabStorageValue(tabId, STORAGE_KEYS.tabMute(tabId), {
          enableTab: true,
        });
      });
      return;
    }

    if (matchesShortcut(event, shortcuts[SHORTCUT_ACTION_TOGGLE_EQ_NAME])) {
      event.preventDefault();
      event.stopPropagation();
      withTabId((tabId) => {
        toggleTabStorageValue(tabId, STORAGE_KEYS.tabEnabled(tabId));
      });
    }
  },
  true,
);

port.addEventListener("spectrum-frame", (event) => {
  chrome.runtime.sendMessage({
    method: CONTENT_RUNTIME_MESSAGES.SPECTRUM_FRAME,
    payload: (event as CustomEvent<unknown>).detail,
  });
});

const start = (): void => {
  if (window.top !== window) return;

  sendRuntimeMessageWithCallback(
    { method: CONTENT_RUNTIME_MESSAGES.GET_TAB_ID },
    () => {
      chrome.runtime.sendMessage({ method: CONTENT_RUNTIME_MESSAGES.PAGE_STARTED });
    },
  );

  setTimeout(() => {
    chrome.runtime.sendMessage({ method: CONTENT_RUNTIME_MESSAGES.CLEAR_STORAGE });
  }, 1000);
};

start();
