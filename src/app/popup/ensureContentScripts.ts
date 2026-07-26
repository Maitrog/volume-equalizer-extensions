import { RUNTIME_MESSAGES } from "../../infrastructure/chrome/runtimeMessages";

const pingContentScripts = async (tabId: number): Promise<boolean | null> => {
  try {
    return (
      (await chrome.tabs.sendMessage(tabId, {
        method: RUNTIME_MESSAGES.CONTENT_SCRIPT_PING,
      })) === true
    );
  } catch (error) {
    console.log("[ensureContentScripts] Ping failed", tabId, error);
    return null;
  }
};

export const ensureContentScripts = async (tabId: number): Promise<void> => {
  console.log("[ensureContentScripts] Checking tab", tabId);

  const mainReady = await pingContentScripts(tabId);
  if (mainReady) {
    console.log("[ensureContentScripts] Ping succeeded", tabId);
    return;
  }

  try {
    if (mainReady === null) {
      console.log("[ensureContentScripts] Injecting isolated script", tabId);
      await chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        files: ["scripts/content-isolated.js"],
        world: "ISOLATED",
      });
      console.log("[ensureContentScripts] Isolated script injected", tabId);

      if (await pingContentScripts(tabId)) {
        console.log("[ensureContentScripts] Reusing main script", tabId);
        return;
      }
    }

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
