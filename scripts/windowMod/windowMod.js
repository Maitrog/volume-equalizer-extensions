const TOOLKIT_WINDOW_KEY = "toolkitWindowId";
const TOOLKIT_WINDOW_TAB_IDS_KEY = "toolkitWindowTabIds";
const TOOLKIT_WINDOW_ACTIVE_TAB_KEY = "toolkitWindowActiveTabId";
const TOOLKIT_WINDOW_CAPTURE_STREAM_IDS_KEY = "toolkitWindowCaptureStreamIds";

const capturedTabsElem = document.getElementById("captured-tabs");

const isToolkitWindow =
  new URLSearchParams(window.location.search).get("mode") === "window";

if (isToolkitWindow) {
  document.body.classList.add("toolkit-window-body");
  const changeEqBtn = document.getElementById("change-eq");
  changeEqBtn.disabled = true;
  changeEqBtn.classList.add("disabled");
}

let g_toolkitActiveTabId = null;
let g_toolkitCaptures = new Map();

// ********************
// Window already open notification
// ********************
async function shouldShowToolkitWindowNotice() {
  if (isToolkitWindow) return false;

  const tabId = await getCurrentTabId();
  const stored = await chrome.storage.session.get([
    TOOLKIT_WINDOW_KEY,
    TOOLKIT_WINDOW_TAB_IDS_KEY,
  ]);
  const toolkitWindowTabIds = Array.isArray(stored[TOOLKIT_WINDOW_TAB_IDS_KEY])
    ? stored[TOOLKIT_WINDOW_TAB_IDS_KEY]
    : [];
  return (
    stored[TOOLKIT_WINDOW_KEY] != null && toolkitWindowTabIds.includes(tabId)
  );
}

function showToolkitWindowNotice() {
  const message =
    getLocalizedMessage("toolkit_window_already_open") ||
    "Equalizer is already open in a window";
  const notice = document.createElement("div");
  notice.className = "window-open-notice";
  notice.textContent = message;

  document.body.className = "window-open-notice-body";
  document.body.replaceChildren(notice);
}

async function getToolkitCaptureStreamIds() {
  const stored = await chrome.storage.session.get(
    TOOLKIT_WINDOW_CAPTURE_STREAM_IDS_KEY
  );
  return stored[TOOLKIT_WINDOW_CAPTURE_STREAM_IDS_KEY] ?? {};
}
