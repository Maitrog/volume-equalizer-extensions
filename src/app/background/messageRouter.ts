import {
  normalizeSpectrumPayload,
  RUNTIME_MESSAGES,
} from "../../infrastructure/chrome/runtimeMessages";
import type {
  CaptureReply,
  RuntimeMessage,
  SpectrumPayload,
} from "../../infrastructure/chrome/runtimeMessages";
import { STORAGE_KEYS } from "../../infrastructure/chrome/storageKeys";
import type { ApplyAutostartOptions } from "./autostartOnTab";
import { isCaptureTabSnapshot, type CapturedTabsResult } from "./captureCoordinator";
import { resolveToolkitShortcutMessage, type ToolkitShortcutMessage } from "./toolkitShortcut";

interface BackgroundRuntimeMessage extends RuntimeMessage {
  target?: string;
  message?: unknown;
  tabId?: number;
}

type RuntimeMessageHandler = (
  message: BackgroundRuntimeMessage,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: unknown) => void,
) => boolean | void;

export interface RuntimeMessageHandlerDependencies {
  acceptSpectrumFrame: (payload: SpectrumPayload, sender: chrome.runtime.MessageSender) => void;
  acceptCaptureFrame?: (tabId: number, payload: SpectrumPayload) => void;
  isLiveCapture?: (tabId: number) => boolean;
  isOffscreenSender?: (sender: chrome.runtime.MessageSender) => boolean;
  applyAutostartForTab: (
    tabId: number | undefined,
    url: string | undefined,
    options?: ApplyAutostartOptions,
  ) => Promise<void> | void;
  applyToolkitShortcut: (shortcut: ToolkitShortcutMessage) => Promise<boolean> | boolean;
  clearUnusedStorage: () => Promise<void> | void;
  getCapturedTabs: () => Promise<CapturedTabsResult>;
  restoreSpectrumDemand: (sender: chrome.runtime.MessageSender) => void;
  toggleWindowMode: (tabId?: number) => Promise<void> | void;
  startCapture: (tabId?: number) => Promise<CaptureReply>;
  stopCapture: (tabId?: number) => Promise<CaptureReply>;
  handleCaptureEnded: (tabId: number, sender: chrome.runtime.MessageSender) => void;
}

const isTabId = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0;

export const createRuntimeMessageHandler = ({
  acceptSpectrumFrame,
  acceptCaptureFrame = () => undefined,
  isLiveCapture = () => false,
  isOffscreenSender = () => false,
  applyAutostartForTab,
  applyToolkitShortcut,
  clearUnusedStorage,
  getCapturedTabs,
  restoreSpectrumDemand,
  toggleWindowMode,
  startCapture,
  stopCapture,
  handleCaptureEnded,
}: RuntimeMessageHandlerDependencies): RuntimeMessageHandler => {
  const updateBadge = (tabId: number, text: string): void => {
    void chrome.action.setBadgeText({ text, tabId }).catch((error: unknown) => {
      console.error("Failed to update tab badge", {
        operation: "setBadgeText",
        tabId,
        error,
      });
    });
  };

  return (request, sender, response) => {
    if (request.method === RUNTIME_MESSAGES.LOG) {
      console.log(request.message);
      return;
    }

    if (request.method === RUNTIME_MESSAGES.ENABLE_WINDOW_MODE) {
      void Promise.resolve(toggleWindowMode(request.tabId))
        .then(() => response({ ok: true }))
        .catch((error: unknown) => {
          response({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          });
        });
      return true;
    }

    if (
      request.method === RUNTIME_MESSAGES.START_TAB_CAPTURE ||
      request.method === RUNTIME_MESSAGES.STOP_TAB_CAPTURE
    ) {
      const capture =
        request.method === RUNTIME_MESSAGES.START_TAB_CAPTURE
          ? startCapture(request.tabId ?? sender.tab?.id)
          : stopCapture(request.tabId ?? sender.tab?.id);
      void Promise.resolve(capture)
        .then(response)
        .catch((error: unknown) => {
          response({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          });
        });
      return true;
    }

    if (request.method === RUNTIME_MESSAGES.CAPTURE_ENDED) {
      if (isTabId(request.tabId)) handleCaptureEnded(request.tabId, sender);
      return;
    }

    if (request.method === RUNTIME_MESSAGES.GET_CAPTURED_TABS) {
      getCapturedTabs()
        .then(response)
        .catch((error: unknown) => {
          console.error("Failed to get captured tabs", {
            operation: "getCapturedTabs",
            error,
          });
          response({ tabs: [], activeTabId: null });
        });
      return true;
    }

    // The offscreen document has no sender.tab, so capture frames carry the tab id
    // explicitly and are accepted only from a verified offscreen sender with a live session.
    if (
      request.method === RUNTIME_MESSAGES.SPECTRUM_FRAME &&
      isOffscreenSender(sender) &&
      isTabId(request.tabId)
    ) {
      const captureTabId = request.tabId;
      const payload = normalizeSpectrumPayload(request.payload);
      if (payload && isLiveCapture(captureTabId)) acceptCaptureFrame(captureTabId, payload);
      return;
    }

    const tabId = sender.tab?.id;
    if (tabId == null) return;

    if (request.method === RUNTIME_MESSAGES.TOOLKIT_SHORTCUT) {
      const shortcut = resolveToolkitShortcutMessage(request, sender);
      if (shortcut) {
        void Promise.resolve(applyToolkitShortcut(shortcut)).catch((error: unknown) => {
          console.error("Failed to apply toolkit shortcut", {
            operation: "applyToolkitShortcut",
            tabId: shortcut.tabId,
            error,
          });
        });
      }
      return;
    }

    if (request.method === RUNTIME_MESSAGES.SPECTRUM_READY && Number.isInteger(sender.frameId)) {
      restoreSpectrumDemand(sender);
      return;
    }

    if (request.method === RUNTIME_MESSAGES.SPECTRUM_FRAME && Number.isInteger(sender.frameId)) {
      acceptSpectrumFrame(request.payload as SpectrumPayload, sender);
      return;
    }

    if (request.method === RUNTIME_MESSAGES.IS_TOOLKIT_CAPTURED) {
      chrome.storage.session.get(
        [STORAGE_KEYS.CAPTURE_TAB_IDS, STORAGE_KEYS.TOOLKIT_WINDOW_TAB_IDS],
        (stored) => {
          const snapshots = Array.isArray(stored[STORAGE_KEYS.CAPTURE_TAB_IDS])
            ? stored[STORAGE_KEYS.CAPTURE_TAB_IDS]
            : [];
          const capturedByCapture = snapshots.some(
            (snapshot: unknown) => isCaptureTabSnapshot(snapshot) && snapshot.tabId === tabId,
          );
          // ponytail: legacy union disappears in task 6 with the old window-mode path.
          const legacyTabIds = Array.isArray(stored[STORAGE_KEYS.TOOLKIT_WINDOW_TAB_IDS])
            ? (stored[STORAGE_KEYS.TOOLKIT_WINDOW_TAB_IDS] as number[])
            : [];
          response(capturedByCapture || legacyTabIds.includes(tabId));
        },
      );
      return true;
    }

    if (request.method === RUNTIME_MESSAGES.GET_TAB_ID) {
      response(tabId);
    } else if (request.method === RUNTIME_MESSAGES.PAGE_STARTED) {
      const applied = applyAutostartForTab(tabId, sender.tab?.url, {
        resetWhenNoMatch: true,
      });
      if (applied) {
        void applied.catch((error: unknown) => {
          console.error("Failed to apply autostart for started page", {
            operation: "applyAutostartForTab",
            tabId,
            error,
          });
        });
      }
    } else if (request.method === RUNTIME_MESSAGES.CONNECTED) {
      updateBadge(tabId, "ON");
    } else if (request.method === RUNTIME_MESSAGES.DISCONNECTED) {
      updateBadge(tabId, "OFF");
    } else if (request.method === RUNTIME_MESSAGES.CLEAR_STORAGE) {
      const cleared = clearUnusedStorage();
      if (cleared) {
        void cleared.catch((error: unknown) => {
          console.error("Failed to clear unused storage", {
            operation: "clearUnusedStorage",
            tabId,
            error,
          });
        });
      }
    }
    return;
  };
};
