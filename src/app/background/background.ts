import { applyAutostartForTab } from "./autostartOnTab";
import { captureCoordinator, hasCaptureRelevantStorageChange } from "./captureCoordinator";
import { createCaptureErrorController } from "./captureErrorController";
import { prepareInstallUpdateNotice } from "./installUpdateNotice";
import { createRuntimeMessageHandler } from "./messageRouter";
import { registerContentScripts } from "./registerContentScripts";
import { createSpectrumRelay } from "./spectrumRelay";
import {
  clearLegacyToolkitWindowState,
  clearTabStorage,
  clearUnusedStorage,
} from "./storageCleanup";
import { createTabMuteToggle } from "./tabMute";
import { setTabBadge } from "./tabBadge";
import { applyToolkitShortcut as runToolkitShortcut } from "./toolkitShortcut";
import {
  isTabId,
  RUNTIME_MESSAGES,
  SPECTRUM_PORT_NAME,
  type CaptureReply,
} from "../../infrastructure/chrome/runtimeMessages";
import { STORAGE_KEYS } from "../../infrastructure/chrome/storageKeys";

void chrome.storage.session.remove("tabs");

chrome.runtime.onStartup.addListener(registerContentScripts);
chrome.runtime.onInstalled.addListener(async (details) => {
  await chrome.runtime.setUninstallURL(
    "https://docs.google.com/forms/d/e/1FAIpQLSfuD6fR4XS3qo6SqfLmagq5z6Daw_o4Z7vwNI4mjcb86sJN5w/viewform",
  );

  await registerContentScripts();
  await prepareInstallUpdateNotice(details);
  await clearLegacyToolkitWindowState();
});

const isOffscreenSender = (sender: chrome.runtime.MessageSender): boolean =>
  sender.id === chrome.runtime.id && sender.url === chrome.runtime.getURL("offscreen.html");

// Spectrum frames arrive every 50 ms, so the live-session check must stay synchronous.
const liveCaptureTabs = new Set<number>();

const refreshLiveCaptureTabs = async (): Promise<void> => {
  const captures = await captureCoordinator.getCaptures();
  liveCaptureTabs.clear();
  for (const capture of captures) liveCaptureTabs.add(capture.tabId);
};

const isLiveCapture = (tabId: number): boolean => liveCaptureTabs.has(tabId);

// Tabs whose badge is owned by the capture lifecycle; page graph events must not override it.
const captureBadgeTabs = new Set<number>();

const isCaptureBadgeTab = (tabId: number): boolean => captureBadgeTabs.has(tabId);

const readSpectrumEnabled = async (): Promise<boolean> => {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.ENABLE_SPECTRUM);
  return stored[STORAGE_KEYS.ENABLE_SPECTRUM] !== false;
};

const applyDemand = async (tabId: number, enabled: boolean, frameId?: number): Promise<void> => {
  await refreshLiveCaptureTabs();
  if (isLiveCapture(tabId)) {
    // Page frames do not own the spectrum demand of a captured tab.
    if (frameId != null) return;
    // An offscreen session is only sampled for spectrum when the user enabled it.
    await chrome.runtime.sendMessage({
      target: "offscreen",
      method: RUNTIME_MESSAGES.CAPTURE_SPECTRUM_DEMAND,
      tabId,
      enabled: enabled && (await readSpectrumEnabled()),
    });
    return;
  }
  const message = {
    method: RUNTIME_MESSAGES.SET_SPECTRUM_DEMAND,
    payload: { enabled },
  };
  await (frameId == null
    ? chrome.tabs.sendMessage(tabId, message)
    : chrome.tabs.sendMessage(tabId, message, { frameId }));
};

// Serialize demand so the setting read and the resulting message stay in order.
let demandQueue: Promise<void> = Promise.resolve();

const spectrumRelay = createSpectrumRelay({
  setDemand: (tabId, enabled, frameId) => {
    demandQueue = demandQueue
      .then(() => applyDemand(tabId, enabled, frameId))
      .catch((error: unknown) => {
        const text = error instanceof Error ? error.message : String(error);
        if (text.includes("Receiving end does not exist") || text.includes("No tab with id")) {
          return;
        }
        console.error("Failed to update spectrum demand", { tabId, frameId, error });
      });
  },
});

const resetSpectrumSources = (tabId: number | undefined): void => {
  if (isTabId(tabId)) spectrumRelay.resetSources(tabId);
};

const reissueCaptureDemand = async (): Promise<void> => {
  const captures = await captureCoordinator.getCaptures();
  for (const capture of captures) spectrumRelay.resetSources(capture.tabId);
};

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === SPECTRUM_PORT_NAME) spectrumRelay.connect(port);
});

const handleCaptureEnded = (tabId: number, sender: chrome.runtime.MessageSender): void => {
  if (!isOffscreenSender(sender)) return;
  captureBadgeTabs.delete(tabId);
  setTabBadge(tabId, false);
  void captureCoordinator
    .handleCaptureEnded(tabId)
    .then(() => resetSpectrumSources(tabId))
    .catch((error: unknown) => {
      console.error("Failed to handle capture end", {
        operation: "handleCaptureEnded",
        tabId,
        error,
      });
    });
};

const startCapture = async (tabId: number | undefined): Promise<CaptureReply> => {
  if (isTabId(tabId)) captureBadgeTabs.add(tabId);
  const reply = await captureCoordinator.startCapture(tabId);
  if (!reply.ok && isTabId(tabId)) {
    captureBadgeTabs.delete(tabId);
  } else if (reply.ok && isTabId(tabId)) {
    setTabBadge(tabId, true);
    resetSpectrumSources(tabId);
  }
  return reply;
};

const stopCapture = async (tabId: number | undefined): Promise<CaptureReply> => {
  const reply = await captureCoordinator.stopCapture(tabId);
  if (reply.ok && isTabId(tabId)) {
    captureBadgeTabs.delete(tabId);
    setTabBadge(tabId, false);
    resetSpectrumSources(tabId);
  }
  return reply;
};

const toggleCaptureEnabled = async (tabId: number | undefined): Promise<void> => {
  const enabled = await captureCoordinator.toggleCaptureEnabled(tabId);
  if (enabled != null && isTabId(tabId)) setTabBadge(tabId, enabled);
};

const toggleTabMute = createTabMuteToggle(chrome.storage.local);

const captureErrors = createCaptureErrorController({ storage: chrome.storage.local });

const runtimeMessageHandler = createRuntimeMessageHandler({
  acceptSpectrumFrame: spectrumRelay.acceptFrame,
  acceptCaptureFrame: spectrumRelay.acceptCaptureFrame,
  isLiveCapture,
  isCaptureBadgeTab,
  isOffscreenSender,
  applyAutostartForTab,
  applyToolkitShortcut: (shortcut) =>
    runToolkitShortcut(shortcut, {
      hasCapture: async (tabId) =>
        (await captureCoordinator.getCaptures()).some((capture) => capture.tabId === tabId),
      toggleMute: toggleTabMute,
      toggleEqualizer: toggleCaptureEnabled,
    }),
  clearUnusedStorage,
  getCapturedTabs: captureCoordinator.getCapturedTabs,
  restoreSpectrumDemand: spectrumRelay.contentReady,
  toggleCaptureEnabled,
  startCapture,
  stopCapture,
  handleCaptureEnded,
  captureErrors,
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;
  if (changes[STORAGE_KEYS.ENABLE_SPECTRUM]) {
    void reissueCaptureDemand().catch((error: unknown) => {
      console.error("Failed to re-evaluate capture spectrum demand", {
        operation: "reissueCaptureDemand",
        error,
      });
    });
  }
  if (!hasCaptureRelevantStorageChange(changes)) return;
  void captureCoordinator.handleStorageChange(changes).catch((error: unknown) => {
    console.error("Failed to apply capture settings change", {
      operation: "handleStorageChange",
      error,
    });
  });
});

chrome.runtime.onMessage.addListener(
  (message, sender, sendResponse) =>
    runtimeMessageHandler(message, sender, sendResponse as (response?: unknown) => void) ??
    undefined,
);

let tabRemovalQueue = Promise.resolve();
const queueTabCleanup = (tabId: number): Promise<void> => {
  spectrumRelay.removeTab(tabId);
  captureBadgeTabs.delete(tabId);
  tabRemovalQueue = tabRemovalQueue
    .then(async () => {
      await captureCoordinator.handleTabRemoved(tabId);
      await clearTabStorage(tabId);
      await captureErrors.clearTabFrames(tabId);
    })
    .catch((error) => {
      console.error("Failed to clean up closed tab state", {
        operation: "cleanupTabState",
        tabId,
        error,
      });
    });
  return tabRemovalQueue;
};

const isMissingTabError = (error: unknown): boolean =>
  error instanceof Error && error.message.includes("No tab with id");

const handleActivatedTab = async (tabId: number): Promise<void> => {
  let tab: chrome.tabs.Tab;
  try {
    tab = await chrome.tabs.get(tabId);
  } catch (error) {
    if (isMissingTabError(error)) {
      await queueTabCleanup(tabId);
      return;
    }
    console.error("Failed to read activated tab", {
      operation: "tabs.get",
      tabId,
      error,
    });
    return;
  }

  try {
    await applyAutostartForTab(tabId, tab.url);
  } catch (error) {
    console.error("Failed to apply autostart for activated tab", {
      operation: "applyAutostartForTab",
      tabId,
      error,
    });
  }
};

chrome.tabs.onActivated.addListener(({ tabId }) => {
  void handleActivatedTab(tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!changeInfo.url) return;
  void applyAutostartForTab(tabId, tab.url).catch((error) => {
    console.error("Failed to apply autostart for updated tab", {
      operation: "applyAutostartForTab",
      tabId,
      error,
    });
  });
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void queueTabCleanup(tabId);
});

chrome.tabCapture.onStatusChanged.addListener(({ tabId, status }) => {
  if (status !== "stopped") return;
  setTabBadge(tabId, false);
  void captureCoordinator
    .handleCaptureEnded(tabId)
    .then(() => resetSpectrumSources(tabId))
    .catch((error: unknown) => {
      console.error("Failed to handle capture end", {
        operation: "handleCaptureEnded",
        tabId,
        error,
      });
    });
});
