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

chrome.runtime.onMessage.addListener((request, sender, response) => {
  const tabId = sender.tab.id;
  if (request.method === "getTabId") {
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
  }
  return true;
});

async function getCurrentTabId() {
  let queryOptions = { active: true, lastFocusedWindow: true };
  let [tab] = await chrome.tabs.query(queryOptions);
  return tab.id;
}
