const CONTENT_SCRIPT_PROPS: Pick<
  chrome.scripting.RegisteredContentScript,
  "matches" | "allFrames" | "matchOriginAsFallback" | "runAt"
> = {
  matches: ["*://*/*"],
  allFrames: true,
  matchOriginAsFallback: true,
  runAt: "document_start",
};

export const registerContentScripts = async (): Promise<void> => {
  await chrome.scripting.unregisterContentScripts();

  await chrome.scripting.registerContentScripts([
    {
      id: "events",
      js: ["scripts/content-isolated.js"],
      world: "ISOLATED",
      ...CONTENT_SCRIPT_PROPS,
    },
    {
      id: "filter",
      js: ["scripts/content-main.js"],
      world: "MAIN",
      ...CONTENT_SCRIPT_PROPS,
    },
  ]);
};
