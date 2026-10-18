import { afterEach, describe, expect, test, vi } from "vitest";

import { STORAGE_KEYS } from "../../infrastructure/chrome/storageKeys";
import { createSettingsActions } from "../../app/popup/settingsActions";
import type { ResolvedSettings } from "../../domains/settings/settingsTransfer";
import { createSettingsView } from "./settingsView";

class FakeElement extends EventTarget {
  style = { display: "" };
  value = "";
  checked = false;
  classList = {
    add: vi.fn(),
    remove: vi.fn(),
    toggle: vi.fn(),
  };
  click = vi.fn();
  focus = vi.fn();
  setAttribute = vi.fn();
  querySelectorAll = () => [];
}

const setup = () => {
  const storage = {
    get: vi.fn(async () => ({
      presets: {} as Record<string, unknown>,
      presetNames: [] as string[],
    })),
    set: vi.fn(async (): Promise<void> => undefined),
  };
  const refreshDynamicContent = vi.fn(async (): Promise<void> => undefined);
  const enableVolumeCompensation = new FakeElement();
  const themeSelect = new FakeElement();
  const pointsCount = new FakeElement();
  const pointsResetConfirm = new FakeElement();
  const skipResetConfirm = new FakeElement();
  const enableSpectrum = new FakeElement();
  const hideDefaultPresets = new FakeElement();
  const languageSelect = new FakeElement();
  const initPoints = vi.fn();
  const saveCurrentFilters = vi.fn(async (): Promise<void> => undefined);
  const localization = {
    getMessage: (name: string) => name,
    setLanguage: vi.fn(async (): Promise<void> => undefined),
    applySavedLanguage: vi.fn(async () => true),
    waitForPendingChanges: vi.fn(async (): Promise<void> => undefined),
  };

  vi.stubGlobal("window", new EventTarget());
  vi.stubGlobal("HTMLElement", FakeElement);
  vi.stubGlobal(
    "document",
    Object.assign(new EventTarget(), {
      documentElement: { dataset: {} },
      body: new FakeElement(),
    }),
  );
  vi.stubGlobal("chrome", { storage: { local: storage } });
  const settingsActions = createSettingsActions();

  const settingsView = createSettingsView({
    settingsModal: new FakeElement() as unknown as HTMLElement,
    settingsButton: new FakeElement() as unknown as HTMLElement,
    closeSettingsButton: new FakeElement() as unknown as HTMLElement,
    themeSelect: themeSelect as unknown as HTMLSelectElement,
    pointsCount: pointsCount as unknown as HTMLSelectElement,
    pointsResetModal: new FakeElement() as unknown as HTMLElement,
    pointsResetConfirm: pointsResetConfirm as unknown as HTMLButtonElement,
    pointsResetCancel: new FakeElement() as unknown as HTMLButtonElement,
    skipResetConfirm: skipResetConfirm as unknown as HTMLInputElement,
    enableSpectrum: enableSpectrum as unknown as HTMLInputElement,
    enableVolumeCompensation: enableVolumeCompensation as unknown as HTMLInputElement,
    hideDefaultPresets: hideDefaultPresets as unknown as HTMLInputElement,
    languageSelect: languageSelect as unknown as HTMLSelectElement,
    shortcutMute: new FakeElement() as unknown as HTMLInputElement,
    shortcutToggleEq: new FakeElement() as unknown as HTMLInputElement,
    shortcutsError: new FakeElement() as unknown as HTMLElement,
    localization,
    loadSettings: settingsActions.load,
    loadPointCount: settingsActions.loadPointCount,
    shouldSkipPointCountConfirmation: settingsActions.shouldSkipPointCountConfirmation,
    saveTheme: settingsActions.saveTheme,
    saveShortcuts: settingsActions.saveShortcuts,
    savePointCount: settingsActions.savePointCount,
    saveSkipPointCountConfirmation: settingsActions.saveSkipPointCountConfirmation,
    saveSpectrumEnabled: settingsActions.saveSpectrumEnabled,
    saveVolumeCompensationEnabled: settingsActions.saveVolumeCompensationEnabled,
    saveHideDefaultPresets: settingsActions.saveHideDefaultPresets,
    initPoints,
    redraw: vi.fn(),
    saveCurrentFilters,
    refreshDynamicContent,
  });

  return {
    themeSelect,
    pointsCount,
    pointsResetConfirm,
    skipResetConfirm,
    enableSpectrum,
    hideDefaultPresets,
    languageSelect,
    initPoints,
    saveCurrentFilters,
    localization,
    enableVolumeCompensation,
    refreshDynamicContent,
    settingsView,
    storage,
  };
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("volume compensation setting", () => {
  test("starts disabled and persists checkbox changes", async () => {
    const { enableVolumeCompensation, settingsView, storage } = setup();

    await settingsView.init();
    expect(enableVolumeCompensation.checked).toBe(false);

    enableVolumeCompensation.checked = true;
    enableVolumeCompensation.dispatchEvent(new Event("change"));

    await vi.waitFor(() =>
      expect(storage.set).toHaveBeenCalledWith({
        [STORAGE_KEYS.ENABLE_VOLUME_COMPENSATION]: true,
      }),
    );
  });
});

const savedSettings: ResolvedSettings = {
  general: {
    theme: "light",
    uiLanguage: "ru",
    pointCount: 7,
    enableSpectrum: false,
    enableVolumeCompensation: true,
    skipPointsResetConfirm: true,
  },
  shortcuts: { mute: null, toggleEq: null },
  autostartRules: [],
  presets: { presets: {}, presetNames: [], hideDefaultPresets: true },
};

test("waits for the whole point count operation", async () => {
  const { settingsView, storage, initPoints, saveCurrentFilters } = setup();
  let finishCountSave!: () => void;
  let finishCurveSave!: () => void;
  storage.set.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finishCountSave = resolve;
      }),
  );
  saveCurrentFilters.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finishCurveSave = resolve;
      }),
  );
  const change = settingsView.setPointCount(7);
  const finished = vi.fn();
  const wait = settingsView.waitForPendingChanges().then(finished);
  await Promise.resolve();
  expect(finished).not.toHaveBeenCalled();
  expect(initPoints).not.toHaveBeenCalled();
  finishCountSave();
  await vi.waitFor(() => expect(saveCurrentFilters).toHaveBeenCalledOnce());
  expect(initPoints).toHaveBeenCalledWith(7);
  expect(finished).not.toHaveBeenCalled();
  finishCurveSave();
  await Promise.all([change, wait]);
  expect(finished).toHaveBeenCalledOnce();
});

test("waits for point count checks before a later save", async () => {
  const { settingsView, storage, pointsCount, saveCurrentFilters } = setup();
  let finishCheck!: (stored: {
    presets: Record<string, unknown>;
    presetNames: string[];
    skipPointsResetConfirm: boolean;
  }) => void;
  storage.get.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishCheck = resolve;
      }),
  );
  pointsCount.value = "7";
  pointsCount.dispatchEvent(new Event("change"));
  const finished = vi.fn();
  const wait = settingsView.waitForPendingChanges().then(finished);
  await Promise.resolve();
  expect(finished).not.toHaveBeenCalled();
  finishCheck({ presets: {}, presetNames: [], skipPointsResetConfirm: true });
  await wait;
  expect(saveCurrentFilters).toHaveBeenCalledOnce();
  expect(storage.set).toHaveBeenCalledWith({ pointCount: 7 });
});

test("applies settings without writes or curve reset", async () => {
  const {
    settingsView,
    storage,
    initPoints,
    saveCurrentFilters,
    themeSelect,
    pointsCount,
    skipResetConfirm,
    enableSpectrum,
    enableVolumeCompensation,
    hideDefaultPresets,
    localization,
  } = setup();
  await settingsView.applySavedSettings(savedSettings);
  expect(storage.set).not.toHaveBeenCalled();
  expect(initPoints).not.toHaveBeenCalled();
  expect(saveCurrentFilters).not.toHaveBeenCalled();
  expect(themeSelect.value).toBe("light");
  expect(pointsCount.value).toBe("7");
  expect(skipResetConfirm.checked).toBe(true);
  expect(enableSpectrum.checked).toBe(false);
  expect(enableVolumeCompensation.checked).toBe(true);
  expect(hideDefaultPresets.checked).toBe(true);
  expect(localization.applySavedLanguage).toHaveBeenCalledWith("ru");
  expect(settingsView.getShortcutSettings()).toEqual({ mute: null, toggleEq: null });
});

test("saved settings report locale apply failure without another write", async () => {
  const { settingsView, storage, localization } = setup();
  localization.applySavedLanguage.mockResolvedValueOnce(false);
  await expect(settingsView.applySavedSettings(savedSettings)).rejects.toThrow();
  expect(storage.set).not.toHaveBeenCalled();
});

test("waiting rejects a current save failure but a later wait can proceed", async () => {
  const { settingsView, storage, enableVolumeCompensation } = setup();
  vi.spyOn(console, "error").mockImplementation(() => {});
  let failSave!: (error: Error) => void;
  storage.set.mockImplementationOnce(
    () =>
      new Promise<void>((_resolve, reject) => {
        failSave = reject;
      }),
  );
  enableVolumeCompensation.checked = true;
  enableVolumeCompensation.dispatchEvent(new Event("change"));
  const waiting = expect(settingsView.waitForPendingChanges()).rejects.toThrow("write failed");
  failSave(new Error("write failed"));
  await waiting;
  expect(enableVolumeCompensation.checked).toBe(false);
  await expect(settingsView.waitForPendingChanges()).resolves.toBeUndefined();
});

test("preset visibility refresh can wait for pending saves", async () => {
  const { settingsView, hideDefaultPresets, refreshDynamicContent } = setup();
  refreshDynamicContent.mockImplementationOnce(settingsView.waitForPendingChanges);
  hideDefaultPresets.checked = true;
  hideDefaultPresets.dispatchEvent(new Event("change"));
  await settingsView.waitForPendingChanges();
  await vi.waitFor(() => expect(refreshDynamicContent).toHaveResolved());
});

test("waits for confirmation saving before the remaining point count operation", async () => {
  const { settingsView, pointsCount, pointsResetConfirm, storage, saveCurrentFilters } = setup();
  pointsCount.value = "7";
  pointsCount.dispatchEvent(new Event("change"));
  await settingsView.waitForPendingChanges();
  let finishConfirmation!: () => void;
  let finishCurveSave!: () => void;
  storage.set.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finishConfirmation = resolve;
      }),
  );
  saveCurrentFilters.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finishCurveSave = resolve;
      }),
  );
  pointsResetConfirm.dispatchEvent(new Event("click"));
  const finished = vi.fn();
  const wait = settingsView.waitForPendingChanges().then(finished);
  await Promise.resolve();
  expect(finished).not.toHaveBeenCalled();
  expect(saveCurrentFilters).not.toHaveBeenCalled();
  finishConfirmation();
  await vi.waitFor(() => expect(saveCurrentFilters).toHaveBeenCalledOnce());
  expect(finished).not.toHaveBeenCalled();
  finishCurveSave();
  await wait;
  expect(storage.set).toHaveBeenCalledWith({ pointCount: 7 });
});

test("late visibility refresh failure preserves settings already saved and applied", async () => {
  const { settingsView, hideDefaultPresets, refreshDynamicContent } = setup();
  vi.spyOn(console, "error").mockImplementation(() => {});
  let failRefresh!: (error: Error) => void;
  refreshDynamicContent.mockImplementationOnce(
    () =>
      new Promise<void>((_resolve, reject) => {
        failRefresh = reject;
      }),
  );
  hideDefaultPresets.checked = true;
  hideDefaultPresets.dispatchEvent(new Event("change"));
  await settingsView.waitForPendingChanges();
  await settingsView.applySavedSettings(savedSettings);
  failRefresh(new Error("refresh failed"));
  await vi.waitFor(() =>
    expect(console.error).toHaveBeenCalledWith(
      "Failed to save preset visibility",
      expect.anything(),
    ),
  );
  expect(hideDefaultPresets.checked).toBe(true);
});
