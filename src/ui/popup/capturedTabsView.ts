import { STORAGE_KEYS } from "../../infrastructure/chrome/storageKeys";

export interface CapturedTabInfo {
  id: number;
  title?: string;
  url?: string;
  favIconUrl?: string;
}

export interface CapturedTabsResponse {
  tabs: CapturedTabInfo[];
  activeTabId: number | null;
}

export interface CapturedTabsView {
  render(): Promise<void>;
}

const getCapturedTabs = (): Promise<CapturedTabsResponse> => {
  return (chrome.runtime.sendMessage({
    method: "getCapturedTabs",
  }) as Promise<CapturedTabsResponse>).catch((error: unknown) => {
    console.error(error);
    return { tabs: [], activeTabId: null };
  });
};

export const createCapturedTabsView = (deps: {
  root: HTMLElement;
  isToolkitWindow: boolean;
  onSelectTab(tabId: number): Promise<void>;
  onStopCapture(tabId: number): Promise<void>;
}): CapturedTabsView => {
  const render = async (): Promise<void> => {
    if (!deps.isToolkitWindow) return;

    const result = await getCapturedTabs();
    if (!Array.isArray(result.tabs)) {
      console.error("Invalid toolkit tabs response", result);
      return;
    }

    deps.root.replaceChildren();
    result.tabs.forEach((tab) => {
      const item = document.createElement("div");
      item.className = "captured-tab";
      item.role = "button";
      item.tabIndex = 0;
      if (tab.id === result.activeTabId) item.classList.add("active");
      item.dataset.tabId = String(tab.id);
      item.title = tab.title || tab.url || String(tab.id);

      if (tab.favIconUrl) {
        const icon = document.createElement("img");
        icon.className = "captured-tab-icon";
        icon.src = tab.favIconUrl;
        icon.alt = "";
        item.appendChild(icon);
      }

      const title = document.createElement("span");
      title.className = "captured-tab-title";
      title.textContent = tab.title || tab.url || `Tab ${tab.id}`;
      item.appendChild(title);

      const stopButton = document.createElement("button");
      stopButton.type = "button";
      stopButton.className = "captured-tab-stop";
      item.appendChild(stopButton);

      deps.root.appendChild(item);
    });
  };

  const getTabId = (item: HTMLElement): number | null => {
    const tabId = Number.parseInt(item.dataset.tabId ?? "", 10);
    return Number.isNaN(tabId) ? null : tabId;
  };

  const selectTab = async (item: HTMLElement): Promise<void> => {
    const tabId = getTabId(item);
    if (tabId == null) return;

    await chrome.storage.session.set({
      [STORAGE_KEYS.TOOLKIT_WINDOW_ACTIVE_TAB_ID]: tabId,
    });
    await deps.onSelectTab(tabId);
    await render();
  };

  const stopCapture = async (item: HTMLElement): Promise<void> => {
    const tabId = getTabId(item);
    if (tabId == null) return;

    await deps.onStopCapture(tabId);
    await render();
  };

  deps.root.addEventListener("click", (event) => {
    void (async () => {
      if (!(event.target instanceof Element)) return;

      const item = event.target.closest<HTMLElement>(".captured-tab");
      if (!item) return;

      if (event.target.closest(".captured-tab-stop")) {
        await stopCapture(item);
        return;
      }

      await selectTab(item);
    })();
  });

  deps.root.addEventListener("keydown", (event) => {
    void (async () => {
      if (!(event.target instanceof HTMLElement)) return;
      if (event.target.closest(".captured-tab-stop")) return;
      if (event.key !== "Enter" && event.key !== " ") return;

      const item = event.target.closest<HTMLElement>(".captured-tab");
      if (!item) return;

      event.preventDefault();
      await selectTab(item);
    })();
  });

  return { render };
};
