import { RUNTIME_MESSAGES } from "../../infrastructure/chrome/runtimeMessages";

export interface CapturedTabInfo {
  id: number;
  title?: string;
  url?: string;
  favIconUrl?: string;
  enabled?: boolean;
}

export interface CapturedTabsResponse {
  tabs: CapturedTabInfo[];
  activeTabId: number | null;
}

const getCapturedTabs = (): Promise<CapturedTabsResponse> => {
  return (
    chrome.runtime.sendMessage({
      method: RUNTIME_MESSAGES.GET_CAPTURED_TABS,
    }) as Promise<CapturedTabsResponse>
  ).catch((error: unknown) => {
    console.error("Failed to get captured tabs", {
      operation: "getCapturedTabs",
      error,
    });
    return { tabs: [], activeTabId: null };
  });
};

export const createCapturedTabsView = (deps: {
  root: HTMLElement;
  getSelectedTabId(): number | null;
  getMessage(messageName: string): string;
  onSelectTab(tabId: number): Promise<void>;
  onStopCapture(tabId: number): Promise<void>;
}) => {
  deps.root.tabIndex = -1;
  const render = async (): Promise<void> => {
    const result = await getCapturedTabs();
    if (!Array.isArray(result.tabs)) {
      console.error("Invalid captured tabs response", result);
      return;
    }

    const selectedTabId = deps.getSelectedTabId();
    const focused =
      document.activeElement instanceof HTMLElement && deps.root.contains(document.activeElement)
        ? document.activeElement
        : null;
    const previousId = focused?.closest<HTMLElement>(".captured-tab")?.dataset.tabId;
    const previousItems = Array.from(deps.root.querySelectorAll<HTMLElement>(".captured-tab"));
    const previousIndex = previousItems.findIndex((item) => item.dataset.tabId === previousId);
    const wasStop = focused?.classList.contains("captured-tab-stop");
    deps.root.replaceChildren();
    result.tabs.forEach((tab) => {
      const item = document.createElement("div");
      item.className = "captured-tab";
      item.classList.toggle("active", tab.id === selectedTabId);
      if (tab.enabled === false) item.classList.add("bypassed");
      item.dataset.tabId = String(tab.id);
      item.title = tab.title || tab.url || String(tab.id);

      const selectButton = document.createElement("button");
      selectButton.type = "button";
      selectButton.className = "captured-tab-select";
      selectButton.setAttribute("aria-pressed", String(tab.id === selectedTabId));
      item.appendChild(selectButton);
      if (tab.favIconUrl) {
        const icon = document.createElement("img");
        icon.className = "captured-tab-icon";
        icon.src = tab.favIconUrl;
        icon.alt = "";
        selectButton.appendChild(icon);
      }

      const title = document.createElement("span");
      title.className = "captured-tab-title";
      title.textContent = tab.title || tab.url || `${deps.getMessage("tab_label")} ${tab.id}`;
      selectButton.appendChild(title);

      const stopButton = document.createElement("button");
      stopButton.type = "button";
      stopButton.className = "captured-tab-stop";
      stopButton.setAttribute(
        "aria-label",
        `${deps.getMessage("stop_capture_label")}: ${title.textContent}`,
      );
      item.appendChild(stopButton);

      deps.root.appendChild(item);
    });
    if (focused) {
      const items = Array.from(deps.root.querySelectorAll<HTMLElement>(".captured-tab"));
      const next =
        items.find((item) => item.dataset.tabId === previousId) ??
        items[Math.min(previousIndex, items.length - 1)];
      (
        next?.querySelector<HTMLElement>(wasStop ? ".captured-tab-stop" : ".captured-tab-select") ??
        deps.root
      ).focus();
    }
  };

  const getTabId = (item: HTMLElement): number | null => {
    const tabId = Number.parseInt(item.dataset.tabId ?? "", 10);
    return Number.isNaN(tabId) ? null : tabId;
  };

  const selectTab = async (item: HTMLElement): Promise<void> => {
    const tabId = getTabId(item);
    if (tabId == null) return;

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
    })().catch((error) => {
      console.error("Failed to update captured tab", {
        operation: "capturedTabsClick",
        error,
      });
    });
  });

  return { render };
};
