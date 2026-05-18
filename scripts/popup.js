let dragIndex = null;
const canvas = document.getElementById("eq-canvas");
const ctx = canvas.getContext("2d", { alpha: true });
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

const THEME_KEY = "theme";
const DEFAULT_THEME = "dark";
const SKIP_POINTS_CONFIRM_KEY = "skipPointsResetConfirm";
const POINT_COUNT_KEY = "pointCount";
const INSTALL_UPDATE_NOTICE_KEY = "installUpdateNotice";
const captureErrorElem = document.getElementById("capture-error");
const captureErrorPrefix = chrome.i18n.getMessage("capture_error_prefix");

const logMin = Math.log10(1);
const logMax = Math.log10(22000);
const MIN_POINT_COUNT = 5;
const MAX_POINT_COUNT = 9;
const DEFAULT_FILTER_Q = 0.5;
const MIN_FILTER_Q = 0.1;
const MAX_FILTER_Q = 10;
let pointCount = MIN_POINT_COUNT;
let currentTheme = DEFAULT_THEME;
let skipPointsResetConfirm = false;
let pendingPointCount = null;
let dragMode = null;
let qDragStartY = 0;
let qDragStartValue = DEFAULT_FILTER_Q;

function clampPointCount(value) {
  return Math.max(MIN_POINT_COUNT, Math.min(MAX_POINT_COUNT, value));
}

function ensureQFactor(value) {
  const q = Number(value);
  if (!Number.isFinite(q)) return DEFAULT_FILTER_Q;
  return Math.max(MIN_FILTER_Q, Math.min(MAX_FILTER_Q, q));
}

function savePointCount(count) {
  return chrome.storage.local.set({ pointCount: clampPointCount(count) });
}

function saveTheme(theme) {
  return chrome.storage.local.set({ [THEME_KEY]: theme });
}

function updatePointCountSelect(count) {
  const select = document.getElementById("points-count");
  if (select) select.value = clampPointCount(count).toString();
}

function xToFrequency(x, canvasWidth = null) {
  canvasWidth ??= canvas.width - 10;
  const freq = Math.pow(
    10,
    Math.sqrt(x / canvasWidth) * (logMax - logMin) + logMin
  );
  return freq > 24000 ? 24000 : freq;
}

function frequencyToX(freq, canvasWidth = null) {
  if (freq == 0) return 0;

  freq = freq > 24000 ? 24000 : freq;
  canvasWidth ??= canvas.width - 10;
  const x =
    Math.pow((Math.log10(freq) - logMin) / (logMax - logMin), 2) * canvasWidth;
  return x;
}

function yToDb(y, canvasHeight = null) {
  canvasHeight ??= canvas.height;
  return ((canvasHeight / 2 - y) / (canvasHeight / 2 - 20)) * 25;
}

function renderCaptureError(message) {
  if (!captureErrorElem) return;
  if (!message) {
    captureErrorElem.style.display = "none";
    captureErrorElem.textContent = "";
    return;
  }

  console.log(message);
  captureErrorElem.textContent = `${captureErrorPrefix}`;
  captureErrorElem.style.display = "block";
}

function dbToGain(db) {
  let gain;
  if (db >= 0) {
    gain = 1 + db / 3;
  } else {
    gain = 1.5 / Math.abs(db);
  }

  return gain;
}

function createCenteredPoint(index, count = pointCount) {
  const actualCount = clampPointCount(count);
  const centerY = canvas.height / 2;
  const pointStep = canvas.width / (actualCount + 1);
  return { x: pointStep * (index + 1), y: centerY, q: DEFAULT_FILTER_Q };
}

function createCenteredPoints(count = pointCount) {
  const actualCount = clampPointCount(count);
  return Array.from({ length: actualCount }, (_, i) => {
    return createCenteredPoint(i, actualCount);
  });
}

function initPoints(count = pointCount) {
  pointCount = clampPointCount(count);
  points = createCenteredPoints(pointCount);
}

function setPoints(filters) {
  pointCount = clampPointCount(filters.length);
  savePointCount(pointCount);
  updatePointCountSelect(pointCount);
  points = filters.map((filter, index) => {
    const centeredPoint = createCenteredPoint(index, pointCount);
    const freq = filter.freq ?? filter.frequency;
    const gain = filter.gain;
    const x = Number.isFinite(Number(filter.x))
      ? Number(filter.x)
      : Number.isFinite(Number(freq))
      ? frequencyToX(Number(freq))
      : centeredPoint.x;
    const y = Number.isFinite(Number(filter.y))
      ? Number(filter.y)
      : Number.isFinite(Number(gain))
      ? canvas.height / 2 - (Number(gain) / 25) * (canvas.height / 2 - 20)
      : centeredPoint.y;

    return { x: x, y: y, q: ensureQFactor(filter.q ?? filter.Q) };
  });
}

function mainResize() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  resizeCanvas();
  drawFilter();
}

function getPendingInstallUpdateNotice(stored) {
  const notice = stored[INSTALL_UPDATE_NOTICE_KEY];
  if (isToolkitWindow) return null;
  if (!notice || typeof notice !== "object") return null;
  if (!["install", "update"].includes(notice.reason)) return null;
  if (notice.version !== chrome.runtime.getManifest().version) return null;
  return notice;
}

function showInstallUpdateNotice(stored) {
  const notice = getPendingInstallUpdateNotice(stored);
  const modal = document.getElementById("install-update-notice-modal");
  if (!notice || !modal) return;

  modal.style.display = "block";
}

async function closeInstallUpdateNotice() {
  const modal = document.getElementById("install-update-notice-modal");
  if (modal) modal.style.display = "none";
  await chrome.storage.local.remove(INSTALL_UPDATE_NOTICE_KEY);
}

async function mainLoad() {
  const stored = await chrome.storage.local.get([
    POINT_COUNT_KEY,
    THEME_KEY,
    SKIP_POINTS_CONFIRM_KEY,
    INSTALL_UPDATE_NOTICE_KEY,
  ]);
  currentTheme = stored[THEME_KEY] ?? DEFAULT_THEME;
  applyTheme(currentTheme);

  if (await shouldShowToolkitWindowNotice()) {
    showToolkitWindowNotice();
    return;
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  resizeCanvas();
  const savedPointCount = parseInt(stored.pointCount, 10);
  if (!Number.isNaN(savedPointCount)) {
    pointCount = clampPointCount(savedPointCount);
  }
  skipPointsResetConfirm =
    stored[SKIP_POINTS_CONFIRM_KEY] === true ||
    stored[SKIP_POINTS_CONFIRM_KEY] === "true";
  updatePointCountSelect(pointCount);

  const id = await getCurrentTabId();
  const result = await chrome.storage.local.get([
    "filters",
    "filters." + id,
    "gain." + id,
    "presetNames",
    "enabled." + id,
    "mute." + id,
    "enableSpectrum",
    "captureError." + id,
  ]);
  if (
    result["filters." + id] != null &&
    result["filters." + id] != undefined &&
    result["filters." + id].length != 0
  )
    setPoints(result["filters." + id]);
  else if (
    result["filters"] != null &&
    result["filters"] != undefined &&
    result["filters"].length != 0
  )
    setPoints(result["filters"]);
  else initPoints();

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

canvas.addEventListener("mousedown", (e) => {
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  const pointIndex = getPointIndexAtPosition(mx, my);
  if (pointIndex === -1) return;

  dragIndex = pointIndex;
  dragMode = e.shiftKey ? "q" : "point";
  qDragStartY = my;
  qDragStartValue = ensureQFactor(points[pointIndex].q);
});

window.addEventListener("mouseup", () => {
  dragIndex = null;
  dragMode = null;
});

function addPresetToDropdown(name) {
  var option = document.createElement("div");
  option.textContent = name;
  option.setAttribute("data-value", name);
  option.className = "dropdown-item";
  var closeBtn = document.createElement("span");
  closeBtn.className = "close-btn";
  closeBtn.textContent = "×";
  closeBtn.setAttribute("data-value", name);
  option.appendChild(closeBtn);
  document.getElementById("presets-menu").appendChild(option);
}

function pointsToFilters(points) {
  const filters = points.map((p) => {
    return {
      freq: xToFrequency(p.x),
      gain: yToDb(p.y),
      q: ensureQFactor(p.q),
      x: p.x,
      y: p.y,
    };
  });
  return filters;
}

async function saveCurrentFilters() {
  const tabId = await getCurrentTabId();
  if (tabId == null || tabId == undefined) return;

  const newFilters = pointsToFilters(points);
  const values = {
    ["filters." + tabId]: newFilters,
    ["filters"]: newFilters,
  };
  if (!isToolkitWindow) values["enabled." + tabId] = true;
  return chrome.storage.local.set(values);
}

function getPointIndexAtPosition(x, y) {
  return points.findIndex((p) => {
    return Math.hypot(p.x - x, p.y - y) < pointRadius + 2;
  });
}

function applyTheme(theme) {
  const chosen = themes[theme] ?? themes.dark;
  Object.entries(chosen).forEach(([key, value]) => {
    document.documentElement.style.setProperty(`--${key}`, value);
  });
  currentTheme = theme in themes ? theme : DEFAULT_THEME;
  const select = document.getElementById("theme-select");
  if (select) select.value = currentTheme;
  if (typeof loadColors === "function") loadColors();
  mainResize();
}

function shouldSkipPointsResetConfirm() {
  return skipPointsResetConfirm;
}

function setSkipPointsResetConfirm(value) {
  skipPointsResetConfirm = Boolean(value);
  return chrome.storage.local.set({
    [SKIP_POINTS_CONFIRM_KEY]: skipPointsResetConfirm,
  });
}

async function applyPointCountChange(newCount) {
  await savePointCount(newCount);
  initPoints(newCount);
  mainResize();
  refreshToolkitCaptureFilters();
  await saveCurrentFilters();
}

canvas.addEventListener("mousemove", async (e) => {
  if (dragIndex !== null) {
    const rect = canvas.getBoundingClientRect();
    let mx = e.clientX - rect.left;
    let my = e.clientY - rect.top;
    if (dragMode === "q") {
      const dy = qDragStartY - my;
      const nextQ = qDragStartValue * Math.pow(2, dy / 40);
      points[dragIndex].q = ensureQFactor(nextQ);
      mainResize();
      refreshToolkitCaptureFilters();
      await saveCurrentFilters();
    } else if (mx > 0) {
      mx = Math.max(0, Math.min(canvas.width, mx));
      my = Math.max(0, Math.min(canvas.height, my));
      points[dragIndex] = { ...points[dragIndex], x: mx, y: my };
      mainResize();
      refreshToolkitCaptureFilters();
      await saveCurrentFilters();
    }
  }
});

canvas.addEventListener("dblclick", (e) => {
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  const pointIndex = getPointIndexAtPosition(mx, my);
  if (pointIndex === -1) return;

  points[pointIndex] = createCenteredPoint(pointIndex, points.length);
  mainResize();
  refreshToolkitCaptureFilters();
  saveCurrentFilters();
});

document.getElementById("change-eq").addEventListener("click", async () => {
  if (isToolkitWindow) return;

  const tabId = await getCurrentTabId();
  chrome.storage.local.get(["enabled." + tabId]).then((result) => {
    var newFilters = pointsToFilters(points);
    const slider = document.getElementById("master-volume");
    chrome.storage.local.set({
      ["enabled." + tabId]: !result["enabled." + tabId],
      ["filters." + tabId]: newFilters,
      ["gain." + tabId]: slider.value,
    });
  });
});

chrome.storage.onChanged.addListener(async (ps) => {
  if (isToolkitWindow && ps[TOOLKIT_WINDOW_ACTIVE_TAB_KEY]) {
    toolkitActiveTabId = ps[TOOLKIT_WINDOW_ACTIVE_TAB_KEY].newValue ?? null;
    await loadToolkitTabSettings(toolkitActiveTabId);
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

document.getElementById("reset").addEventListener("click", async () => {
  document.getElementById("master-volume").value = 0;
  initPoints();
  mainResize();
  refreshToolkitCaptureFilters();

  const tabId = await getCurrentTabId();
  chrome.storage.local.set({
    ["volume." + tabId]: 1,
    ["gain." + tabId]: 0,
    ["filters." + tabId]: pointsToFilters(points),
  });
});

const slider = document.getElementById("master-volume");
slider.oninput = async () => {
  let volume = dbToGain(slider.value);
  applyToolkitCaptureSettings();
  const tabId = await getCurrentTabId();
  const values = {
    ["volume." + tabId]: volume,
    ["gain." + tabId]: slider.value,
  };
  if (!isToolkitWindow) values["enabled." + tabId] = true;
  chrome.storage.local.set(values);
};

document.getElementById("save-preset").addEventListener("click", async () => {
  const nameInput = document.getElementById("preset-name");
  const name = nameInput.value;

  if (name.length == 0) return;

  let needAdd = true;
  const tabId = await getCurrentTabId();
  chrome.storage.local
    .get(["filters." + tabId, "presets", "presetNames"])
    .then((prefs) => {
      const presets = prefs.presets ?? {};
      const presetNames = prefs.presetNames ?? [];
      presets[name] = prefs["filters." + tabId];
      needAdd = !presetNames.includes(name);
      if (needAdd) presetNames.push(name);
      chrome.storage.local.set({
        presets: presets,
        presetNames: presetNames,
      });
      if (needAdd) addPresetToDropdown(name);
    });

  nameInput.value = "";
});

function setEnableBtnText(enabled) {
  if (!enabled)
    document.getElementById("change-eq").textContent =
      chrome.i18n.getMessage("enable_eq");
  else
    document.getElementById("change-eq").textContent =
      chrome.i18n.getMessage("stop_eq");
}

async function getCurrentTabId() {
  if (isToolkitWindow) {
    if (toolkitActiveTabId != null) return toolkitActiveTabId;

    const stored = await chrome.storage.session.get(
      TOOLKIT_WINDOW_ACTIVE_TAB_KEY
    );
    toolkitActiveTabId = stored[TOOLKIT_WINDOW_ACTIVE_TAB_KEY] ?? null;
    return toolkitActiveTabId;
  }

  let queryOptions = { active: true, lastFocusedWindow: true };
  let [tab] = await chrome.tabs.query(queryOptions);
  return tab?.id;
}

const dropdown = document.getElementById("presets");
const toggle = document.getElementById("presets-toggle");
const menu = document.getElementById("presets-menu");
toggle.addEventListener("click", () => {
  menu.style.display = menu.style.display === "block" ? "none" : "block";
});
document.addEventListener("click", (e) => {
  if (!dropdown.contains(e.target)) menu.style.display = "none";
});
menu.addEventListener("click", (e) => {
  const choice = e.target.getAttribute("data-value");
  if (choice == "none") {
    toggle.textContent = choice;
    menu.style.display = "none";
    return;
  }

  if (e.target.classList.contains("close-btn")) {
    const item = e.target.parentElement;
    item.remove();
    chrome.storage.local.get(["presets", "presetNames"]).then(async (prefs) => {
      const presets = prefs.presets;
      const presetNames = prefs.presetNames.filter((n) => n != choice);
      delete presets[choice];

      chrome.storage.local.set({
        presets: presets,
        presetNames: presetNames,
      });
    });
  } else if (e.target.classList.contains("dropdown-item")) {
    toggle.textContent = choice;
    chrome.storage.local.get(["presets"]).then(async (prefs) => {
      if (!prefs.presets) return;

      const presets = prefs.presets;
      const tabId = await getCurrentTabId();
      const values = {
        ["filters." + tabId]: presets[choice],
      };
      if (!isToolkitWindow) values["enabled." + tabId] = true;
      chrome.storage.local.set(values);
      setPoints(presets[choice]);
      mainResize();
      refreshToolkitCaptureFilters();
    });
    menu.style.display = "none";
  }
});

document.getElementById("volume-mute").addEventListener("click", async () => {
  const tabId = await getCurrentTabId();
  const enableReady = isToolkitWindow
    ? Promise.resolve()
    : chrome.storage.local.set({ ["enabled." + tabId]: true });
  enableReady.then(() =>
    chrome.storage.local.get(["mute." + tabId]).then((result) => {
      chrome.storage.local.set({
        ["mute." + tabId]: !result["mute." + tabId],
      });
    })
  );
});

function setMuteBtnClass(newValue) {
  var elem = document.getElementById("volume-mute");
  if (newValue) elem.className = "volume-mute-active";
  else elem.className = "volume-mute";
  applyToolkitCaptureSettings();
}

const themeSelect = document.getElementById("theme-select");
if (themeSelect) {
  themeSelect.value = currentTheme;
  themeSelect.addEventListener("change", (e) => {
    const theme = e.target.value || DEFAULT_THEME;
    applyTheme(theme);
    saveTheme(theme);
  });
}

const pointsCountSelect = document.getElementById("points-count");
if (pointsCountSelect) {
  pointsCountSelect.addEventListener("change", async (e) => {
    const newCount = clampPointCount(parseInt(e.target.value, 10));
    if (Number.isNaN(newCount)) return;
    if (shouldSkipPointsResetConfirm()) {
      applyPointCountChange(newCount);
      return;
    }
    pendingPointCount = newCount;
    const skipCheckbox = document.getElementById("skip-reset-confirm");
    if (skipCheckbox) {
      skipCheckbox.checked = shouldSkipPointsResetConfirm();
    }
    const modalElem = document.getElementById("points-reset-modal");
    if (modalElem) modalElem.style.display = "block";
  });
}

const settingsModal = document.getElementById("settings-modal");
const settingsBtn = document.getElementById("settings-btn");
const closeSettings = document.getElementById("close-settings");

settingsBtn.onclick = function () {
  settingsModal.style.display = "block";
};
closeSettings.onclick = function () {
  settingsModal.style.display = "none";
};
window.onclick = function (event) {
  if (event.target === settingsModal) {
    settingsModal.style.display = "none";
  }
};

const infoModal = document.getElementById("info-modal");
const infoBtn = document.getElementById("info-btn");
const closeInfo = document.getElementById("close-info-modal");

infoBtn.onclick = function () {
  infoModal.style.display = "block";
};
closeInfo.onclick = function () {
  infoModal.style.display = "none";
};

const pointsResetModal = document.getElementById("points-reset-modal");
const pointsResetConfirmBtn = document.getElementById("points-reset-confirm");
const pointsResetCancelBtn = document.getElementById("points-reset-cancel");
const skipResetCheckbox = document.getElementById("skip-reset-confirm");
const installUpdateNoticeCloseBtn = document.getElementById(
  "install-update-notice-close"
);

function closePointsResetModal() {
  if (pointsResetModal) pointsResetModal.style.display = "none";
}

if (pointsResetConfirmBtn) {
  pointsResetConfirmBtn.addEventListener("click", async () => {
    if (skipResetCheckbox) {
      setSkipPointsResetConfirm(skipResetCheckbox.checked);
    }
    if (pendingPointCount != null) {
      await applyPointCountChange(pendingPointCount);
    }
    pendingPointCount = null;
    closePointsResetModal();
  });
}

if (pointsResetCancelBtn) {
  pointsResetCancelBtn.addEventListener("click", () => {
    updatePointCountSelect(pointCount);
    pendingPointCount = null;
    closePointsResetModal();
  });
}

if (pointsResetModal) {
  pointsResetModal.addEventListener("click", (event) => {
    if (event.target === pointsResetModal) {
      updatePointCountSelect(pointCount);
      pendingPointCount = null;
      closePointsResetModal();
    }
  });
}

if (installUpdateNoticeCloseBtn) {
  installUpdateNoticeCloseBtn.addEventListener(
    "click",
    closeInstallUpdateNotice
  );
}

document.getElementById("window-mod").addEventListener("click", async () => {
  const tabId = await getCurrentTabId();
  chrome.runtime.sendMessage({ method: "enableWindowMode", tabId });
  window.close();
});
