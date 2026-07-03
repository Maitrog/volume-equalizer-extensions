import { RUNTIME_MESSAGES } from "../../infrastructure/chrome/runtimeMessages";
import type { RuntimeMessage } from "../../infrastructure/chrome/runtimeMessages";
import type { RuntimeMessageHandler } from "../../infrastructure/chrome/runtimeMessaging";
import { STORAGE_KEYS } from "../../infrastructure/chrome/storageKeys";
import type { ApplyAutostartOptions } from "./autostartOnTab";
import type { CapturedTabsResult } from "./windowModeCoordinator";

interface BackgroundRuntimeMessage extends RuntimeMessage {
  message?: unknown;
  tabId?: number;
}

export interface RuntimeMessageHandlerDependencies {
  applyAutostartForTab: (
    tabId: number | undefined,
    url: string | undefined,
    options?: ApplyAutostartOptions
  ) => Promise<void> | void;
  clearUnusedStorage: () => Promise<void> | void;
  getCapturedTabs: () => Promise<CapturedTabsResult>;
  toggleWindowMode: (tabId?: number) => Promise<void> | void;
}

export const createRuntimeMessageHandler = ({
  applyAutostartForTab,
  clearUnusedStorage,
  getCapturedTabs,
  toggleWindowMode,
}: RuntimeMessageHandlerDependencies): RuntimeMessageHandler<BackgroundRuntimeMessage> => {
  return (request, sender, response) => {
    if (request.method === RUNTIME_MESSAGES.LOG) {
      console.log(request.message);
      return;
    }

    if (request.method === RUNTIME_MESSAGES.ENABLE_WINDOW_MODE) {
      toggleWindowMode(request.tabId);
      return;
    }

    if (request.method === RUNTIME_MESSAGES.GET_CAPTURED_TABS) {
      getCapturedTabs()
        .then(response)
        .catch(() => {
          response({ tabs: [], activeTabId: null });
        });
      return true;
    }

    const tabId = sender.tab?.id;
    if (tabId == null) return;

    if (request.method === RUNTIME_MESSAGES.SPECTRUM_FRAME) {
      chrome.storage.local.set({
        [STORAGE_KEYS.tabSpectrum(tabId)]: request.payload,
      });
    } else if (request.method === RUNTIME_MESSAGES.GET_TAB_ID) {
      chrome.storage.session.get([STORAGE_KEYS.REGISTERED_TAB_IDS], (prefs) => {
        const tabs = Array.isArray(prefs?.[STORAGE_KEYS.REGISTERED_TAB_IDS])
          ? prefs[STORAGE_KEYS.REGISTERED_TAB_IDS]
          : [];
        if (!tabs.includes(tabId)) {
          tabs.push(tabId);
          chrome.storage.session.set({
            [STORAGE_KEYS.REGISTERED_TAB_IDS]: tabs,
          });
        }
      });
      response(tabId);
    } else if (request.method === RUNTIME_MESSAGES.PAGE_STARTED) {
      applyAutostartForTab(tabId, sender.tab?.url, { resetWhenNoMatch: true });
    } else if (request.method === RUNTIME_MESSAGES.CONNECTED) {
      chrome.action.setBadgeText({
        text: "ON",
        tabId,
      });
    } else if (request.method === RUNTIME_MESSAGES.DISCONNECTED) {
      chrome.action.setBadgeText({
        text: "OFF",
        tabId,
      });
    } else if (request.method === RUNTIME_MESSAGES.CLEAR_STORAGE) {
      clearUnusedStorage();
    }
    return;
  };
};
