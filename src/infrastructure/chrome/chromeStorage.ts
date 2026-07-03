export interface ChromeStorageArea {
  get(
    keys?: string | string[] | Record<string, unknown> | null,
  ): Promise<Record<string, unknown>>;
  set(values: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
}

const createChromeStorageArea = (
  area: chrome.storage.StorageArea,
): ChromeStorageArea => ({
  get: (keys) => area.get(keys ?? undefined) as Promise<Record<string, unknown>>,
  set: (values) => area.set(values),
  remove: (keys) => area.remove(keys),
});

export const localStorageArea = createChromeStorageArea(chrome.storage.local);
export const sessionStorageArea = createChromeStorageArea(chrome.storage.session);
