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
chrome.storage.local.get(
  {
    volume: 1,
    pan: 0,
    freqs: freqs.map((freq, i) => {
      return { frequency: freq, gain: 0, type: "peaking" };
    }),
  },
  (prefs) => {
    const newF = prefs.freqs;
    port.dataset.freqs = JSON.stringify(newF);
    port.dataset.pan = prefs.pan;
    port.dataset.preamp = prefs.volume;
    port.dataset.enabled = false;
  }
);

chrome.storage.onChanged.addListener((ps) => {
  if (ps.filters) {
    var newF = ps.filters.newValue.map((filter, i) => {
      return { frequency: filter.freq, gain: filter.gain, type: "peaking" };
    });
    port.dataset.freqs = JSON.stringify(newF);
    port.dispatchEvent(new Event("filters-changed"));
  }

  if (ps.volume) {
    port.dataset.preamp = ps.volume.newValue;
    port.dispatchEvent(new Event("preamp-changed"));
  }
  if (ps.enabled) {
    port.dataset.enabled = ps.enabled.newValue;
    port.dispatchEvent(new Event("enabled-changed"));
  }
});

self.start = () => {
  port.dataset.enabled = false;
  chrome.storage.local.set({ enabled: false });
};
self.start();
