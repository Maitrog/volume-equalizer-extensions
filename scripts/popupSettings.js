// ********************
// Settings modal
// ********************
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

// ********************
// Theme settings
// ********************
function saveTheme(theme) {
  return chrome.storage.local.set({ [THEME_KEY]: theme });
}

function applyTheme(theme) {
  const chosen = themes[theme] ?? themes.dark;
  Object.entries(chosen).forEach(([key, value]) => {
    document.documentElement.style.setProperty(`--${key}`, value);
  });
  g_currentTheme = theme in themes ? theme : DEFAULT_THEME;
  const select = document.getElementById("theme-select");
  if (select) select.value = g_currentTheme;
  if (typeof loadColors === "function") loadColors();
  mainResize();
}

const themeSelect = document.getElementById("theme-select");
if (themeSelect) {
  themeSelect.value = g_currentTheme;
  themeSelect.addEventListener("change", (e) => {
    const theme = e.target.value || DEFAULT_THEME;
    applyTheme(theme);
    saveTheme(theme);
  });
}

// ********************
// EQ points count settings
// ********************
function shouldSkipPointsResetConfirm() {
  return g_skipPointsResetConfirm;
}

function setSkipPointsResetConfirm(value) {
  g_skipPointsResetConfirm = Boolean(value);
  return chrome.storage.local.set({
    [SKIP_POINTS_CONFIRM_KEY]: g_skipPointsResetConfirm,
  });
}

function updatePointCountSelect(count) {
  const select = document.getElementById("points-count");
  if (select) select.value = clampPointCount(count).toString();
}

async function applyPointCountChange(newCount) {
  await savePointCount(newCount);
  initPoints(newCount);
  mainResize();
  refreshToolkitCaptureFilters();
  await saveCurrentFilters();
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
    g_pendingPointCount = newCount;
    const skipCheckbox = document.getElementById("skip-reset-confirm");
    if (skipCheckbox) {
      skipCheckbox.checked = shouldSkipPointsResetConfirm();
    }
    const modalElem = document.getElementById("points-reset-modal");
    if (modalElem) modalElem.style.display = "block";
  });
}

// ********************
// Points reset confirmation modal
// ********************
const pointsResetModal = document.getElementById("points-reset-modal");
const pointsResetConfirmBtn = document.getElementById("points-reset-confirm");
const pointsResetCancelBtn = document.getElementById("points-reset-cancel");
const skipResetCheckbox = document.getElementById("skip-reset-confirm");

function closePointsResetModal() {
  if (pointsResetModal) pointsResetModal.style.display = "none";
}

if (pointsResetConfirmBtn) {
  pointsResetConfirmBtn.addEventListener("click", async () => {
    if (skipResetCheckbox) {
      setSkipPointsResetConfirm(skipResetCheckbox.checked);
    }
    if (g_pendingPointCount != null) {
      await applyPointCountChange(g_pendingPointCount);
    }
    g_pendingPointCount = null;
    closePointsResetModal();
  });
}

if (pointsResetCancelBtn) {
  pointsResetCancelBtn.addEventListener("click", () => {
    updatePointCountSelect(g_pointCount);
    g_pendingPointCount = null;
    closePointsResetModal();
  });
}

if (pointsResetModal) {
  pointsResetModal.addEventListener("click", (event) => {
    if (event.target === pointsResetModal) {
      updatePointCountSelect(g_pointCount);
      g_pendingPointCount = null;
      closePointsResetModal();
    }
  });
}

// ********************
// Presets import and export
// ********************
document.getElementById("export-presets").addEventListener("click", () => {
  chrome.storage.local.get(["presets", "presetNames"]).then((result) => {
    const json = JSON.stringify(result);
    saveTextAsFile(json, "eq_toolkit_presets.json");
  });
});

function saveTextAsFile(text, filename = "file.txt") {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });

  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);

  a.click();

  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const input = document.getElementById("import-input");
document.getElementById("import-presets").addEventListener("click", () => {
  input.click();
});

input.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    const presetsInfo = JSON.parse(reader.result);
    chrome.storage.local.get(["presets", "presetNames"]).then((prefs) => {
      const presets = prefs.presets ?? {};
      const presetNames = prefs.presetNames ?? [];
      presetsInfo.presetNames.forEach((name) => {
        const needAdd = !presetNames.includes(name);
        if (needAdd) {
          presetNames.push(name);
          addPresetToDropdown(name);
          presets[name] = presetsInfo.presets[name];
        }
      });
      chrome.storage.local.set({
        presets: presets,
        presetNames: presetNames,
      });
    });
  };
  reader.readAsText(file, "utf-8");
});

// ********************
// Spectrum setting
// ********************
document.getElementById("enable-spectrum").addEventListener("change", (e) => {
  const value = e.target.checked;

  chrome.storage.local.set({
    enableSpectrum: value,
  });
});

// ********************
// Language setting
// ********************
const languageSelect = document.getElementById("language-select");
if (languageSelect) {
  languageSelect.addEventListener("change", (event) => {
    setLanguage(event.target.value, { save: true });
  });
}
