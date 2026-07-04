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
      const item = document.createElement("button");
      item.type = "button";
      item.className = "captured-tab";
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

      deps.root.appendChild(item);
    });
  };

  deps.root.addEventListener("click", (event) => {
    void (async () => {
      if (!(event.target instanceof Element)) return;

      const item = event.target.closest<HTMLElement>(".captured-tab");
      if (!item) return;

      const tabId = Number.parseInt(item.dataset.tabId ?? "", 10);
      if (Number.isNaN(tabId)) return;

      await chrome.storage.session.set({
        [STORAGE_KEYS.TOOLKIT_WINDOW_ACTIVE_TAB_ID]: tabId,
      });
      await deps.onSelectTab(tabId);
      await render();
    })();
  });

  return { render };
};
