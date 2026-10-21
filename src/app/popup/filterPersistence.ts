import type { EqualizerFilter } from "../../domains/equalizer/types";

const SAVE_DELAY_MS = 100;

export const createFilterPersistence = (
  write: (tabId: number, filters: EqualizerFilter[]) => Promise<void>,
) => {
  const pending = new Map<number, EqualizerFilter[]>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let draining: Promise<void> | null = null;
  let writingTabId: number | null = null;
  let disposed = false;

  const drain = (): Promise<void> => {
    if (draining) return draining;
    draining = (async () => {
      while (pending.size > 0) {
        const [tabId, filters] = pending.entries().next().value as [number, EqualizerFilter[]];
        pending.delete(tabId);
        writingTabId = tabId;
        try {
          await write(tabId, filters);
        } finally {
          writingTabId = null;
        }
      }
    })().finally(() => {
      draining = null;
    });
    return draining;
  };

  const flush = (): Promise<void> => {
    if (timer) clearTimeout(timer);
    timer = null;
    return drain();
  };

  return {
    hasPendingChanges: (tabId: number): boolean => pending.has(tabId) || writingTabId === tabId,
    schedule: (tabId: number, filters: EqualizerFilter[]): void => {
      if (disposed) return;
      pending.set(
        tabId,
        filters.map((filter) => ({ ...filter })),
      );
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void flush();
      }, SAVE_DELAY_MS);
    },
    flush,
    dispose: async (): Promise<void> => {
      disposed = true;
      await flush();
    },
  };
};
