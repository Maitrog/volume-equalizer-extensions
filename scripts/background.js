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
  const tabId = sender.tab.id;
  if (request.method === "getTabId") {
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
  } else if (request.method === "log") {
    console.log(request.message);
  } else if (request.method === "clearStorage") {
    const constParamNames = ["presets", "presetNames", "gain", "filters"];
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
