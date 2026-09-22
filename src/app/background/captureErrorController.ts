import { STORAGE_KEYS } from "../../infrastructure/chrome/storageKeys";

export const createCaptureErrorController = (deps: {
  storage: Pick<chrome.storage.StorageArea, "set" | "remove">;
}) => {
  const connectedFrames = new Map<number, Set<number>>();
  let queue = Promise.resolve();

  const enqueue = (operation: () => Promise<void>): Promise<void> => {
    const tracked = queue.then(operation);
    queue = tracked.then(
      () => undefined,
      () => undefined,
    );
    return tracked;
  };

  return {
    trackFrameConnected: (tabId: number, frameId: number): Promise<void> =>
      enqueue(async () => {
        const frames = connectedFrames.get(tabId) ?? new Set<number>();
        frames.add(frameId);
        connectedFrames.set(tabId, frames);
        await deps.storage.remove(STORAGE_KEYS.tabCaptureError(tabId));
      }),

    trackFrameDisconnected: (tabId: number, frameId: number): Promise<void> =>
      enqueue(async () => {
        connectedFrames.get(tabId)?.delete(frameId);
      }),

    reportError: (tabId: number, message: string): Promise<void> =>
      enqueue(async () => {
        if (connectedFrames.get(tabId)?.size) return;
        await deps.storage.set({ [STORAGE_KEYS.tabCaptureError(tabId)]: message });
      }),

    clearTabFrames: (tabId: number): Promise<void> =>
      enqueue(async () => {
        connectedFrames.delete(tabId);
      }),
  };
};

export type CaptureErrorController = ReturnType<typeof createCaptureErrorController>;
