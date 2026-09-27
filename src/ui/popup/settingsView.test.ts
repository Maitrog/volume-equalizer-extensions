import { afterEach, describe, expect, test, vi } from "vitest";

import { STORAGE_KEYS } from "../../infrastructure/chrome/storageKeys";
import { createPresetActions } from "../../app/popup/presetActions";
import { createSettingsActions } from "../../app/popup/settingsActions";
import { createSettingsView } from "./settingsView";

class FakeElement extends EventTarget {
  style = { display: "" };
  value = "";
  checked = false;
  files: FileList | null = null;
  classList = {
    add: vi.fn(),
    remove: vi.fn(),
    toggle: vi.fn(),
  };
  click = vi.fn();
}

class FakeFileReader {
  result: string | null = null;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;

  readAsText(file: Blob): void {
    const source = file as Blob & { contents: string; readError?: boolean };
    if (source.readError) {
      this.onerror?.();
      return;
    }
    this.result = source.contents;
    this.onload?.();
  }
}

const flushImport = async (importInput: FakeElement): Promise<void> => {
  await vi.waitFor(() => expect(importInput.value).toBe(""));
};

const setup = (options: {
  contents: string;
  readError?: boolean;
  rejectSet?: boolean;
  storedPresetNames?: string[];
  storedPresets?: Record<string, unknown>;
}) => {
  const importInput = new FakeElement();
  const file = {
    contents: options.contents,
    readError: options.readError,
  } as unknown as File;
  importInput.files = [file] as unknown as FileList;
  importInput.value = "C:\\fakepath\\presets.json";

  const storage = {
    get: vi.fn(async () => ({
      [STORAGE_KEYS.PRESETS]: options.storedPresets ?? {},
      [STORAGE_KEYS.PRESET_NAMES]: options.storedPresetNames ?? [],
    })),
    set: options.rejectSet
      ? vi.fn(async () => Promise.reject(new Error("storage unavailable")))
      : vi.fn(async () => undefined),
  };
  const alert = vi.fn();
  const addPresetToDropdown = vi.fn();
  const refreshDynamicContent = vi.fn(async () => undefined);
  const enableVolumeCompensation = new FakeElement();

  vi.stubGlobal("window", new EventTarget());
  vi.stubGlobal("document", {
    documentElement: { dataset: {} },
  });
  vi.stubGlobal("chrome", { storage: { local: storage } });
  vi.stubGlobal("alert", alert);
  vi.stubGlobal("FileReader", FakeFileReader);
  const presetActions = createPresetActions({
    getCurrentTabId: vi.fn(async () => 1),
    getCurrentFilters: vi.fn(() => []),
  });
  const settingsActions = createSettingsActions();

  const settingsView = createSettingsView({
    settingsModal: new FakeElement() as unknown as HTMLElement,
    settingsButton: new FakeElement() as unknown as HTMLElement,
    closeSettingsButton: new FakeElement() as unknown as HTMLElement,
    themeSelect: new FakeElement() as unknown as HTMLSelectElement,
    pointsCount: new FakeElement() as unknown as HTMLSelectElement,
    pointsResetModal: new FakeElement() as unknown as HTMLElement,
    pointsResetConfirm: new FakeElement() as unknown as HTMLButtonElement,
    pointsResetCancel: new FakeElement() as unknown as HTMLButtonElement,
    skipResetConfirm: new FakeElement() as unknown as HTMLInputElement,
    exportPresetsButton: new FakeElement() as unknown as HTMLButtonElement,
    importPresetsButton: new FakeElement() as unknown as HTMLButtonElement,
    importInput: importInput as unknown as HTMLInputElement,
    enableSpectrum: new FakeElement() as unknown as HTMLInputElement,
    enableVolumeCompensation: enableVolumeCompensation as unknown as HTMLInputElement,
    hideDefaultPresets: new FakeElement() as unknown as HTMLInputElement,
    languageSelect: new FakeElement() as unknown as HTMLSelectElement,
    shortcutMute: new FakeElement() as unknown as HTMLInputElement,
    shortcutToggleEq: new FakeElement() as unknown as HTMLInputElement,
    shortcutsError: new FakeElement() as unknown as HTMLElement,
    localization: {
      getMessage: (name: string) => name,
      setLanguage: vi.fn(async () => undefined),
    } as never,
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
    importPresets: presetActions.importPresets,
    exportPresets: presetActions.exportPresets,
    addPresetToDropdown,
    initPoints: vi.fn(),
    redraw: vi.fn(),
    saveCurrentFilters: vi.fn(async () => undefined),
    refreshDynamicContent,
  });

  return {
    addPresetToDropdown,
    alert,
    enableVolumeCompensation,
    file,
    importInput,
    refreshDynamicContent,
    settingsView,
    storage,
  };
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("preset import settings", () => {
  test("a file read failure shows an error without reading storage", async () => {
    const { alert, importInput, storage } = setup({
      contents: "",
      readError: true,
    });

    importInput.dispatchEvent(new Event("change"));
    await flushImport(importInput);

    expect(storage.get).not.toHaveBeenCalled();
    expect(storage.set).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledWith("preset_import_read_error");
  });

  test("invalid JSON does not write storage", async () => {
    const { alert, importInput, storage } = setup({ contents: "{" });

    importInput.dispatchEvent(new Event("change"));
    await flushImport(importInput);

    expect(storage.get).not.toHaveBeenCalled();
    expect(storage.set).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledWith("preset_import_syntax_error");
  });

  test("persists normalized new presets without overwriting existing ones", async () => {
    const existingFilters = [{ freq: 500, gain: 7 }];
    const contents = JSON.stringify({
      presetNames: ["Bass Boost", "Existing", "New"],
      presets: {
        "Bass Boost": [{ freq: 1000, gain: -12 }],
        Existing: [{ freq: 500, gain: -12 }],
        New: [{ freq: "1000", gain: "2" }],
      },
    });
    const { addPresetToDropdown, importInput, refreshDynamicContent, storage } = setup({
      contents,
      storedPresetNames: ["Existing"],
      storedPresets: { Existing: existingFilters },
    });

    importInput.dispatchEvent(new Event("change"));
    await flushImport(importInput);

    expect(storage.set).toHaveBeenCalledWith({
      [STORAGE_KEYS.PRESETS]: {
        Existing: existingFilters,
        New: [{ freq: 1000, gain: 2, q: 0.5, type: "peaking" }],
      },
      [STORAGE_KEYS.PRESET_NAMES]: ["Existing", "New"],
    });
    expect(addPresetToDropdown).toHaveBeenCalledWith("New");
    expect(addPresetToDropdown).toHaveBeenCalledOnce();
    expect(refreshDynamicContent).toHaveBeenCalledOnce();
  });

  test("a rejected storage write leaves the dropdown unchanged", async () => {
    const contents = JSON.stringify({
      presetNames: ["Mine"],
      presets: { Mine: [{ freq: 1000, gain: 2 }] },
    });
    const { addPresetToDropdown, alert, importInput, refreshDynamicContent, storage } = setup({
      contents,
      rejectSet: true,
    });

    importInput.dispatchEvent(new Event("change"));
    await flushImport(importInput);

    expect(storage.set).toHaveBeenCalledOnce();
    expect(addPresetToDropdown).not.toHaveBeenCalled();
    expect(refreshDynamicContent).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledWith("preset_import_save_error");
  });

  test("resets the file input so the same file can be selected again", async () => {
    const { alert, file, importInput } = setup({ contents: "{" });

    importInput.dispatchEvent(new Event("change"));
    await flushImport(importInput);

    importInput.files = [file] as unknown as FileList;
    importInput.value = "C:\\fakepath\\presets.json";
    importInput.dispatchEvent(new Event("change"));
    await flushImport(importInput);

    expect(alert).toHaveBeenCalledTimes(2);
  });
});

describe("volume compensation setting", () => {
  test("starts disabled and persists checkbox changes", async () => {
    const { enableVolumeCompensation, settingsView, storage } = setup({ contents: "" });

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
