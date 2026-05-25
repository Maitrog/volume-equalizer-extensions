async function renderCapturedTabs() {
  if (!isToolkitWindow || !capturedTabsElem) return;

  const result = await getCapturedTabs();
  if (result?.tabs == null || !Array.isArray(result.tabs)) {
    console.error("Invalid toolkit tabs response", result);
    return;
  }

  const tabs = result.tabs;
  const activeTabId = result?.activeTabId ?? null;
  capturedTabsElem.replaceChildren();

  tabs.forEach((tab) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "captured-tab";
    if (tab.id === activeTabId) item.classList.add("active");
    item.dataset.tabId = tab.id;
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

    capturedTabsElem.appendChild(item);
  });
}

function getCapturedTabs() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ method: "getCapturedTabs" }, (result) => {
      if (chrome.runtime.lastError) {
        console.error(chrome.runtime.lastError.message);
        resolve({ tabs: [], activeTabId: null });
        return;
      }
      resolve(result ?? { tabs: [], activeTabId: null });
    });
  });
}

if (capturedTabsElem) {
  capturedTabsElem.addEventListener("click", async (event) => {
    const item = event.target.closest(".captured-tab");
    if (!item) return;

    const tabId = Number.parseInt(item.dataset.tabId, 10);
    if (Number.isNaN(tabId)) return;

    await chrome.storage.session.set({
      [TOOLKIT_WINDOW_ACTIVE_TAB_KEY]: tabId,
    });
    await loadToolkitTabSettings(tabId);
    await renderCapturedTabs();
  });
}
