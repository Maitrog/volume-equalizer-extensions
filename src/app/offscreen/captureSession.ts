import type { CaptureGraph } from "./captureGraph";

export interface CaptureSessionEntry {
  streamId: string;
  stream: MediaStream;
  graph: CaptureGraph;
}

interface PendingCapture {
  streamId: string;
  generation: number;
  promise: Promise<void>;
}

export const createCaptureSession = (deps: {
  acquireStream(tabId: number, streamId: string): Promise<MediaStream>;
  createGraph(tabId: number, streamId: string, stream: MediaStream): Promise<CaptureGraph>;
}) => {
  const captures = new Map<string, CaptureSessionEntry>();
  const pending = new Map<string, PendingCapture>();
  const generations = new Map<string, number>();
  let stopped = false;

  const stopStream = (stream: MediaStream): void => {
    stream.getTracks().forEach((track) => track.stop());
  };

  const invalidate = (tabId: string): number => {
    const generation = (generations.get(tabId) ?? 0) + 1;
    generations.set(tabId, generation);
    pending.delete(tabId);
    return generation;
  };

  const stopTab = (tabId: number | string): void => {
    const key = String(tabId);
    invalidate(key);
    const capture = captures.get(key);
    if (!capture) return;
    captures.delete(key);
    capture.graph.dispose();
    stopStream(capture.stream);
  };

  const isCurrent = (tabId: string, streamId: string, generation: number): boolean =>
    !stopped && generations.get(tabId) === generation && pending.get(tabId)?.streamId === streamId;

  const ensureCapture = (tabId: string, streamId: string): Promise<void> => {
    const existing = captures.get(tabId);
    if (existing?.streamId === streamId) return Promise.resolve();
    const currentPending = pending.get(tabId);
    if (currentPending?.streamId === streamId) return currentPending.promise;

    stopTab(tabId);
    if (stopped) return Promise.resolve();
    const generation = generations.get(tabId) ?? 0;
    const pendingCapture: PendingCapture = {
      streamId,
      generation,
      promise: Promise.resolve(),
    };
    const promise = (async () => {
      const stream = await deps.acquireStream(Number(tabId), streamId);
      if (!isCurrent(tabId, streamId, generation)) {
        stopStream(stream);
        return;
      }
      let graph: CaptureGraph;
      try {
        graph = await deps.createGraph(Number(tabId), streamId, stream);
      } catch (error) {
        stopStream(stream);
        throw error;
      }
      if (!isCurrent(tabId, streamId, generation)) {
        graph.dispose();
        stopStream(stream);
        return;
      }
      captures.set(tabId, { streamId, stream, graph });
    })().finally(() => {
      if (pending.get(tabId) === pendingCapture) pending.delete(tabId);
    });
    pendingCapture.promise = promise;
    pending.set(tabId, pendingCapture);
    return promise;
  };

  return {
    captures,
    start: (tabId: number, streamId: string): Promise<void> =>
      ensureCapture(String(tabId), streamId),
    sync: async (streamIds: Record<string, string>): Promise<void> => {
      if (stopped) return;
      const desiredTabs = new Set(Object.keys(streamIds));
      [...captures.keys(), ...pending.keys()].forEach((tabId) => {
        if (!desiredTabs.has(tabId)) stopTab(tabId);
      });
      await Promise.all(
        Object.entries(streamIds).map(([tabId, streamId]) => ensureCapture(tabId, streamId)),
      );
    },
    get: (tabId: number | string): CaptureSessionEntry | undefined => captures.get(String(tabId)),
    has: (tabId: number | string): boolean => captures.has(String(tabId)),
    stopTab,
    stop: (): void => {
      if (stopped) return;
      stopped = true;
      const tabIds = new Set([...captures.keys(), ...pending.keys()]);
      tabIds.forEach(stopTab);
      captures.clear();
      pending.clear();
    },
  };
};
