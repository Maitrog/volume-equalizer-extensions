import { RUNTIME_MESSAGES } from "../../infrastructure/chrome/runtimeMessages";

export const ensureContentScripts = async (tabId: number): Promise<void> => {
  console.log("[ensureContentScripts] Checking tab", tabId);

  try {
    await chrome.tabs.sendMessage(tabId, {
      method: RUNTIME_MESSAGES.CONTENT_SCRIPT_PING,
    });
    console.log("[ensureContentScripts] Ping succeeded", tabId);
    return;
  } catch (error) {
    console.log("[ensureContentScripts] Ping failed", tabId, error);
  }

  try {
    console.log("[ensureContentScripts] Injecting isolated script", tabId);
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      files: ["scripts/content-isolated.js"],
      world: "ISOLATED",
    });
    console.log("[ensureContentScripts] Isolated script injected", tabId);

    console.log("[ensureContentScripts] Injecting main script", tabId);
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      files: ["scripts/content-main.js"],
      world: "MAIN",
    });
    console.log("[ensureContentScripts] Main script injected", tabId);
  } catch (error) {
    console.error("[ensureContentScripts] Injection failed", tabId, error);
  }
};
