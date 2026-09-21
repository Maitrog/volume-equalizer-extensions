import type {
  RelayedSpectrumMessage,
  SpectrumMetaPayload,
  SpectrumPayload,
  SpectrumSource,
  SpectrumSubscribeMessage,
} from "../../infrastructure/chrome/runtimeMessages";

interface SpectrumRelayDependencies {
  setDemand(tabId: number, enabled: boolean, frameId?: number): void;
}

const CAPTURE_SOURCE_KEY = "capture";
const CONTENT_SOURCE_PREFIX = "content:";

const contentSourceKey = (frameId: number): string => `${CONTENT_SOURCE_PREFIX}${frameId}`;

const toSource = (key: string): SpectrumSource =>
  key === CAPTURE_SOURCE_KEY
    ? { kind: "capture" }
    : { kind: "content", frameId: Number(key.slice(CONTENT_SOURCE_PREFIX.length)) };

const getContentSource = (
  sender: chrome.runtime.MessageSender,
): { tabId: number; frameId: number } | null => {
  const tabId = sender.tab?.id;
  const frameId = sender.frameId;
  return Number.isInteger(tabId) && Number.isInteger(frameId)
    ? { tabId: tabId as number, frameId: frameId as number }
    : null;
};

const isSubscription = (message: unknown): message is SpectrumSubscribeMessage => {
  if (!message || typeof message !== "object") return false;
  const candidate = message as Partial<SpectrumSubscribeMessage>;
  return (
    candidate.type === "subscribe" &&
    Number.isInteger(candidate.tabId) &&
    (candidate.tabId as number) >= 0
  );
};

export const createSpectrumRelay = ({ setDemand }: SpectrumRelayDependencies) => {
  const subscriptions = new Map<chrome.runtime.Port, number>();
  const subscribers = new Map<number, Set<chrome.runtime.Port>>();
  const metadata = new Map<number, Map<string, SpectrumMetaPayload>>();
  const activeSources = new Map<number, string>();
  const quiescedSources = new Set<string>();

  const sourceKey = (tabId: number, key: string): string => `${tabId}:${key}`;

  const post = (
    port: chrome.runtime.Port,
    tabId: number,
    key: string,
    payload: SpectrumPayload,
  ): void => {
    const message: RelayedSpectrumMessage = { tabId, source: toSource(key), payload };
    port.postMessage(message);
  };

  const broadcast = (tabId: number, key: string, payload: SpectrumPayload): void => {
    subscribers.get(tabId)?.forEach((port) => post(port, tabId, key, payload));
  };

  const postActiveMeta = (port: chrome.runtime.Port, tabId: number): void => {
    const key = activeSources.get(tabId);
    if (key == null) return;
    const meta = metadata.get(tabId)?.get(key);
    if (meta) post(port, tabId, key, meta);
  };

  const clearSources = (tabId: number): void => {
    metadata.delete(tabId);
    activeSources.delete(tabId);
    for (const key of quiescedSources) {
      if (key.startsWith(`${tabId}:`)) quiescedSources.delete(key);
    }
  };

  const clearContentSources = (tabId: number): void => {
    const bySource = metadata.get(tabId);
    if (bySource) {
      for (const key of bySource.keys()) {
        if (key !== CAPTURE_SOURCE_KEY) bySource.delete(key);
      }
    }
    const active = activeSources.get(tabId);
    if (active != null && active !== CAPTURE_SOURCE_KEY) activeSources.delete(tabId);
  };

  const unsubscribe = (port: chrome.runtime.Port, options: { notify?: boolean } = {}): void => {
    const tabId = subscriptions.get(port);
    if (tabId == null) return;
    subscriptions.delete(port);
    const ports = subscribers.get(tabId);
    ports?.delete(port);
    if (ports?.size) return;
    subscribers.delete(tabId);
    clearSources(tabId);
    if (options.notify !== false) setDemand(tabId, false);
  };

  const subscribe = (port: chrome.runtime.Port, tabId: number): void => {
    if (subscriptions.get(port) === tabId) {
      postActiveMeta(port, tabId);
      return;
    }

    unsubscribe(port);
    subscriptions.set(port, tabId);
    const ports = subscribers.get(tabId) ?? new Set<chrome.runtime.Port>();
    const firstSubscriber = ports.size === 0;
    ports.add(port);
    subscribers.set(tabId, ports);
    if (firstSubscriber) {
      clearSources(tabId);
      setDemand(tabId, true);
    }
    postActiveMeta(port, tabId);
  };

  const quiesceOrphan = (tabId: number, frameId: number): void => {
    const key = contentSourceKey(frameId);
    const scopedKey = sourceKey(tabId, key);
    if (quiescedSources.has(scopedKey)) return;
    quiescedSources.add(scopedKey);
    setDemand(tabId, false, frameId);
  };

  return {
    connect: (port: chrome.runtime.Port): void => {
      port.onMessage.addListener((message: unknown) => {
        if (isSubscription(message)) subscribe(port, message.tabId);
      });
      port.onDisconnect.addListener(() => unsubscribe(port));
    },

    contentReady: (sender: chrome.runtime.MessageSender): void => {
      const source = getContentSource(sender);
      if (!source) return;
      const { tabId, frameId } = source;
      const key = contentSourceKey(frameId);
      metadata.get(tabId)?.delete(key);
      if (activeSources.get(tabId) === key) {
        broadcast(tabId, key, {
          type: "spectrum",
          buffer: null,
          clipping: false,
        });
        activeSources.delete(tabId);
      }
      const demanded = subscribers.has(tabId);
      if (demanded) quiescedSources.delete(sourceKey(tabId, key));
      else quiescedSources.add(sourceKey(tabId, key));
      setDemand(tabId, demanded, frameId);
    },

    acceptFrame: (payload: SpectrumPayload, sender: chrome.runtime.MessageSender): void => {
      const source = getContentSource(sender);
      if (!source) return;
      const { tabId, frameId } = source;
      const key = contentSourceKey(frameId);
      if (!subscribers.has(tabId)) {
        if (payload.type === "meta" || payload.buffer !== null) {
          quiesceOrphan(tabId, frameId);
        }
        return;
      }

      quiescedSources.delete(sourceKey(tabId, key));
      if (payload.type === "meta") {
        const bySource = metadata.get(tabId) ?? new Map<string, SpectrumMetaPayload>();
        bySource.set(key, payload);
        metadata.set(tabId, bySource);
        const activeKey = activeSources.get(tabId);
        if (activeKey == null) activeSources.set(tabId, key);
        if (activeKey == null || activeKey === key) {
          broadcast(tabId, key, payload);
        }
        return;
      }

      const activeKey = activeSources.get(tabId);
      if (payload.buffer === null) {
        metadata.get(tabId)?.delete(key);
        if (activeKey === key) {
          broadcast(tabId, key, payload);
          activeSources.delete(tabId);
        }
        return;
      }

      if (activeKey === key) {
        broadcast(tabId, key, payload);
        return;
      }
      const meta = metadata.get(tabId)?.get(key);
      if (activeKey == null && meta) {
        activeSources.set(tabId, key);
        broadcast(tabId, key, meta);
        broadcast(tabId, key, payload);
      }
    },

    acceptCaptureFrame: (tabId: number, payload: SpectrumPayload): void => {
      if (!subscribers.has(tabId)) return;
      const key = CAPTURE_SOURCE_KEY;
      quiescedSources.delete(sourceKey(tabId, key));

      if (payload.type === "meta") {
        // Capture takes over from whatever content frame was active.
        clearContentSources(tabId);
        const bySource = metadata.get(tabId) ?? new Map<string, SpectrumMetaPayload>();
        bySource.set(key, payload);
        metadata.set(tabId, bySource);
        activeSources.set(tabId, key);
        broadcast(tabId, key, payload);
        return;
      }

      const activeKey = activeSources.get(tabId);
      if (payload.buffer === null) {
        metadata.get(tabId)?.delete(key);
        if (activeKey === key) {
          broadcast(tabId, key, payload);
          activeSources.delete(tabId);
        }
        return;
      }

      if (activeKey === key) broadcast(tabId, key, payload);
    },

    resetSources: (tabId: number): void => {
      const activeKey = activeSources.get(tabId);
      if (activeKey != null) {
        broadcast(tabId, activeKey, { type: "spectrum", buffer: null, clipping: false });
      }
      clearSources(tabId);
      // Keep the subscriber attached but re-issue demand so the new route starts sampling.
      if (subscribers.has(tabId)) setDemand(tabId, true);
    },

    removeTab: (tabId: number): void => {
      subscribers.get(tabId)?.forEach((port) => subscriptions.delete(port));
      subscribers.delete(tabId);
      clearSources(tabId);
    },
  };
};
