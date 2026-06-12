function mainResize() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  resizeCanvas();
  drawFilter();
}

async function saveCurrentFilters(options = {}) {
  const enableCurrentTab = options.enableCurrentTab ?? true;
  const tabId = await getCurrentTabId();
  if (tabId == null || tabId == undefined) return;

  const newFilters = pointsToFilters(points);
  const values = {
    ["filters." + tabId]: newFilters,
    ["filters"]: newFilters,
  };
  if (!isToolkitWindow && enableCurrentTab) values["enabled." + tabId] = true;
  return chrome.storage.local.set(values);
}

async function getCurrentTabId() {
  if (isToolkitWindow) {
    if (g_toolkitActiveTabId != null) return g_toolkitActiveTabId;

    const stored = await chrome.storage.session.get(
      TOOLKIT_WINDOW_ACTIVE_TAB_KEY
    );
    g_toolkitActiveTabId = stored[TOOLKIT_WINDOW_ACTIVE_TAB_KEY] ?? null;
    return g_toolkitActiveTabId;
  }

  const queryOptions = { active: true, lastFocusedWindow: true };
  const [tab] = await chrome.tabs.query(queryOptions);
  return tab?.id;
}

function renderCaptureError(message) {
  if (!captureErrorElem) return;
  if (!message) {
    captureErrorElem.style.display = "none";
    captureErrorElem.textContent = "";
    return;
  }

  console.log(message);
  captureErrorElem.textContent = getLocalizedMessage("capture_error_prefix");
  captureErrorElem.style.display = "block";
}

async function mainLoad() {
  await g_localizationReady;

  const stored = await chrome.storage.local.get([
    POINT_COUNT_KEY,
    THEME_KEY,
    SKIP_POINTS_CONFIRM_KEY,
    INSTALL_UPDATE_NOTICE_KEY,
  ]);
  g_currentTheme = stored[THEME_KEY] ?? DEFAULT_THEME;
  applyTheme(g_currentTheme);

  if (await shouldShowToolkitWindowNotice()) {
    showToolkitWindowNotice();
    return;
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  resizeCanvas();
  const savedPointCount = parseInt(stored.g_pointCount, 10);
  if (!Number.isNaN(savedPointCount)) {
    g_pointCount = clampPointCount(savedPointCount);
  }
  g_skipPointsResetConfirm =
    stored[SKIP_POINTS_CONFIRM_KEY] === true ||
    stored[SKIP_POINTS_CONFIRM_KEY] === "true";
  updatePointCountSelect(g_pointCount);

  const id = await getCurrentTabId();
  const result = await chrome.storage.local.get([
    "filters",
    "filters." + id,
    "gain." + id,
    "presets",
    "presetNames",
    "enabled." + id,
    "mute." + id,
    "enableSpectrum",
    "captureError." + id,
  ]);
  let loadedFilters = null;
  if (
    result["filters." + id] != null &&
    result["filters." + id] != undefined &&
    result["filters." + id].length != 0
  ) {
    loadedFilters = result["filters." + id];
    setPoints(loadedFilters);
  } else if (
    result["filters"] != null &&
    result["filters"] != undefined &&
    result["filters"].length != 0
  ) {
    loadedFilters = result["filters"];
    setPoints(loadedFilters);
  } else {
    initPoints();
  }

  if (!loadedFilters || !hasCrossoverFilters(loadedFilters)) {
    await saveCurrentFilters({ enableCurrentTab: false });
  }

  if (result["gain." + id] != null && result["gain." + id] != undefined)
    document.getElementById("master-volume").value = result["gain." + id];

  drawFilter();

  setEnableBtnText(result["enabled." + id] ?? false);
  setMuteBtnClass(result["mute." + id] ?? false);

  if (result["enableSpectrum"] === true) {
    document.getElementById("enable-spectrum").checked = true;
  }

  if (result.presetNames) {
    result.presetNames.forEach((name) => {
      addPresetToDropdown(name);
    });
  }

  if (result["captureError." + id]) {
    renderCaptureError(result["captureError." + id]);
  }

  showInstallUpdateNotice(stored);

  await startToolkitTabCapture();
  await renderCapturedTabs();
}

window.addEventListener("resize", mainResize);
window.addEventListener("load", mainLoad);

chrome.storage.onChanged.addListener(async (ps) => {
  if (isToolkitWindow && ps[TOOLKIT_WINDOW_ACTIVE_TAB_KEY]) {
    g_toolkitActiveTabId = ps[TOOLKIT_WINDOW_ACTIVE_TAB_KEY].newValue ?? null;
    await loadToolkitTabSettings(g_toolkitActiveTabId);
    await renderCapturedTabs();
  }
  if (isToolkitWindow && ps[TOOLKIT_WINDOW_CAPTURE_STREAM_IDS_KEY]) {
    await startToolkitTabCapture();
    await renderCapturedTabs();
  }

  const tabId = await getCurrentTabId();
  if (tabId == null || tabId == undefined) return;
  if (ps["enabled." + tabId]) setEnableBtnText(ps["enabled." + tabId].newValue);
  if (ps["mute." + tabId]) setMuteBtnClass(ps["mute." + tabId].newValue);
  if (ps["captureError." + tabId])
    renderCaptureError(ps["captureError." + tabId].newValue);

  if (isToolkitWindow) {
    refreshToolkitCaptureFilters();
  }
});

// ********************
// Info modal for christmas theme
// ********************
const infoModal = document.getElementById("info-modal");
const infoBtn = document.getElementById("info-btn");
const closeInfo = document.getElementById("close-info-modal");

infoBtn.onclick = function () {
  infoModal.style.display = "block";
};
closeInfo.onclick = function () {
  infoModal.style.display = "none";
};
