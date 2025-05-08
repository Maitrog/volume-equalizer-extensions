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

const prefs = {
  enabled: false,
  persist: false,
};

chrome.storage.local.get(prefs, (ps) => {
  Object.assign(prefs, ps);

  if (prefs.persist === false && prefs.enabled) {
    const onStartup = () => {
      prefs.enabled = false;
      chrome.storage.local.set({
        enabled: false,
      });
    };
    chrome.runtime.onStartup.addListener(onStartup);
    chrome.runtime.onInstalled.addListener(onStartup);
  }
});

chrome.runtime.onMessage.addListener((request, sender, response) => {
  const tabId = sender.tab.id;
  if (request.method === "me") {
    response(sender.tab.url);
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
});
