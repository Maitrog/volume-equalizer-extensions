import { isEqualizerFilterEnabled } from "../../domains/equalizer/defaultFilters";
import { readPersistedFilters } from "../../domains/equalizer/persistedFilters";
import type {
  CaptureReply,
  CaptureSettings,
  CaptureState,
  OffscreenCommand,
} from "../../infrastructure/chrome/runtimeMessages";
import { RUNTIME_MESSAGES } from "../../infrastructure/chrome/runtimeMessages";
import { STORAGE_KEYS } from "../../infrastructure/chrome/storageKeys";
import { readStoredGain } from "../popup/tabSettingsController";

export interface CapturedTab {
  id: number | undefined;
  title: string | undefined;
  url: string | undefined;
  favIconUrl: string | undefined;
  active: boolean;
}

export interface CapturedTabsResult {
  tabs: CapturedTab[];
  activeTabId: number | null;
}

export interface CaptureTabSnapshot {
  tabId: number;
  previousTabEnabled: boolean;
  status: "starting" | "active";
}

const OFFSCREEN_URL = "offscreen.html";
// chrome-types models offscreen.Reason as a type-only union, so use its literal value.
const OFFSCREEN_USER_MEDIA: chrome.offscreen.Reason = "USER_MEDIA";
const OFFSCREEN_JUSTIFICATION =
  "Process captured tab audio with Web Audio while the popup is closed.";

const isTabId = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0;

const isCaptureSettings = (value: unknown): value is CaptureSettings => {
  if (!value || typeof value !== "object") return false;
  const settings = value as Record<string, unknown>;
  return (
    typeof settings.enabled === "boolean" &&
    typeof settings.gainValue === "number" &&
    Number.isFinite(settings.gainValue) &&
    typeof settings.muted === "boolean" &&
    typeof settings.volumeCompensationEnabled === "boolean" &&
    Array.isArray(settings.filterSettings)
  );
};

const isCaptureState = (value: unknown): value is CaptureState => {
  if (!value || typeof value !== "object") return false;
  const state = value as Record<string, unknown>;
  return isTabId(state.tabId) && isCaptureSettings(state.settings);
};

const isCaptureReply = (value: unknown): value is CaptureReply => {
  if (!value || typeof value !== "object") return false;
  const reply = value as Record<string, unknown>;
  if (reply.ok === true) {
    return Array.isArray(reply.captures) && reply.captures.every(isCaptureState);
  }
  return reply.ok === false && typeof reply.error === "string";
};

const isCaptureTabSnapshot = (value: unknown): value is CaptureTabSnapshot => {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Record<string, unknown>;
  return (
    isTabId(snapshot.tabId) &&
    typeof snapshot.previousTabEnabled === "boolean" &&
    (snapshot.status === "starting" || snapshot.status === "active")
  );
};

export const readCaptureTabSnapshots = async (): Promise<CaptureTabSnapshot[]> => {
  const stored = await chrome.storage.session.get(STORAGE_KEYS.CAPTURE_TAB_IDS);
  const value = stored[STORAGE_KEYS.CAPTURE_TAB_IDS];
  if (!Array.isArray(value)) return [];
  return value.filter(isCaptureTabSnapshot);
};

export const createCaptureCoordinator = () => {
  // ponytail: one coordinator transaction at a time; add per-tab queues only if capture throughput warrants it.
  let queue: Promise<unknown> = Promise.resolve();
  let reconciled = false;

  const runExclusive = <T>(operation: () => Promise<T>): Promise<T> => {
    const result = queue.then(operation);
    queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };

  const writeSnapshots = async (snapshots: CaptureTabSnapshot[]): Promise<void> => {
    await chrome.storage.session.set({ [STORAGE_KEYS.CAPTURE_TAB_IDS]: snapshots });
  };

  const readActiveTabId = async (): Promise<number | null> => {
    const stored = await chrome.storage.session.get(STORAGE_KEYS.CAPTURE_ACTIVE_TAB_ID);
    const value = stored[STORAGE_KEYS.CAPTURE_ACTIVE_TAB_ID];
    return isTabId(value) ? value : null;
  };

  const writeActiveTabId = async (tabId: number | null): Promise<void> => {
    await chrome.storage.session.set({ [STORAGE_KEYS.CAPTURE_ACTIVE_TAB_ID]: tabId });
  };

  const readTabEnabled = async (tabId: number): Promise<boolean> => {
    const stored = await chrome.storage.local.get(STORAGE_KEYS.tabEnabled(tabId));
    return stored[STORAGE_KEYS.tabEnabled(tabId)] === true;
  };

  const restoreTabEnabled = async (tabId: number, previous: boolean): Promise<void> => {
    const stored = await chrome.storage.local.get(STORAGE_KEYS.tabEnabled(tabId));
    // Leave a value the user changed while the start was pending untouched.
    if (stored[STORAGE_KEYS.tabEnabled(tabId)] !== false) return;
    await chrome.storage.local.set({ [STORAGE_KEYS.tabEnabled(tabId)]: previous });
  };

  const hasOffscreenDocument = async (): Promise<boolean> => {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ["OFFSCREEN_DOCUMENT"],
      documentUrls: [chrome.runtime.getURL(OFFSCREEN_URL)],
    });
    return contexts.length > 0;
  };

  const ensureOffscreenDocument = async (): Promise<void> => {
    if (await hasOffscreenDocument()) return;
    try {
      await chrome.offscreen.createDocument({
        url: OFFSCREEN_URL,
        reasons: [OFFSCREEN_USER_MEDIA],
        justification: OFFSCREEN_JUSTIFICATION,
      });
    } catch (error) {
      // Another context may have created the document between the check and the call.
      if (!(await hasOffscreenDocument())) throw error;
    }
  };

  const sendCommand = async (command: OffscreenCommand): Promise<CaptureReply> => {
    const reply: unknown = await chrome.runtime.sendMessage(command);
    return isCaptureReply(reply)
      ? reply
      : { ok: false, error: "Offscreen document did not respond" };
  };

  const requestCaptureList = async (): Promise<CaptureState[]> => {
    const reply = await sendCommand({ target: "offscreen", method: RUNTIME_MESSAGES.CAPTURE_LIST });
    if (!reply.ok) throw new Error(reply.error);
    return reply.captures;
  };

  const clearStaleStateIfNoDocument = async (): Promise<void> => {
    const snapshots = await readCaptureTabSnapshots();
    for (const snapshot of snapshots) {
      if (snapshot.status === "starting") {
        await restoreTabEnabled(snapshot.tabId, snapshot.previousTabEnabled);
      }
    }
    if (snapshots.length > 0) await writeSnapshots([]);
    if ((await readActiveTabId()) != null) await writeActiveTabId(null);
  };

  const readLiveCaptures = async (): Promise<CaptureState[]> => {
    if (!(await hasOffscreenDocument())) {
      await clearStaleStateIfNoDocument();
      return [];
    }
    return requestCaptureList();
  };

  const readSettings = async (tabId: number, enabled: boolean): Promise<CaptureSettings> => {
    const stored = await chrome.storage.local.get([
      STORAGE_KEYS.FILTERS,
      STORAGE_KEYS.tabFilters(tabId),
      STORAGE_KEYS.tabGain(tabId),
      STORAGE_KEYS.tabMute(tabId),
      STORAGE_KEYS.ENABLE_VOLUME_COMPENSATION,
    ]);
    const tabFilters = readPersistedFilters(stored[STORAGE_KEYS.tabFilters(tabId)]);
    const defaultFilters = readPersistedFilters(stored[STORAGE_KEYS.FILTERS]);
    const filterSettings = (
      tabFilters?.length ? tabFilters : defaultFilters?.length ? defaultFilters : []
    ).filter(isEqualizerFilterEnabled);
    return {
      enabled,
      gainValue: readStoredGain(stored[STORAGE_KEYS.tabGain(tabId)]),
      muted: stored[STORAGE_KEYS.tabMute(tabId)] === true,
      volumeCompensationEnabled: stored[STORAGE_KEYS.ENABLE_VOLUME_COMPENSATION] !== false,
      filterSettings,
    };
  };

  const reconcileInternal = async (): Promise<void> => {
    if (!(await hasOffscreenDocument())) {
      await clearStaleStateIfNoDocument();
      return;
    }
    const snapshots = await readCaptureTabSnapshots();
    const captures = await requestCaptureList();
    const liveTabIds = new Set(captures.map((capture) => capture.tabId));
    const nextSnapshots: CaptureTabSnapshot[] = snapshots
      .filter((snapshot) => liveTabIds.has(snapshot.tabId))
      .map((snapshot) => ({ ...snapshot, status: "active" }));
    for (const capture of captures) {
      if (!nextSnapshots.some((snapshot) => snapshot.tabId === capture.tabId)) {
        nextSnapshots.push({ tabId: capture.tabId, previousTabEnabled: false, status: "active" });
      }
    }
    await writeSnapshots(nextSnapshots);
    const activeTabId = await readActiveTabId();
    if (activeTabId == null || !liveTabIds.has(activeTabId)) {
      await writeActiveTabId(nextSnapshots[0]?.tabId ?? null);
    }
  };

  const ensureReconciled = (): Promise<void> => {
    if (reconciled) return Promise.resolve();
    return runExclusive(async () => {
      if (reconciled) return;
      await reconcileInternal();
      reconciled = true;
    });
  };

  const reconcileActiveTabId = async (): Promise<void> => {
    const snapshots = await readCaptureTabSnapshots();
    const activeTabId = await readActiveTabId();
    if (activeTabId != null && snapshots.some((snapshot) => snapshot.tabId === activeTabId)) return;
    await writeActiveTabId(snapshots[0]?.tabId ?? null);
  };

  const removeSnapshot = async (tabId: number): Promise<void> => {
    const snapshots = await readCaptureTabSnapshots();
    if (!snapshots.some((snapshot) => snapshot.tabId === tabId)) return;
    await writeSnapshots(snapshots.filter((snapshot) => snapshot.tabId !== tabId));
  };

  const markSnapshotActive = async (tabId: number): Promise<void> => {
    const snapshots = await readCaptureTabSnapshots();
    let found = false;
    const next = snapshots.map((snapshot) => {
      if (snapshot.tabId !== tabId) return snapshot;
      found = true;
      return { ...snapshot, status: "active" as const };
    });
    if (!found) next.push({ tabId, previousTabEnabled: false, status: "active" });
    await writeSnapshots(next);
  };

  const rollbackStart = async (tabId: number, error: string): Promise<void> => {
    const snapshots = await readCaptureTabSnapshots();
    const snapshot = snapshots.find((candidate) => candidate.tabId === tabId);
    if (snapshot) {
      await writeSnapshots(snapshots.filter((candidate) => candidate.tabId !== tabId));
      if (snapshot.status === "starting") {
        await restoreTabEnabled(tabId, snapshot.previousTabEnabled);
      }
    }
    await chrome.storage.local.set({ [STORAGE_KEYS.tabCaptureError(tabId)]: error });
    await reconcileActiveTabId();
  };

  const closeOffscreenIfIdle = async (): Promise<void> => {
    if (!(await hasOffscreenDocument())) return;
    const captures = await requestCaptureList();
    if (captures.length > 0) return;
    await chrome.offscreen.closeDocument();
  };

  const startCapture = async (tabId: number | undefined): Promise<CaptureReply> => {
    if (!isTabId(tabId)) return { ok: false, error: "Invalid tab id" };
    await ensureReconciled();
    return runExclusive(async () => {
      const existing = await readLiveCaptures();
      if (existing.some((capture) => capture.tabId === tabId)) {
        return { ok: true, captures: existing };
      }

      try {
        await ensureOffscreenDocument();

        const snapshots = await readCaptureTabSnapshots();
        const previousTabEnabled = await readTabEnabled(tabId);
        await writeSnapshots([
          ...snapshots.filter((snapshot) => snapshot.tabId !== tabId),
          { tabId, previousTabEnabled, status: "starting" },
        ]);
        await chrome.storage.local.set({ [STORAGE_KEYS.tabEnabled(tabId)]: false });
        await writeActiveTabId(tabId);

        const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });
        const settings = await readSettings(tabId, true);
        const reply = await sendCommand({
          target: "offscreen",
          method: RUNTIME_MESSAGES.CAPTURE_START,
          tabId,
          streamId,
          settings,
        });
        if (!reply.ok) throw new Error(reply.error);

        await markSnapshotActive(tabId);
        return reply;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        try {
          await rollbackStart(tabId, message);
          await closeOffscreenIfIdle();
        } catch (cleanupError) {
          console.error("Failed to roll back tab capture start", {
            operation: "rollbackStart",
            tabId,
            error: cleanupError,
          });
        }
        return { ok: false, error: message };
      }
    });
  };

  const stopCapture = async (tabId: number | undefined): Promise<CaptureReply> => {
    if (!isTabId(tabId)) return { ok: false, error: "Invalid tab id" };
    await ensureReconciled();
    return runExclusive(async () => {
      try {
        const captures = await readLiveCaptures();
        if (captures.some((capture) => capture.tabId === tabId)) {
          const reply = await sendCommand({
            target: "offscreen",
            method: RUNTIME_MESSAGES.CAPTURE_STOP,
            tabId,
          });
          if (!reply.ok) throw new Error(reply.error);
        }
        await removeSnapshot(tabId);
        await reconcileActiveTabId();
        await closeOffscreenIfIdle();
        return { ok: true, captures: await readLiveCaptures() };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    });
  };

  const getCaptures = async (): Promise<CaptureState[]> => {
    await ensureReconciled();
    return runExclusive(readLiveCaptures);
  };

  const updateCaptureSettings = async (tabId: number | undefined): Promise<void> => {
    if (!isTabId(tabId)) return;
    await ensureReconciled();
    await runExclusive(async () => {
      const captures = await readLiveCaptures();
      const capture = captures.find((candidate) => candidate.tabId === tabId);
      if (!capture) return;
      const settings = await readSettings(tabId, capture.settings.enabled);
      const reply = await sendCommand({
        target: "offscreen",
        method: RUNTIME_MESSAGES.CAPTURE_SETTINGS,
        tabId,
        settings,
      });
      if (!reply.ok) throw new Error(reply.error);
    });
  };

  const handleCaptureEnded = async (tabId: number | undefined): Promise<void> => {
    if (!isTabId(tabId)) return;
    await ensureReconciled();
    await runExclusive(async () => {
      await removeSnapshot(tabId);
      await reconcileActiveTabId();
      await closeOffscreenIfIdle();
    });
  };

  const handleTabRemoved = async (tabId: number | undefined): Promise<void> => {
    if (!isTabId(tabId)) return;
    await ensureReconciled();
    await runExclusive(async () => {
      const captures = await readLiveCaptures();
      if (captures.some((capture) => capture.tabId === tabId)) {
        await sendCommand({ target: "offscreen", method: RUNTIME_MESSAGES.CAPTURE_STOP, tabId });
      }
      await removeSnapshot(tabId);
      await reconcileActiveTabId();
      await closeOffscreenIfIdle();
    });
  };

  const getCapturedTabs = async (): Promise<CapturedTabsResult> => {
    await ensureReconciled();
    const captures = await runExclusive(readLiveCaptures);
    const storedActiveTabId = await readActiveTabId();
    const tabs: CapturedTab[] = [];

    for (const capture of captures) {
      try {
        const tab = await chrome.tabs.get(capture.tabId);
        tabs.push({
          id: tab.id,
          title: tab.title,
          url: tab.url,
          favIconUrl: tab.favIconUrl,
          active: tab.id === storedActiveTabId,
        });
      } catch (error) {
        if (error instanceof Error && error.message.includes("No tab with id")) {
          await handleTabRemoved(capture.tabId);
          continue;
        }
        console.error("Failed to read captured tab", {
          operation: "tabs.get",
          tabId: capture.tabId,
          error,
        });
      }
    }

    const activeTabId = tabs.some((tab) => tab.id === storedActiveTabId)
      ? storedActiveTabId
      : (tabs[0]?.id ?? null);
    return { tabs, activeTabId };
  };

  return {
    startCapture,
    stopCapture,
    getCaptures,
    updateCaptureSettings,
    handleCaptureEnded,
    handleTabRemoved,
    getCapturedTabs,
  };
};

export const captureCoordinator = createCaptureCoordinator();
