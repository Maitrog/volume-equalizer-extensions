document.getElementById("change-eq").addEventListener("click", async () => {
  if (isToolkitWindow) return;

  const tabId = await getCurrentTabId();
  chrome.storage.local.get(["enabled." + tabId]).then((result) => {
    const newFilters = pointsToFilters(points);
    const slider = document.getElementById("master-volume");
    chrome.storage.local.set({
      ["enabled." + tabId]: !result["enabled." + tabId],
      ["filters." + tabId]: newFilters,
      ["gain." + tabId]: slider.value,
    });
  });
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
  const volume = dbToGain(slider.value);
  applyToolkitCaptureSettings();
  const tabId = await getCurrentTabId();
  const values = {
    ["volume." + tabId]: volume,
    ["gain." + tabId]: slider.value,
  };
  if (!isToolkitWindow) values["enabled." + tabId] = true;
  chrome.storage.local.set(values);
};

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

function setEnableBtnText(enabled) {
  if (!enabled)
    document.getElementById("change-eq").textContent = getLocalizedMessage(
      "enable_eq_button_label"
    );
  else
    document.getElementById("change-eq").textContent = getLocalizedMessage(
      "stop_eq_button_label"
    );
}

function setMuteBtnClass(newValue) {
  const elem = document.getElementById("volume-mute");
  if (newValue) elem.className = "volume-mute-active";
  else elem.className = "volume-mute";
  applyToolkitCaptureSettings();
}

document.getElementById("window-mod").addEventListener("click", async () => {
  const tabId = await getCurrentTabId();
  chrome.runtime.sendMessage({ method: "enableWindowMode", tabId });
  window.close();
});

async function toggleCurrentTabStorageValue(key, options = {}) {
  const tabId = await getCurrentTabId();
  if (tabId == null) return;

  const storageKey = key + "." + tabId;
  const values = await chrome.storage.local.get([storageKey]);
  const nextValues = {
    [storageKey]: !values[storageKey],
  };
  if (options.enableTab && !isToolkitWindow) {
    nextValues["enabled." + tabId] = true;
  }
  await chrome.storage.local.set(nextValues);
}

document.addEventListener("keydown", async (event) => {
  if (event.repeat || isEditableShortcutTarget(event.target)) return;

  if (matchesShortcut(event, g_shortcutSettings[SHORTCUT_ACTION_MUTE_NAME])) {
    event.preventDefault();
    event.stopPropagation();
    await toggleCurrentTabStorageValue("mute", { enableTab: true });
    return;
  }

  if (
    matchesShortcut(event, g_shortcutSettings[SHORTCUT_ACTION_TOGGLE_EQ_NAME])
  ) {
    if (isToolkitWindow) return;

    event.preventDefault();
    event.stopPropagation();
    await toggleCurrentTabStorageValue("enabled");
  }
});
