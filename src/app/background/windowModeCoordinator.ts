import { STORAGE_KEYS } from "../../infrastructure/chrome/storageKeys";

export interface CapturedTab {
  id: number | undefined;
  title: string | undefined;
  url: string | undefined;
  favIconUrl: string | undefined;
  active: boolean;
}

export interface CapturedTabsResult {
  tabs: CapturedTab[];
  activeTabId: number | null;
}

type CaptureStreamIds = Record<string, string>;

// ponytail: one background capture transaction at a time; use per-tab queues if capture throughput warrants it.
let captureSessionQueue: Promise<void> = Promise.resolve();

const updateCaptureSession = <T>(update: () => Promise<T>): Promise<T> => {
  const result = captureSessionQueue.then(update);
  captureSessionQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
};

interface WindowUpdateInfo {
  focused?: boolean;
  state?: chrome.windows.WindowState;
}

export const getCurrentTabId = async (): Promise<number | undefined> => {
  const queryOptions = { active: true, lastFocusedWindow: true };
  const [tab] = await chrome.tabs.query(queryOptions);
  return tab?.id;
};

export const toggleWindowMode = (tabId?: number): Promise<void> =>
  updateCaptureSession(async () => {
    const targetTabId = tabId ?? (await getCurrentTabId());
    await prepareTabCapture(targetTabId);

    if (await isToolkitWindowExist()) {
      const windowId = await getToolkitWindowId();
      await addTabIdToToolkitWindowStoreInternal(targetTabId);
      await focusToolkitWindow(windowId);
      return;
    }

    await createToolkitWindow(targetTabId);
  });

export const getToolkitWindowId = async (): Promise<number | null> => {
  const obj = await chrome.storage.session.get(STORAGE_KEYS.TOOLKIT_WINDOW_ID);
  return (obj[STORAGE_KEYS.TOOLKIT_WINDOW_ID] as number | undefined) ?? null;
};

const isToolkitWindowExist = async (): Promise<boolean> => {
  const windowId = await getToolkitWindowId();
  if (!windowId) return false;

  try {
    await chrome.windows.get(windowId);
    return true;
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("No window with id")) {
      throw error;
    }
    await clearToolkitWindowStateInternal();
    return false;
  }
};

const addTabIdToToolkitWindowStoreInternal = async (tabId: number | undefined): Promise<void> => {
  if (tabId == null) return;

  const stored = await chrome.storage.session.get(STORAGE_KEYS.TOOLKIT_WINDOW_TAB_IDS);
  const tabIds = Array.isArray(stored[STORAGE_KEYS.TOOLKIT_WINDOW_TAB_IDS])
    ? stored[STORAGE_KEYS.TOOLKIT_WINDOW_TAB_IDS]
    : [];

  if (!tabIds.includes(tabId)) {
    tabIds.push(tabId);
    await chrome.storage.session.set({
      [STORAGE_KEYS.TOOLKIT_WINDOW_TAB_IDS]: tabIds,
    });
  }
};

const updateCaptureStreamId = async (tabId: number, streamId: string | null): Promise<void> => {
  const stored = await chrome.storage.session.get(STORAGE_KEYS.TOOLKIT_WINDOW_CAPTURE_STREAM_IDS);
  const streamIds = {
    ...((stored[STORAGE_KEYS.TOOLKIT_WINDOW_CAPTURE_STREAM_IDS] as CaptureStreamIds | undefined) ??
      {}),
  };
  if (streamId == null) {
    delete streamIds[tabId];
  } else {
    streamIds[tabId] = streamId;
  }
  await chrome.storage.session.set({
    [STORAGE_KEYS.CAPTURE_ACTIVE_TAB_ID]: tabId,
    [STORAGE_KEYS.TOOLKIT_WINDOW_CAPTURE_STREAM_IDS]: streamIds,
  });
};

const removeTabIdFromToolkitWindowStoreInternal = async (tabId: number): Promise<void> => {
  const stored = await chrome.storage.session.get([
    STORAGE_KEYS.TOOLKIT_WINDOW_TAB_IDS,
    STORAGE_KEYS.CAPTURE_ACTIVE_TAB_ID,
    STORAGE_KEYS.TOOLKIT_WINDOW_CAPTURE_STREAM_IDS,
  ]);
  const tabIds = Array.isArray(stored[STORAGE_KEYS.TOOLKIT_WINDOW_TAB_IDS])
    ? (stored[STORAGE_KEYS.TOOLKIT_WINDOW_TAB_IDS] as number[]).filter(
        (storedTabId) => storedTabId !== tabId,
      )
    : [];
  const streamIds = {
    ...((stored[STORAGE_KEYS.TOOLKIT_WINDOW_CAPTURE_STREAM_IDS] as CaptureStreamIds | undefined) ??
      {}),
  };
  delete streamIds[tabId];
  const storedActiveTabId =
    (stored[STORAGE_KEYS.CAPTURE_ACTIVE_TAB_ID] as number | undefined) ?? null;
  const activeTabId = storedActiveTabId === tabId ? (tabIds[0] ?? null) : storedActiveTabId;

  await chrome.storage.session.set({
    [STORAGE_KEYS.TOOLKIT_WINDOW_TAB_IDS]: tabIds,
    [STORAGE_KEYS.CAPTURE_ACTIVE_TAB_ID]: activeTabId,
    [STORAGE_KEYS.TOOLKIT_WINDOW_CAPTURE_STREAM_IDS]: streamIds,
  });
};

export const getCapturedTabs = async (): Promise<CapturedTabsResult> => {
  const stored = await chrome.storage.session.get([
    STORAGE_KEYS.TOOLKIT_WINDOW_TAB_IDS,
    STORAGE_KEYS.CAPTURE_ACTIVE_TAB_ID,
  ]);
  const tabIds = Array.isArray(stored[STORAGE_KEYS.TOOLKIT_WINDOW_TAB_IDS])
    ? stored[STORAGE_KEYS.TOOLKIT_WINDOW_TAB_IDS]
    : [];
  const activeTabId = (stored[STORAGE_KEYS.CAPTURE_ACTIVE_TAB_ID] as number | undefined) ?? null;
  const tabs: CapturedTab[] = [];
  let activeTabIsMissing = false;

  for (const tabId of tabIds) {
    try {
      const tab = await chrome.tabs.get(tabId);
      tabs.push({
        id: tab.id,
        title: tab.title,
        url: tab.url,
        favIconUrl: tab.favIconUrl,
        active: tab.id === activeTabId,
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes("No tab with id")) {
        await updateCaptureSession(() => removeTabIdFromToolkitWindowStoreInternal(tabId));
        if (tabId === activeTabId) activeTabIsMissing = true;
        continue;
      }
      console.error("Failed to read captured tab", {
        operation: "tabs.get",
        tabId,
        error,
      });
    }
  }

  return {
    tabs,
    activeTabId: activeTabIsMissing ? (tabs[0]?.id ?? null) : activeTabId,
  };
};

const focusToolkitWindow = async (windowId: number | null): Promise<void> => {
  if (windowId == null) return;

  try {
    const window = await chrome.windows.get(windowId);
    const updateInfo: WindowUpdateInfo = { focused: true };
    if (window.state === "minimized") updateInfo.state = "normal";
    await chrome.windows.update(windowId, updateInfo);
  } catch (error) {
    if (error instanceof Error && error.message.includes("No window with id")) {
      await clearToolkitWindowStateInternal();
    }
    throw error;
  }
};

const clearToolkitWindowStateInternal = async (): Promise<void> => {
  await chrome.storage.session.remove([
    STORAGE_KEYS.TOOLKIT_WINDOW_ID,
    STORAGE_KEYS.TOOLKIT_WINDOW_TAB_IDS,
    STORAGE_KEYS.CAPTURE_ACTIVE_TAB_ID,
    STORAGE_KEYS.TOOLKIT_WINDOW_CAPTURE_STREAM_IDS,
  ]);
};

const prepareTabCapture = async (tabId: number | undefined): Promise<void> => {
  if (tabId == null) return;

  await chrome.storage.local.set({
    [STORAGE_KEYS.tabEnabled(tabId)]: false,
  });

  let streamId: string;
  try {
    streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });
  } catch (error) {
    await updateCaptureStreamId(tabId, null);
    await chrome.storage.local.set({
      [STORAGE_KEYS.tabCaptureError(tabId)]:
        error instanceof Error ? error.message : "Tab audio capture failed",
    });
    return;
  }
  await updateCaptureStreamId(tabId, streamId);
};

const createToolkitWindow = async (tabId: number | undefined): Promise<number | undefined> => {
  const window = await chrome.windows.create({
    url: chrome.runtime.getURL("popup.html?mode=window"),
    type: "popup",
    width: 702,
    height: 580,
    focused: true,
  });
  const storageValues: Record<string, unknown> = {
    [STORAGE_KEYS.TOOLKIT_WINDOW_ID]: window!.id,
  };
  if (tabId != null) {
    storageValues[STORAGE_KEYS.TOOLKIT_WINDOW_TAB_IDS] = [tabId];
  }
  await chrome.storage.session.set(storageValues);
  return window!.id;
};

export const addTabIdToToolkitWindowStore = (tabId: number | undefined): Promise<void> =>
  updateCaptureSession(() => addTabIdToToolkitWindowStoreInternal(tabId));

export const removeTabIdFromToolkitWindowStore = (tabId: number): Promise<void> =>
  updateCaptureSession(() => removeTabIdFromToolkitWindowStoreInternal(tabId));

export const clearToolkitWindowState = (): Promise<void> =>
  updateCaptureSession(clearToolkitWindowStateInternal);
