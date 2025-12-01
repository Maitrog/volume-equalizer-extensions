const port = document.createElement("span");
port.id = "eq-tools-port";
document.documentElement.append(port);

const freqs = [5, 30, 180, 800, 5000];
let currentTabId = null;

const withTabId = (callback) => {
  if (currentTabId !== null) {
    callback(currentTabId);
    return;
  }

  chrome.runtime.sendMessage({ method: "getTabId" }, (tabId) => {
    currentTabId = tabId;
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
  currentTabId = tabId;
  const defaultFilters = freqs.map((freq) => {
    return { freq: freq, gain: 0 };
  });
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
        const frequency = filter.freq ?? filter.frequency;
        return { frequency: frequency, gain: filter.gain, type: "peaking" };
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
  withTabId((tabId) => {
    if (ps["filters." + tabId]) {
      var newF = ps["filters." + tabId].newValue.map((filter, i) => {
        return { frequency: filter.freq, gain: filter.gain, type: "peaking" };
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

port.addEventListener("spectrum-frame", (e) => {
  chrome.runtime.sendMessage({ method: "spectrum-frame", payload: e.detail });
});

self.start = () => {
  port.dataset.enabled = false;
  chrome.runtime.sendMessage({ method: "getTabId" }, async (tabId) => {
    await chrome.storage.local.set({ ["enabled." + tabId]: false });
  });

  setTimeout(async () => {
    chrome.runtime.sendMessage({ method: "clearStorage" });
  }, 1000);
};
self.start();
