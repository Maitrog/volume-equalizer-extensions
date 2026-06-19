importScripts(chrome.runtime.getURL("scripts/whitelist.js"));

importScripts(chrome.runtime.getURL("scripts/shortcuts.js"));

const register = async () => {
  await chrome.scripting.unregisterContentScripts();

  const props = {
    matches: ["*://*/*"],
    allFrames: true,
    matchOriginAsFallback: true,
    runAt: "document_start",
  };

  await chrome.scripting.registerContentScripts([
    {
      id: "events",
      js: ["scripts/shortcuts.js", "scripts/events.js"],
      world: "ISOLATED",
      ...props,
    },
    {
      id: "filter",
      js: ["scripts/filter.js"],
      world: "MAIN",
      ...props,
    },
  ]);
};

const INSTALL_UPDATE_NOTICE_KEY = "installUpdateNotice";

chrome.runtime.onStartup.addListener(register);
chrome.runtime.onInstalled.addListener(async (details) => {
  await register();
  await prepareInstallUpdateNotice(details);
});

async function prepareInstallUpdateNotice(details) {
  if (!["install", "update"].includes(details.reason)) return;

  await chrome.storage.local.set({
    [INSTALL_UPDATE_NOTICE_KEY]: {
      reason: details.reason,
      version: chrome.runtime.getManifest().version,
    },
  });
}

chrome.storage.local.get(["enabled"], async (ps) => {
  const id = await getCurrentTabId();

  if (ps.enabled) {
    const onStartup = () => {
      ps.enabled[id] = false;
      chrome.storage.local.set({
        ["enabled." + id]: false,
      });
    };
    chrome.runtime.onStartup.addListener(onStartup);
    chrome.runtime.onInstalled.addListener(onStartup);
  }
});

chrome.runtime.onMessage.addListener((request, sender, response) => {
  if (request.method === "log") {
    console.log(request.message);
    return;
  }

  if (request.method === "enableWindowMode") {
    toggleWindowMod(request.tabId);
    return;
  }

  if (request.method === "getCapturedTabs") {
    getCapturedTabs()
      .then(response)
      .catch(() => {
        response({ tabs: [], activeTabId: null });
      });
    return true;
  }

  const tabId = sender.tab?.id;
  if (tabId == null) return;

  if (request.method == "spectrum-frame") {
    chrome.storage.local.set({
      ["spectrum." + tabId]: request.payload,
    });
  } else if (request.method === "getTabId") {
    chrome.storage.session.get(["tabs"], (prefs) => {
      const tabs = prefs?.tabs ?? [];
      if (!tabs.includes(tabId)) {
        tabs.push(tabId);
        chrome.storage.session.set({ tabs: tabs });
      }
    });
    response(tabId);
  } else if (request.method === "pageStarted") {
    applyWhitelistForTab(tabId, sender.tab?.url, { resetWhenNoMatch: true });
  } else if (request.method === "connected") {
    chrome.action.setBadgeText({
      text: "ON",
      tabId,
    });
  } else if (request.method === "disconnected") {
    chrome.action.setBadgeText({
      text: "OFF",
      tabId,
    });
  } else if (request.method === "clearStorage") {
    clearUnusedStorage();
  }
  return true;
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    await applyWhitelistForTab(tabId, tab.url);
  } catch (e) {}
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!changeInfo.url) return;
  applyWhitelistForTab(tabId, tab.url);
});

async function getCurrentTabId() {
  let queryOptions = { active: true, lastFocusedWindow: true };
  let [tab] = await chrome.tabs.query(queryOptions);
  return tab.id;
}

async function clearUnusedStorage() {
  const constParamNames = [
    "presets",
    "presetNames",
    "whitelist",
    "gain",
    "filters",
    "enableSpectrum",
    "theme",
    "uiLanguage",
    "shortcuts",
    INSTALL_UPDATE_NOTICE_KEY,
  ];
  const tabIds = (await chrome.storage.session.get(["tabs"])).tabs ?? [];

  chrome.storage.local.getKeys((keys) =>
    keys.forEach((key) => {
      const keySplited = key.split(".");
      if (
        !constParamNames.includes(key) &&
        !(
          keySplited.length == 2 &&
          tabIds.includes(Number.parseInt(keySplited[1]))
        )
      )
        chrome.storage.local.remove(key);
    })
  );
}

async function applyWhitelistForTab(tabId, url, options = {}) {
  if (tabId == null || !url || !url.startsWith("http")) return;

  const stored = await chrome.storage.local.get(["whitelist", "presets"]);
  const entry = findWhitelistMatch(stored.whitelist, url);
  if (!entry) {
    if (options.resetWhenNoMatch) {
      await chrome.storage.local.set({ ["enabled." + tabId]: false });
    }
    return;
  }

  const preset = stored.presets?.[entry.presetName];
  if (!Array.isArray(preset) || preset.length === 0) {
    await chrome.storage.local.set({ ["enabled." + tabId]: false });
    return;
  }

  await chrome.storage.local.set({
    ["filters." + tabId]: preset,
    ["filters"]: preset,
    ["enabled." + tabId]: true,
  });
}

const WINDOW_KEY = "toolkitWindowId"; // ключ, под которым хранится id окна
const WINDOW_TAB_IDS_KEY = "toolkitWindowTabIds";
const WINDOW_ACTIVE_TAB_KEY = "toolkitWindowActiveTabId";
const WINDOW_CAPTURE_STREAM_IDS_KEY = "toolkitWindowCaptureStreamIds";

async function toggleWindowMod(tabId) {
  tabId ??= await getCurrentTabId();
  let id = await getWindowId();
  await prepareTabCapture(tabId);

  if (await isWindowExist()) {
    id = await getWindowId();
    await addTabIdToStore(tabId);
    await focusWindowMod(id);
    return;
  }

  // Окно не сохранено — создаём
  await createWindowMod(tabId);
}

async function getWindowId() {
  const obj = await chrome.storage.session.get(WINDOW_KEY);
  return obj[WINDOW_KEY] ?? null;
}

async function isWindowExist() {
  const id = await getWindowId();
  if (!id) return false;

  try {
    await chrome.windows.get(id);
    return true;
  } catch (e) {
    await clearWindowId();
    return false;
  }
}

async function addTabIdToStore(tabId) {
  if (tabId == null) return;

  const stored = await chrome.storage.session.get(WINDOW_TAB_IDS_KEY);
  const tabIds = Array.isArray(stored[WINDOW_TAB_IDS_KEY])
    ? stored[WINDOW_TAB_IDS_KEY]
    : [];

  if (!tabIds.includes(tabId)) {
    tabIds.push(tabId);
    await chrome.storage.session.set({ [WINDOW_TAB_IDS_KEY]: tabIds });
  }
}

async function getCapturedTabs() {
  const stored = await chrome.storage.session.get([
    WINDOW_TAB_IDS_KEY,
    WINDOW_ACTIVE_TAB_KEY,
  ]);
  const tabIds = Array.isArray(stored[WINDOW_TAB_IDS_KEY])
    ? stored[WINDOW_TAB_IDS_KEY]
    : [];
  const activeTabId = stored[WINDOW_ACTIVE_TAB_KEY] ?? null;
  const tabs = [];

  for (const tabId of tabIds) {
    try {
      const tab = await chrome.tabs.get(tabId);
      tabs.push({
        id: tab.id,
        title: tab.title,
        url: tab.url,
        favIconUrl: tab.favIconUrl,
        active: tab.id === activeTabId,
      });
    } catch (e) {}
  }

  return { tabs, activeTabId };
}

async function focusWindowMod(windowId) {
  try {
    const window = await chrome.windows.get(windowId);
    const updateInfo = { focused: true };
    if (window.state === "minimized") updateInfo.state = "normal";
    await chrome.windows.update(windowId, updateInfo);
  } catch (e) {
    await clearWindowId();
  }
}

async function clearWindowId() {
  await chrome.storage.session.remove([
    WINDOW_KEY,
    WINDOW_TAB_IDS_KEY,
    WINDOW_ACTIVE_TAB_KEY,
    WINDOW_CAPTURE_STREAM_IDS_KEY,
  ]);
}

async function prepareTabCapture(tabId) {
  if (tabId == null) return;

  await chrome.storage.local.set({
    ["enabled." + tabId]: false,
  });

  try {
    const streamId = await chrome.tabCapture.getMediaStreamId({
      targetTabId: tabId,
    });
    const stored = await chrome.storage.session.get(
      WINDOW_CAPTURE_STREAM_IDS_KEY
    );
    const streamIds = stored[WINDOW_CAPTURE_STREAM_IDS_KEY] ?? {};
    streamIds[tabId] = streamId;
    await chrome.storage.session.set({
      [WINDOW_ACTIVE_TAB_KEY]: tabId,
      [WINDOW_CAPTURE_STREAM_IDS_KEY]: streamIds,
    });
  } catch (e) {
    const stored = await chrome.storage.session.get(
      WINDOW_CAPTURE_STREAM_IDS_KEY
    );
    const streamIds = stored[WINDOW_CAPTURE_STREAM_IDS_KEY] ?? {};
    delete streamIds[tabId];
    await chrome.storage.session.set({
      [WINDOW_ACTIVE_TAB_KEY]: tabId,
      [WINDOW_CAPTURE_STREAM_IDS_KEY]: streamIds,
    });
    await chrome.storage.local.set({
      ["captureError." + tabId]: e?.message ?? "Tab audio capture failed",
    });
  }
}

async function createWindowMod(tabId) {
  const w = await chrome.windows.create({
    url: chrome.runtime.getURL("popup.html?mode=window"),
    type: "popup",
    width: 560,
    height: 586,
    focused: true,
  });
  const storageValues = {
    [WINDOW_KEY]: w.id,
  };
  if (tabId != null) storageValues[WINDOW_TAB_IDS_KEY] = [tabId];
  await chrome.storage.session.set(storageValues);
  return w.id;
}

chrome.windows.onRemoved.addListener(async (windowId) => {
  const id = await getWindowId();
  if (id === windowId) await clearWindowId();
});
