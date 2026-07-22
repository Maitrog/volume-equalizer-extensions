import { applyAutostartForTab } from "./autostartOnTab";
import { prepareInstallUpdateNotice } from "./installUpdateNotice";
import { createRuntimeMessageHandler } from "./messageRouter";
import { registerContentScripts } from "./registerContentScripts";
import { clearUnusedStorage } from "./storageCleanup";
import {
  clearToolkitWindowState,
  getCapturedTabs,
  getToolkitWindowId,
  toggleWindowMode,
} from "./windowModeCoordinator";

chrome.runtime.onStartup.addListener(registerContentScripts);
chrome.runtime.onInstalled.addListener(async (details) => {
    await chrome.runtime.setUninstallURL(
    "https://docs.google.com/forms/d/e/1FAIpQLSfuD6fR4XS3qo6SqfLmagq5z6Daw_o4Z7vwNI4mjcb86sJN5w/viewform",
  );

  await registerContentScripts();
  await prepareInstallUpdateNotice(details);
});

const runtimeMessageHandler = createRuntimeMessageHandler({
  applyAutostartForTab,
  clearUnusedStorage,
  getCapturedTabs,
  toggleWindowMode,
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) =>
  runtimeMessageHandler(
    message,
    sender,
    sendResponse as (response?: unknown) => void
  ) ?? undefined
);

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    await applyAutostartForTab(tabId, tab.url);
  } catch (e) {}
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!changeInfo.url) return;
  void applyAutostartForTab(tabId, tab.url);
});

chrome.windows.onRemoved.addListener(async (windowId) => {
  const id = await getToolkitWindowId();
  if (id === windowId) await clearToolkitWindowState();
});
