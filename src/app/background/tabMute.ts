import { STORAGE_KEYS } from "../../infrastructure/chrome/storageKeys";

export const createTabMuteToggle = (
  storage: Pick<chrome.storage.StorageArea, "get" | "set">,
): ((tabId: number) => Promise<void>) => {
  // Serialize read-modify-write so two shortcuts in a row produce two flips.
  let queue = Promise.resolve();

  return (tabId: number): Promise<void> => {
    const operation = queue.then(async () => {
      const key = STORAGE_KEYS.tabMute(tabId);
      const stored = await storage.get(key);
      await storage.set({ [key]: !stored[key] });
    });
    queue = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  };
};
