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
      js: ["scripts/events.js"],
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

chrome.runtime.onStartup.addListener(register);
chrome.runtime.onInstalled.addListener(register);

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

chrome.runtime.onMessage.addListener(async (request, sender, response) => {
  if (request.method === "log") {
    console.log(request.message);
    return;
  }

  if (request.method === "enableExperimentalMode") {
    toggleToolkitWindow();
    return;
  }

  const tabId = sender.tab.id;
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
    response(sender.tab.id);
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
    const constParamNames = [
      "presets",
      "presetNames",
      "gain",
      "filters",
      "enableSpectrum",
    ];
    const tabIds = (await chrome.storage.session.get(["tabs"])).tabs;

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
  return true;
});

async function getCurrentTabId() {
  let queryOptions = { active: true, lastFocusedWindow: true };
  let [tab] = await chrome.tabs.query(queryOptions);
  return tab.id;
}

const WINDOW_KEY = "toolkitWindowId"; // ключ, под которым хранится id окна

async function toggleToolkitWindow() {
  let id = await getWindowId();

  if (id) {
    // Если id сохранён, пробуем закрыть
    await closeToolkitWindow(id);
    return;
  }

  // Окно не сохранено — создаём
  await createToolkitWindow();
}

async function getWindowId() {
  const obj = await chrome.storage.session.get(WINDOW_KEY);
  return obj[WINDOW_KEY] ?? null;
}

async function setWindowId(id) {
  await chrome.storage.session.set({ [WINDOW_KEY]: id });
}

async function clearWindowId() {
  await chrome.storage.session.remove(WINDOW_KEY);
}

async function createToolkitWindow() {
  const w = await chrome.windows.create({
    url: chrome.runtime.getURL("popup.html"),
    type: "popup", // компактное окно без вкладок
    width: 420, // подгоните под ваш UI
    height: 640,
    focused: true,
  });
  await setWindowId(w.id);
  return w.id;
}

async function closeToolkitWindow(windowId) {
  try {
    await chrome.windows.remove(windowId);
  } catch (e) {
    // окно уже могло быть закрыто пользователем — игнорируем
  } finally {
    await clearWindowId();
  }
}
