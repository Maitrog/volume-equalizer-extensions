const TOOLKIT_WINDOW_KEY = "toolkitWindowId";
const TOOLKIT_WINDOW_TAB_IDS_KEY = "toolkitWindowTabIds";
const TOOLKIT_WINDOW_ACTIVE_TAB_KEY = "toolkitWindowActiveTabId";
const TOOLKIT_WINDOW_CAPTURE_STREAM_IDS_KEY = "toolkitWindowCaptureStreamIds";

const capturedTabsElem = document.getElementById("captured-tabs");

const isToolkitWindow =
  new URLSearchParams(window.location.search).get("mode") === "window";

if (isToolkitWindow) {
  document.body.classList.add("toolkit-window-body");
  const changeEqBtn = document.getElementById("change-eq");
  changeEqBtn.disabled = true;
  changeEqBtn.classList.add("disabled");
}

let toolkitActiveTabId = null;
let toolkitCaptures = new Map();

// ********************
// Start tab capture
// ********************
async function loadToolkitTabSettings(tabId) {
  if (tabId == null) return;
  toolkitActiveTabId = tabId;

  const result = await chrome.storage.local.get([
    "filters",
    "filters." + tabId,
    "gain." + tabId,
    "enabled." + tabId,
    "mute." + tabId,
    "captureError." + tabId,
  ]);

  if (result["filters." + tabId]?.length) {
    setPoints(result["filters." + tabId]);
  } else if (result.filters?.length) {
    setPoints(result.filters);
  } else {
    initPoints();
  }

  const gain = result["gain." + tabId];
  if (gain != null && gain != undefined) {
    document.getElementById("master-volume").value = gain;
  } else {
    document.getElementById("master-volume").value = 0;
  }

  mainResize();
  setEnableBtnText(result["enabled." + tabId] ?? false);
  setMuteBtnClass(result["mute." + tabId] ?? false);

  if (result["captureError." + tabId]) {
    renderCaptureError(result["captureError." + tabId]);
  } else {
    renderCaptureError(null);
  }

  refreshToolkitCaptureFilters(tabId);
}

async function startToolkitTabCapture() {
  if (!isToolkitWindow) return;

  const streamIds = await getToolkitCaptureStreamIds();
  const streamEntries = Object.entries(streamIds);

  try {
    await audioCtx.resume();

    const activeTabIds = new Set(streamEntries.map(([tabId]) => tabId));
    toolkitCaptures.forEach((capture, tabId) => {
      if (activeTabIds.has(tabId)) return;
      stopToolkitCaptureEntry(capture);
      toolkitCaptures.delete(tabId);
    });

    await Promise.all(
      streamEntries.map(async ([tabId, streamId]) => {
        const existing = toolkitCaptures.get(tabId);
        if (existing?.streamId === streamId) return;

        if (existing) {
          stopToolkitCaptureEntry(existing);
          toolkitCaptures.delete(tabId);
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            mandatory: {
              chromeMediaSource: "tab",
              chromeMediaSourceId: streamId,
            },
          },
          video: false,
        });
        const source = audioCtx.createMediaStreamSource(stream);
        const capture = {
          streamId,
          stream,
          source,
          preamp: null,
          filters: [],
          output: null,
          filterSettings: [],
        };
        toolkitCaptures.set(tabId, capture);
        buildToolkitCaptureGraph(tabId);
        chrome.storage.local.remove("captureError." + tabId);
      })
    );

    renderCaptureError(null);
  } catch (e) {
    const tabId = await getCurrentTabId();
    if (tabId != null) {
      chrome.storage.local.set({
        ["captureError." + tabId]: e?.message ?? "Tab audio capture failed",
      });
    }
    renderCaptureError(e?.message ?? "Tab audio capture failed");
  }
}

window.addEventListener("beforeunload", stopToolkitTabCapture);

// ********************
// render captured tabs buttons in the window mod
// ********************
async function renderCapturedTabs() {
  if (!isToolkitWindow || !capturedTabsElem) return;

  const result = await getCapturedTabs();
  if (result?.tabs == null || !Array.isArray(result.tabs)) {
    console.error("Invalid toolkit tabs response", result);
    return;
  }

  const tabs = result.tabs;
  const activeTabId = result?.activeTabId ?? null;
  capturedTabsElem.replaceChildren();

  tabs.forEach((tab) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "captured-tab";
    if (tab.id === activeTabId) item.classList.add("active");
    item.dataset.tabId = tab.id;
    item.title = tab.title || tab.url || String(tab.id);

    if (tab.favIconUrl) {
      const icon = document.createElement("img");
      icon.className = "captured-tab-icon";
      icon.src = tab.favIconUrl;
      icon.alt = "";
      item.appendChild(icon);
    }

    const title = document.createElement("span");
    title.className = "captured-tab-title";
    title.textContent = tab.title || tab.url || `Tab ${tab.id}`;
    item.appendChild(title);

    capturedTabsElem.appendChild(item);
  });
}

function getCapturedTabs() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ method: "getCapturedTabs" }, (result) => {
      if (chrome.runtime.lastError) {
        console.error(chrome.runtime.lastError.message);
        resolve({ tabs: [], activeTabId: null });
        return;
      }
      resolve(result ?? { tabs: [], activeTabId: null });
    });
  });
}

if (capturedTabsElem) {
  capturedTabsElem.addEventListener("click", async (event) => {
    const item = event.target.closest(".captured-tab");
    if (!item) return;

    const tabId = Number.parseInt(item.dataset.tabId, 10);
    if (Number.isNaN(tabId)) return;

    await chrome.storage.session.set({
      [TOOLKIT_WINDOW_ACTIVE_TAB_KEY]: tabId,
    });
    await loadToolkitTabSettings(tabId);
    await renderCapturedTabs();
  });
}

// ********************
// draw filters
// ********************
function buildToolkitCaptureGraph(tabId) {
  const capture = toolkitCaptures.get(String(tabId));
  if (!capture?.source) return;

  disconnectToolkitCaptureGraph(capture);

  capture.preamp = audioCtx.createGain();
  capture.source.connect(capture.preamp);

  let previousNode = capture.preamp;
  const filterSettings = getToolkitCaptureFilterSettings(tabId);
  capture.filters = filterSettings.map((filter) => {
    const biquadFilter = audioCtx.createBiquadFilter();
    biquadFilter.type = filter.type ?? "peaking";
    biquadFilter.Q.value = filter.q ?? 0.5;
    biquadFilter.frequency.value = filter.freq;
    biquadFilter.gain.value = filter.gain ?? 0;
    previousNode.connect(biquadFilter);
    previousNode = biquadFilter;
    return biquadFilter;
  });

  capture.output = previousNode;
  capture.output.connect(audioCtx.destination);
  applyToolkitCaptureSettings(tabId);
}

function applyToolkitCaptureSettings(tabId = toolkitActiveTabId) {
  const capture = toolkitCaptures.get(String(tabId));
  if (!capture?.preamp) return;

  const slider = document.getElementById("master-volume");
  capture.preamp.gain.value =
    document.getElementById("volume-mute").className === "volume-mute-active"
      ? 0
      : dbToGain(slider.value);

  const filterSettings = getToolkitCaptureFilterSettings(tabId);
  capture.filterSettings = filterSettings;
  filterSettings.forEach((filter, index) => {
    if (!capture.filters[index]) return;
    capture.filters[index].type = filter.type ?? "peaking";
    capture.filters[index].frequency.value = filter.freq;
    capture.filters[index].gain.value = filter.gain ?? 0;
    capture.filters[index].Q.value = filter.q ?? 0.5;
  });
}

function getToolkitCaptureFilterSettings(tabId) {
  if (tabId === toolkitActiveTabId) return pointsToFilters(points);

  const capture = toolkitCaptures.get(String(tabId));
  if (capture?.filterSettings?.length) {
    return capture.filterSettings;
  }

  return pointsToFilters(points);
}

function refreshToolkitCaptureFilters(tabId = toolkitActiveTabId) {
  const capture = toolkitCaptures.get(String(tabId));
  if (!capture?.source) return;

  const filterSettings = getToolkitCaptureFilterSettings(tabId);
  capture.filterSettings = filterSettings;
  if (capture.filters.length !== filterSettings.length) {
    buildToolkitCaptureGraph(tabId);
    return;
  }

  applyToolkitCaptureSettings(tabId);
}

// ********************
// stop capture tabs in window mod
// ********************
function stopToolkitTabCapture() {
  toolkitCaptures.forEach((capture) => stopToolkitCaptureEntry(capture));
  toolkitCaptures.clear();
}

function stopToolkitCaptureEntry(capture) {
  disconnectToolkitCaptureGraph(capture);

  if (capture.source) {
    try {
      capture.source.disconnect();
    } catch (e) {}
  }

  if (capture.stream) {
    capture.stream.getTracks().forEach((track) => track.stop());
  }
}

function disconnectToolkitCaptureGraph(capture) {
  if (!capture) return;

  if (capture.source) {
    try {
      capture.source.disconnect();
    } catch (e) {}
  }

  if (capture.preamp) {
    try {
      capture.preamp.disconnect();
    } catch (e) {}
  }

  capture.filters.forEach((filter) => {
    try {
      filter.disconnect();
    } catch (e) {}
  });
  capture.preamp = null;
  capture.filters = [];
  capture.output = null;
}

// ********************
// Show notification that EQ already opened in window mod
// ********************
async function shouldShowToolkitWindowNotice() {
  if (isToolkitWindow) return false;

  const tabId = await getCurrentTabId();
  const stored = await chrome.storage.session.get([
    TOOLKIT_WINDOW_KEY,
    TOOLKIT_WINDOW_TAB_IDS_KEY,
  ]);
  const toolkitWindowTabIds = Array.isArray(stored[TOOLKIT_WINDOW_TAB_IDS_KEY])
    ? stored[TOOLKIT_WINDOW_TAB_IDS_KEY]
    : [];
  return (
    stored[TOOLKIT_WINDOW_KEY] != null && toolkitWindowTabIds.includes(tabId)
  );
}

function showToolkitWindowNotice() {
  const message =
    chrome.i18n.getMessage("toolkit_window_already_open") ||
    "Equalizer is already open in a window";
  const notice = document.createElement("div");
  notice.className = "window-open-notice";
  notice.textContent = message;

  document.body.className = "window-open-notice-body";
  document.body.replaceChildren(notice);
}

async function getToolkitCaptureStreamIds() {
  const stored = await chrome.storage.session.get(
    TOOLKIT_WINDOW_CAPTURE_STREAM_IDS_KEY
  );
  return stored[TOOLKIT_WINDOW_CAPTURE_STREAM_IDS_KEY] ?? {};
}
