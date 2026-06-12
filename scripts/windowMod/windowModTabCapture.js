async function loadToolkitTabSettings(tabId) {
  if (tabId == null) return;
  g_toolkitActiveTabId = tabId;

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
    g_toolkitCaptures.forEach((capture, tabId) => {
      if (activeTabIds.has(tabId)) return;
      stopToolkitCaptureEntry(capture);
      g_toolkitCaptures.delete(tabId);
    });

    await Promise.all(
      streamEntries.map(async ([tabId, streamId]) => {
        const existing = g_toolkitCaptures.get(tabId);
        if (existing?.streamId === streamId) return;

        if (existing) {
          stopToolkitCaptureEntry(existing);
          g_toolkitCaptures.delete(tabId);
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
        g_toolkitCaptures.set(tabId, capture);
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

function buildToolkitCaptureGraph(tabId) {
  const capture = g_toolkitCaptures.get(String(tabId));
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

function applyToolkitCaptureSettings(tabId = g_toolkitActiveTabId) {
  const capture = g_toolkitCaptures.get(String(tabId));
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
  if (tabId === g_toolkitActiveTabId) return pointsToFilters(points);

  const capture = g_toolkitCaptures.get(String(tabId));
  if (capture?.filterSettings?.length) {
    return capture.filterSettings;
  }

  return pointsToFilters(points);
}

function refreshToolkitCaptureFilters(tabId = g_toolkitActiveTabId) {
  const capture = g_toolkitCaptures.get(String(tabId));
  if (!capture?.source) return;

  const filterSettings = getToolkitCaptureFilterSettings(tabId);
  capture.filterSettings = filterSettings;
  if (capture.filters.length !== filterSettings.length) {
    buildToolkitCaptureGraph(tabId);
    return;
  }

  applyToolkitCaptureSettings(tabId);
}

function stopToolkitTabCapture() {
  g_toolkitCaptures.forEach((capture) => stopToolkitCaptureEntry(capture));
  g_toolkitCaptures.clear();
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
