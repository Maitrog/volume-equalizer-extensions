const port = document.createElement("span");
port.id = "eq-tools-port";
document.documentElement.append(port);

const freqs = [5, 30, 180, 800, 5000];

port.addEventListener("connected", () =>
  chrome.runtime.sendMessage({
    method: "connected",
  })
);
port.addEventListener("disconnected", () =>
  chrome.runtime.sendMessage({
    method: "disconnected",
  })
);

let name = "";
chrome.runtime.sendMessage({ method: "getTabId" }, (tabId) => {
  chrome.storage.local.get(
    {
      ["volume" + tabId]: 1,
      ["pan." + tabId]: 0,
      ["freqs." + tabId]: freqs.map((freq, i) => {
        return { frequency: freq, gain: 0, type: "peaking" };
      }),
    },
    (prefs) => {
      const newF = prefs["freqs." + tabId];
      port.dataset.freqs = JSON.stringify(newF);
      port.dataset.pan = prefs["pan." + tabId];
      port.dataset.preamp = prefs["volume" + tabId];
      port.dataset.enabled = false;
    }
  );
});

chrome.storage.onChanged.addListener((ps) => {
  chrome.runtime.sendMessage({ method: "getTabId" }, (tabId) => {
    if (ps["filters." + tabId]) {
      var newF = ps["filters." + tabId].newValue.map((filter, i) => {
        return { frequency: filter.freq, gain: filter.gain, type: "peaking" };
      });
      port.dataset.freqs = JSON.stringify(newF);
      port.dispatchEvent(new Event("filters-changed"));
    }

    if (ps["volume." + tabId]) {
      port.dataset.preamp = ps["volume." + tabId].newValue;
      port.dispatchEvent(new Event("preamp-changed"));
    }
    if (ps["enabled." + tabId]) {
      port.dataset.enabled = ps["enabled." + tabId].newValue;
      port.dispatchEvent(new Event("enabled-changed"));
    }
  });
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
