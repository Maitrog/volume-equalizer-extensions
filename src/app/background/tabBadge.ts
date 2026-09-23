export const setTabBadge = (tabId: number, active: boolean): void => {
  void chrome.action
    .setBadgeText({ text: active ? "ON" : "OFF", tabId })
    .catch((error: unknown) => {
      console.error("Failed to update tab badge", {
        operation: "setBadgeText",
        tabId,
        error,
      });
    });
};
