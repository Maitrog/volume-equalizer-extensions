import { RUNTIME_MESSAGES } from "../../infrastructure/chrome/runtimeMessages";

export const ensureContentScripts = async (tabId: number): Promise<void> => {
  const isLoaded = await chrome.tabs
    .sendMessage(tabId, {
      method: RUNTIME_MESSAGES.CONTENT_SCRIPT_PING,
    })
    .then(
      () => true,
      () => false,
    );
  if (isLoaded) return;

  try {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      files: ["scripts/content-isolated.js"],
      world: "ISOLATED",
    });
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      files: ["scripts/content-main.js"],
      world: "MAIN",
    });
  } catch (error) {
    console.error("Unable to load content scripts", error);
  }
};
