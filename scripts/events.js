const port = document.createElement("span");
port.id = "eq-tools-port";
document.documentElement.append(port);

const peakingFreqs = [5, 30, 180, 800, 5000];
let g_currentTabId = null;
let g_shortcuts = resolveShortcuts(null);

const withTabId = (callback) => {
  if (g_currentTabId !== null) {
    callback(g_currentTabId);
    return;
  }

  chrome.runtime.sendMessage({ method: "getTabId" }, (tabId) => {
    g_currentTabId = tabId;
    callback(tabId);
  });
};

const setCaptureError = (message) =>
  withTabId((tabId) => {
    chrome.storage.local.set({
      ["captureError." + tabId]: message,
    });
  });

const clearCaptureError = () =>
  withTabId((tabId) => {
    chrome.storage.local.remove("captureError." + tabId);
  });

port.addEventListener("connected", () => {
  clearCaptureError();
  chrome.runtime.sendMessage({
    method: "connected",
  });
});
port.addEventListener("disconnected", () =>
  chrome.runtime.sendMessage({
    method: "disconnected",
  })
);
port.addEventListener("capture-error", (e) => {
  const message = e?.detail?.message ?? "Audio capture failed";
  setCaptureError(message);
});

chrome.runtime.sendMessage({ method: "getTabId" }, (tabId) => {
  g_currentTabId = tabId;
  const defaultFilters = [
    { freq: 20, gain: 0, q: 0.5, type: "highpass" },
    ...peakingFreqs.map((freq) => {
      return { freq: freq, gain: 0, q: 0.5, type: "peaking" };
    }),
    { freq: 20000, gain: 0, q: 0.5, type: "lowpass" },
  ];
  chrome.storage.local.get(
    {
      ["volume." + tabId]: 1,
      ["pan." + tabId]: 0,
      ["filters." + tabId]: defaultFilters,
      enableSpectrum: false,
      ["enabled." + tabId]: false,
      ["mute." + tabId]: false,
    },
    (prefs) => {
      const filters = prefs["filters." + tabId] ?? defaultFilters;
      const freqsMapped = filters.map((filter) => {
        return {
          freq: filter.freq,
          gain: filter.gain,
          q: filter.q ?? 0.5,
          type: filter.type ?? "peaking",
        };
      });
      port.dataset.freqs = JSON.stringify(freqsMapped);
      port.dataset.pan = prefs["pan." + tabId];
      port.dataset.preamp = prefs["volume." + tabId];
      port.dataset.enabled = prefs["enabled." + tabId];
      port.dataset.mute = prefs["mute." + tabId];
      port.dataset.enableSpectrum = prefs.enableSpectrum;

      if (prefs["mute." + tabId]) {
        port.dispatchEvent(new Event("mute-enabled"));
      }
      if (prefs["enabled." + tabId]) {
        port.dispatchEvent(new Event("enabled-changed"));
      }
    }
  );
});

chrome.storage.onChanged.addListener((ps) => {
  if (ps["shortcuts"]) {
    g_shortcuts = resolveShortcuts(ps["shortcuts"].newValue);
  }

  withTabId((tabId) => {
    if (ps["filters." + tabId]) {
      var newF = ps["filters." + tabId].newValue.map((filter, i) => {
        return {
          freq: filter.freq,
          gain: filter.gain,
          q: filter.q ?? 0.5,
          type: filter.type ?? "peaking",
        };
      });
      port.dataset.freqs = JSON.stringify(newF);
      port.dispatchEvent(new Event("filters-changed"));
    }

    if (ps["volume." + tabId]) {
      port.dataset.preamp = ps["volume." + tabId].newValue;
      if (port.dataset.mute != "true")
        port.dispatchEvent(new Event("preamp-changed"));
    }
    if (ps["enabled." + tabId]) {
      port.dataset.enabled = ps["enabled." + tabId].newValue;
      port.dispatchEvent(new Event("enabled-changed"));
    }
    if (ps["mute." + tabId]) {
      port.dataset.mute = ps["mute." + tabId].newValue;
      if (ps["mute." + tabId].newValue)
        port.dispatchEvent(new Event("mute-enabled"));
      else port.dispatchEvent(new Event("mute-disabled"));
    }
  });
});

chrome.storage.local.get(["shortcuts"], (prefs) => {
  g_shortcuts = resolveShortcuts(prefs["shortcuts"]);
});

function toggleTabStorageValue(tabId, key, options = {}) {
  chrome.storage.local.get([key]).then((prefs) => {
    const values = {
      [key]: !prefs[key],
    };
    if (options.enableTab) values["enabled." + tabId] = true;
    chrome.storage.local.set(values);
  });
}

document.addEventListener(
  "keydown",
  (event) => {
    if (event.repeat || isEditableShortcutTarget(event.target)) return;

    if (matchesShortcut(event, g_shortcuts[SHORTCUT_ACTION_MUTE_NAME])) {
      event.preventDefault();
      event.stopPropagation();
      withTabId((tabId) => {
        toggleTabStorageValue(tabId, "mute." + tabId, { enableTab: true });
      });
      return;
    }

    if (matchesShortcut(event, g_shortcuts[SHORTCUT_ACTION_TOGGLE_EQ_NAME])) {
      event.preventDefault();
      event.stopPropagation();
      withTabId((tabId) => {
        toggleTabStorageValue(tabId, "enabled." + tabId);
      });
    }
  },
  true
);

port.addEventListener("spectrum-frame", (e) => {
  chrome.runtime.sendMessage({ method: "spectrum-frame", payload: e.detail });
});

self.start = () => {
  if (window.top !== window) return;

  chrome.runtime.sendMessage({ method: "getTabId" }, async (tabId) => {
    chrome.runtime.sendMessage({ method: "pageStarted" });
  });

  setTimeout(async () => {
    chrome.runtime.sendMessage({ method: "clearStorage" });
  }, 1000);
};
self.start();
