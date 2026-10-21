import { afterEach, expect, test, vi } from "vitest";
import { DEFAULT_SHORTCUTS } from "../../domains/shortcuts/shortcuts";
import { STORAGE_KEYS } from "../../infrastructure/chrome/storageKeys";
import type { PopupElements } from "../../ui/popup/popupElements";
import { createEqualizerState } from "../../ui/equalizerCanvas/equalizerEditorState";
import { createPopupApp } from "./createPopupApp";
import { createLocalizationService } from "./localizationController";

const mechanics = vi.hoisted(() => ({
  realAutostart: false,
  realPersistence: false,
  editFilters: () => {},
  flushFilters: async () => {},
  selected: 42 as number | null,
  generation: 1,
  stopCapture: vi.fn(),
  flush: vi.fn(async () => {}),
  renderNames: vi.fn(),
  refreshPresets: vi.fn(async () => {}),
}));
vi.mock("../../ui/equalizerCanvas/createEqualizerCanvas", () => ({
  createEqualizerCanvas: (deps: {
    saveCurrentFilters(): void;
    flushCurrentFilters(): Promise<void>;
  }) => {
    mechanics.editFilters = deps.saveCurrentFilters;
    mechanics.flushFilters = deps.flushCurrentFilters;
    return {
      resize: vi.fn(),
      cleanup: vi.fn(),
      getDimensions: () => ({ canvasWidth: 400, canvasHeight: 200 }),
    };
  },
}));
vi.mock("../../ui/equalizerCanvas/draw/drawSpectrum", () => ({
  createSpectrumRenderer: () => ({ setMeta: vi.fn(), scheduleDraw: vi.fn() }),
}));
vi.mock("./filterPersistence", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./filterPersistence")>();
  return {
    createFilterPersistence: (...args: Parameters<typeof actual.createFilterPersistence>) =>
      mechanics.realPersistence
        ? actual.createFilterPersistence(...args)
        : {
            schedule: vi.fn(),
            hasPendingChanges: () => false,
            flush: mechanics.flush,
            dispose: vi.fn(async () => {}),
          },
  };
});
vi.mock("./captureController", () => ({
  createCaptureController: () => ({
    init: vi.fn(async () => {}),
    syncSnapshot: vi.fn(async () => {}),
    handleStorageChange: vi.fn(async () => {}),
    getSelectedTabId: () => mechanics.selected,
    getSelectionGeneration: () => mechanics.generation,
    isTabCaptured: () => false,
    stopCapture: mechanics.stopCapture,
  }),
}));
vi.mock("../../ui/popup/controlsView", () => ({
  formatGainValue: String,
  createControlsView: () => ({
    setEnableButtonClass: vi.fn(),
    setMuteButtonClass: vi.fn(),
    resetClipping: vi.fn(),
    setClipping: vi.fn(),
  }),
}));
vi.mock("../../ui/popup/presetsView", () => ({
  createPresetsView: () => ({ renderPresetNames: mechanics.renderNames }),
}));
vi.mock("../../ui/popup/autostartView", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../ui/popup/autostartView")>();
  return {
    createAutostartView: (deps: Parameters<typeof actual.createAutostartView>[0]) =>
      mechanics.realAutostart
        ? actual.createAutostartView(deps)
        : {
            init: vi.fn(async () => {}),
            renderWhitelist: vi.fn(async () => {}),
            refreshPresetSelects: mechanics.refreshPresets,
          },
  };
});
vi.mock("../../ui/popup/capturedTabsView", () => ({
  createCapturedTabsView: () => ({ render: vi.fn(async () => {}) }),
}));
vi.mock("../../ui/popup/installUpdateNoticeView", () => ({
  createInstallUpdateNoticeView: () => ({ showInstallUpdateNotice: vi.fn() }),
  getPendingInstallUpdateNotice: () => null,
}));
vi.mock("../../ui/popup/donationReminderView", () => ({
  createDonationReminderView: () => ({ showDonationReminder: vi.fn() }),
}));
vi.mock("../../ui/popup/onboardingGuideView", () => ({
  createOnboardingGuideView: () => ({ start: vi.fn(async () => {}) }),
}));
class FakeElement extends EventTarget {
  lang = "";
  style = { display: "none" };
  classList = { add: vi.fn(), remove: vi.fn(), toggle: vi.fn() };
  getContext = () => ({});
  dataset: Record<string, string> = {};
  attributes: Record<string, string> = {};
  children: FakeElement[] = [];
  parentElement: FakeElement | null = null;
  inert = false;
  tabIndex = 0;
  disabled = false;
  hidden = false;
  checked = false;
  value = "";
  type = "";
  name = "";
  download = "";
  href = "";
  files: unknown[] = [];
  private text = "";
  constructor(public tagName = "DIV") {
    super();
  }
  set textContent(value: string) {
    this.text = value;
    this.children = [];
  }
  get textContent(): string {
    return this.text + this.children.map((child) => child.textContent).join("");
  }
  append(...children: FakeElement[]): void {
    children.forEach((child) => {
      child.parentElement = this;
      this.children.push(child);
    });
  }
  appendChild(child: FakeElement): FakeElement {
    this.append(child);
    return child;
  }
  replaceChildren(...children: FakeElement[]): void {
    this.text = "";
    this.children = [];
    this.append(...children);
  }
  setAttribute(name: string, value: string): void {
    this.attributes[name] = value;
  }
  matches(): boolean {
    return this.disabled;
  }
  closest(): FakeElement | null {
    return this.inert ? this : (this.parentElement?.closest() ?? null);
  }
  getClientRects(): object[] {
    return this.hidden ? [] : [{}];
  }
  querySelectorAll(): FakeElement[] {
    return descendants(this).filter((child) => ["INPUT", "BUTTON"].includes(child.tagName));
  }
  querySelector(): FakeElement | null {
    return null;
  }
  contains(element: unknown): boolean {
    return element === this || descendants(this).includes(element as FakeElement);
  }
  focus(): void {
    doc.activeElement = this;
  }
  click(): void {
    if (!this.disabled) this.dispatchEvent(new Event("click"));
  }
  remove(): void {
    this.parentElement?.children.splice(this.parentElement.children.indexOf(this), 1);
  }
}
const descendants = (element: FakeElement): FakeElement[] =>
  element.children.flatMap((child) => [child, ...descendants(child)]);
const doc = Object.assign(new EventTarget(), {
  activeElement: null as FakeElement | null,
  body: new FakeElement(),
  documentElement: new FakeElement(),
  getElementById: () => null,
  querySelectorAll: () => [],
  createElement: (tag: string) => new FakeElement(tag.toUpperCase()),
});
class Reader {
  static pending: Reader[] = [];
  result: string | null = null;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readAsText(file: { text: string; defer?: boolean; error?: boolean }): void {
    this.result = file.text;
    if (file.defer) Reader.pending.push(this);
    else if (file.error) this.onerror?.();
    else this.onload?.();
  }
}

const disposers: Array<() => void> = [];
afterEach(() => {
  disposers.splice(0).forEach((dispose) => dispose());
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  Reader.pending = [];
  mechanics.realAutostart = false;
  mechanics.realPersistence = false;
  mechanics.selected = 42;
  mechanics.generation = 1;
});
const tick = async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
};
const general = {
  theme: "light",
  uiLanguage: "ru",
  pointCount: 7,
  enableSpectrum: false,
  enableVolumeCompensation: true,
  skipPointsResetConfirm: true,
};
const filters = [{ type: "peaking" as const, freq: 1000, gain: 2, q: 0.5 }];
const file = (settings: object) =>
  JSON.stringify({ format: "eq-toolkit-settings", version: 1, settings });
const setup = (
  options: { realLocalization?: boolean; realAutostart?: boolean; realPersistence?: boolean } = {},
) => {
  mechanics.realAutostart = options.realAutostart === true;
  mechanics.realPersistence = options.realPersistence === true;
  doc.documentElement.lang = "";
  vi.stubGlobal("HTMLSelectElement", FakeElement);
  vi.stubGlobal("HTMLElement", FakeElement);
  vi.stubGlobal("document", doc);
  vi.stubGlobal("window", new EventTarget());
  vi.stubGlobal("FileReader", Reader);
  const elements = new Proxy({} as Record<string, FakeElement>, {
    get: (target, key: string) => (target[key] ??= new FakeElement()),
  });
  doc.body.replaceChildren(elements.settingsModal, elements.settingsImportModal);
  elements.settingsImportModal.append(
    ...[
      "Title",
      "Groups",
      "Conflicts",
      "Summary",
      "Status",
      "ResetConfirm",
      "Back",
      "Next",
      "Apply",
      "Cancel",
      "Close",
    ].map((suffix) => elements[`settingsImport${suffix}`]),
  );
  elements.settingsImportModal.style.display = "none";
  const listeners = new Set<
    (changes: Record<string, chrome.storage.StorageChange>, area: string) => void
  >();
  const emit = (changes: Record<string, chrome.storage.StorageChange>, area = "local") =>
    listeners.forEach((listener) => listener(changes, area));
  const stored: Record<string, unknown> = { presets: { Mine: filters }, presetNames: ["Mine"] };
  const storage = {
    get: vi.fn<(keys?: string | string[]) => Promise<Record<string, unknown>>>(async () =>
      structuredClone(stored),
    ),
    set: vi.fn(async (patch: Record<string, unknown>) => {
      const changes = Object.fromEntries(
        Object.entries(patch).map(([key, value]) => [
          key,
          { oldValue: stored[key], newValue: value },
        ]),
      );
      Object.assign(stored, structuredClone(patch));
      emit(changes);
    }),
  };
  vi.stubGlobal("chrome", {
    i18n: {
      getUILanguage: () => "en",
      getMessage: (key: string) => (key === "@@ui_locale" ? "en" : ""),
    },
    tabs: {
      get: vi.fn(async (id: number) => ({ id, title: `Tab ${id}` })),
      query: vi.fn(async () => []),
    },
    runtime: { getURL: (path: string) => path },
    storage: {
      local: storage,
      onChanged: {
        addListener: (listener: typeof emit) => listeners.add(listener),
        removeListener: (listener: typeof emit) => listeners.delete(listener),
      },
    },
  });
  const localization = {
    ready: Promise.resolve(),
    applyLocalization: vi.fn(),
    populateLanguageSelect: vi.fn(),
    getMessage: (key: string) => key,
    waitForPendingChanges: vi.fn(async () => {}),
    applySavedLanguage: vi.fn(async () => true),
    setLanguage: vi.fn(async () => {}),
  };
  if (options.realLocalization)
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () => ({ ok: true, json: async () => ({ ready: { message: "Ready" } }) }) as Response,
      ),
    );
  const realLocalization = options.realLocalization ? createLocalizationService() : null;
  const state = createEqualizerState();
  state.initPoints(3, { canvasWidth: 400, canvasHeight: 200 });
  const setPoints = vi.spyOn(state, "setPoints");
  const initPoints = vi.spyOn(state, "initPoints");
  const app = createPopupApp({
    elements: elements as unknown as PopupElements,
    audioContext: {} as AudioContext,
    equalizerState: state,
    localization: realLocalization ?? localization,
    readThemeColors: () => ({}) as never,
  });
  disposers.push(app.dispose);
  const read = async (text: string, options: { defer?: boolean; error?: boolean } = {}) => {
    elements.settingsImportInput.files = [{ text, ...options }];
    elements.settingsImportInput.value = "file.json";
    elements.settingsImportInput.dispatchEvent(new Event("change"));
    await tick();
  };
  const confirm = async () => {
    elements.settingsImportNext.click();
    elements.settingsImportResetConfirm.checked = true;
    elements.settingsImportResetConfirm.dispatchEvent(new Event("change"));
    elements.settingsImportApply.click();
    await tick();
  };
  return {
    app,
    realLocalization,
    elements,
    storage,
    stored,
    localization,
    state,
    setPoints,
    initPoints,
    emit,
    read,
    confirm,
  };
};

test("file groups conflicts summary commit updates settings with one write and no second reset", async () => {
  const t = setup();
  await t.read(
    file({
      general,
      shortcuts: { ...DEFAULT_SHORTCUTS, mute: null },
      presets: {
        presets: { Mine: [{ ...filters[0], gain: 5 }] },
        presetNames: ["Mine"],
        hideDefaultPresets: true,
      },
      autostartRules: [{ id: "r", type: "domain", value: "example.com", presetName: "Mine" }],
    }),
  );
  expect(t.elements.settingsImportGroups.hidden).toBe(false);
  t.elements.settingsImportNext.click();
  expect(t.elements.settingsImportConflicts.hidden).toBe(false);
  const incoming = descendants(t.elements.settingsImportConflicts).find(
    (e) => e.type === "radio" && e.value === "incoming",
  )!;
  incoming.checked = true;
  incoming.dispatchEvent(new Event("change"));
  t.elements.settingsImportNext.click();
  expect(t.elements.settingsImportSummary.hidden).toBe(false);
  expect(t.storage.set).not.toHaveBeenCalled();
  t.elements.settingsImportResetConfirm.checked = true;
  t.elements.settingsImportResetConfirm.dispatchEvent(new Event("change"));
  t.elements.settingsImportApply.click();
  await tick();
  expect(t.storage.set).toHaveBeenCalledOnce();
  expect(t.stored.theme).toBe("light");
  expect(t.elements.themeSelect.value).toBe("light");
  expect(t.elements.shortcutMute.value).toBe("");
  expect(t.localization.applySavedLanguage).toHaveBeenCalledWith("ru", expect.any(Function));
  expect(t.initPoints).not.toHaveBeenCalled();
  expect(t.state.getFilters({ canvasWidth: 400, canvasHeight: 200 })).toEqual(
    t.stored[STORAGE_KEYS.tabFilters(42)],
  );
});

test("updates another open popup without writes or a second reset", async () => {
  const t = setup();
  Object.assign(t.stored, general, {
    shortcuts: { ...DEFAULT_SHORTCUTS, mute: null },
    hideDefaultPresets: true,
  });
  t.emit(
    Object.fromEntries(Object.entries(general).map(([key, value]) => [key, { newValue: value }])),
  );
  await tick();
  expect(t.elements.themeSelect.value).toBe("light");
  expect(t.elements.enableVolumeCompensation.checked).toBe(true);
  expect(t.elements.hideDefaultPresets.checked).toBe(true);
  expect(t.elements.shortcutMute.value).toBe("");
  expect(t.localization.applySavedLanguage).toHaveBeenCalledWith("ru", expect.any(Function));
  expect(t.initPoints).not.toHaveBeenCalled();
  expect(t.setPoints).not.toHaveBeenCalled();
  expect(t.storage.set).not.toHaveBeenCalled();
});

test("renders confirmed filters in another open popup only for its selected tab", async () => {
  const t = setup();
  t.stored[STORAGE_KEYS.tabFilters(43)] = filters;
  t.emit({ [STORAGE_KEYS.tabFilters(43)]: { newValue: filters }, filters: { newValue: filters } });
  await tick();
  expect(t.setPoints).not.toHaveBeenCalled();
  t.stored[STORAGE_KEYS.tabFilters(42)] = filters;
  t.emit({ [STORAGE_KEYS.tabFilters(42)]: { newValue: filters } });
  await tick();
  expect(t.setPoints).toHaveBeenCalledWith(filters, expect.anything(), expect.anything());
  expect(t.storage.set).not.toHaveBeenCalled();
});

test("reports render failure after successful commit without retrying storage", async () => {
  const t = setup();
  t.localization.applySavedLanguage.mockRejectedValue(new Error("render"));
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  await t.read(file({ general }));
  await t.confirm();
  expect(t.elements.settingsImportStatus.textContent).toBe("settings_transfer_refresh_error");
  expect(t.storage.set).toHaveBeenCalledOnce();
  error.mockRestore();
});

test("releases import listeners on popup disposal and ignores late file reads", async () => {
  const t = setup();
  await t.read(file({ general }), { defer: true });
  t.app.dispose();
  Reader.pending[0].onload?.();
  await tick();
  expect(t.storage.get).not.toHaveBeenCalled();
  expect(t.storage.set).not.toHaveBeenCalled();
  expect(mechanics.stopCapture).not.toHaveBeenCalled();
  await t.read(file({ general }));
  expect(t.storage.get).not.toHaveBeenCalled();
});

test("preserves read errors, invalid files, write errors and repeat file selection", async () => {
  const t = setup();
  await t.read("", { error: true });
  expect(t.elements.settingsImportStatus.textContent).toBe("settings_transfer_read_error");
  await t.read("{");
  expect(t.elements.settingsImportStatus.textContent).toBe("settings_transfer_file_error");
  expect(t.elements.settingsImportInput.value).toBe("");
  await t.read(file({ general }));
  t.storage.set.mockRejectedValueOnce(new Error("write"));
  await t.confirm();
  expect(t.elements.settingsImportStatus.textContent).toBe("settings_transfer_write_error");
  await t.read(file({ general }));
  await t.confirm();
  expect(t.elements.settingsImportStatus.textContent).toBe("settings_transfer_saved");
});

test("exports all four groups and imports that file again without duplicates", async () => {
  const t = setup();
  let exported: Blob | undefined;
  vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
    exported = blob as Blob;
    return "blob:test";
  });
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  t.elements.exportSettingsButton.click();
  await tick();
  const text = await exported!.text();
  const parsed = JSON.parse(text);
  expect(Object.keys(parsed.settings).sort()).toEqual([
    "autostartRules",
    "general",
    "presets",
    "shortcuts",
  ]);
  expect(text).toContain('  "format": "eq-toolkit-settings"');
  await t.read(text);
  t.elements.settingsImportNext.click();
  t.elements.settingsImportApply.click();
  await tick();
  expect(t.storage.set).not.toHaveBeenCalled();
  expect(t.stored.presetNames).toEqual(["Mine"]);
  expect(t.elements.settingsImportStatus.textContent).toBe("settings_transfer_unchanged");
});

test("makes the background inert before pending setting and filter work finishes", async () => {
  const t = setup();
  let release!: () => void;
  mechanics.flush.mockReturnValueOnce(
    new Promise<void>((resolve) => {
      release = resolve;
    }),
  );
  await t.read(file({ general }));
  expect(t.elements.settingsModal.inert).toBe(true);
  expect(t.storage.get).not.toHaveBeenCalled();
  release();
  await tick();
  expect(t.elements.settingsImportGroups.hidden).toBe(false);
});

test("does not apply a saved reset after selection changes A to B to A", async () => {
  const t = setup();
  await t.read(file({ general }));
  t.storage.set.mockImplementationOnce(async (patch) => {
    Object.assign(t.stored, patch);
    mechanics.generation += 2;
  });
  await t.confirm();
  expect(t.storage.set).toHaveBeenCalledOnce();
  expect(t.stored[STORAGE_KEYS.tabFilters(42)]).toBeDefined();
  expect(t.setPoints).not.toHaveBeenCalled();
});

test("keeps a completed storage reset when the popup closes during save", async () => {
  const t = setup();
  await t.read(file({ general }));
  const save = t.storage.set.getMockImplementation()!;
  t.storage.set.mockImplementationOnce(async (patch) => {
    await save(patch);
    t.app.dispose();
  });
  await t.confirm();
  expect(t.storage.set).toHaveBeenCalledOnce();
  expect(t.stored[STORAGE_KEYS.tabFilters(42)]).toBeDefined();
  expect(t.setPoints).not.toHaveBeenCalled();
  expect(t.localization.applySavedLanguage).not.toHaveBeenCalled();
});

test("discards a filter refresh after selection changes A to B to A", async () => {
  const t = setup();
  let resolve!: (value: Record<string, unknown>) => void;
  t.storage.get.mockReturnValueOnce(
    new Promise((done) => {
      resolve = done;
    }),
  );
  t.emit({ [STORAGE_KEYS.tabFilters(42)]: { newValue: filters } });
  await tick();
  mechanics.generation += 2;
  resolve({ [STORAGE_KEYS.tabFilters(42)]: filters });
  await tick();
  expect(t.setPoints).not.toHaveBeenCalled();
});

test("a newer settings refresh supersedes an older delayed storage snapshot", async () => {
  const t = setup();
  let resolve!: (value: Record<string, unknown>) => void;
  t.storage.get.mockReturnValueOnce(
    new Promise((done) => {
      resolve = done;
    }),
  );
  t.emit({ theme: { newValue: "dark" } });
  await tick();
  Object.assign(t.stored, general);
  t.emit({ theme: { newValue: "light" } });
  resolve({ theme: "dark", uiLanguage: "en" });
  await tick();
  expect(t.elements.themeSelect.value).toBe("light");
  expect(t.localization.applySavedLanguage).toHaveBeenCalledOnce();
  expect(t.localization.applySavedLanguage).toHaveBeenCalledWith("ru", expect.any(Function));
  expect(t.storage.set).not.toHaveBeenCalled();
});

test("a target removed before confirmation forces a fresh review", async () => {
  const t = setup();
  await t.read(file({ general }));
  vi.mocked(chrome.tabs.get).mockRejectedValueOnce(new Error("No tab with id: 42."));
  await t.confirm();
  expect(t.elements.settingsImportStatus.textContent).toBe("settings_transfer_stale");
  expect(t.storage.set).not.toHaveBeenCalled();
});

test("a reset without a selected tab updates only the empty editor", async () => {
  mechanics.selected = null;
  const t = setup();
  await t.read(file({ general }));
  t.elements.settingsImportNext.click();
  t.elements.settingsImportApply.click();
  await tick();
  expect(t.storage.set).toHaveBeenCalledOnce();
  expect(t.setPoints).toHaveBeenCalledOnce();
  expect(t.stored.filters).toBeUndefined();
  expect(t.stored[STORAGE_KEYS.tabFilters(42)]).toBeUndefined();
});

test("updates the shortcut cache used by the popup key listener", async () => {
  const t = setup();
  await t.read(file({ shortcuts: { mute: null, toggleEq: null } }));
  await t.confirm();
  expect(t.storage.set).toHaveBeenCalledOnce();
  const event = Object.assign(new Event("keydown"), {
    key: "m",
    code: "KeyM",
    altKey: true,
    ctrlKey: false,
    shiftKey: false,
    metaKey: false,
    repeat: false,
  });
  doc.dispatchEvent(event);
  await tick();
  expect(t.storage.set).toHaveBeenCalledOnce();
  expect(t.stored[STORAGE_KEYS.tabMute(42)]).toBeUndefined();
});

test("export waits for pending settings including locale work", async () => {
  const t = setup();
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  t.localization.waitForPendingChanges.mockReturnValue(pending);
  const download = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  t.elements.exportSettingsButton.click();
  await tick();
  expect(t.storage.get).not.toHaveBeenCalled();
  expect(download).not.toHaveBeenCalled();
  release();
  await tick();
  expect(download).toHaveBeenCalledOnce();
  expect(t.storage.set).not.toHaveBeenCalled();
});

test("a selection change during target reads forces review before saving", async () => {
  const t = setup();
  await t.read(file({ general }));
  let finishRead!: (tab: chrome.tabs.Tab) => void;
  vi.mocked(chrome.tabs.get).mockImplementationOnce(
    () =>
      new Promise<chrome.tabs.Tab>((resolve) => {
        finishRead = resolve;
      }),
  );
  await t.confirm();
  mechanics.selected = 43;
  mechanics.generation++;
  finishRead({ id: 42, title: "Tab 42" } as chrome.tabs.Tab);
  await tick();
  expect(t.storage.set).not.toHaveBeenCalled();
  expect(t.elements.settingsImportStatus.textContent).toBe("settings_transfer_stale");
});

test("unexpected tab API errors prevent import instead of becoming an empty target", async () => {
  const t = setup();
  vi.mocked(chrome.tabs.get).mockRejectedValueOnce(new Error("Browser API unavailable"));
  await t.read(file({ general }));
  expect(t.elements.settingsImportStatus.textContent).toBe("settings_transfer_read_error");
  expect(t.storage.set).not.toHaveBeenCalled();
});

test("disposal during a real saved locale fetch prevents its later DOM application", async () => {
  const t = setup({ realLocalization: true });
  await t.realLocalization!.ready;
  let finishLocale!: (response: Response) => void;
  vi.mocked(fetch).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishLocale = resolve;
      }),
  );
  t.stored.uiLanguage = "ru";
  t.emit({ uiLanguage: { newValue: "ru" } });
  await tick();
  const language = doc.documentElement.lang;
  t.app.dispose();
  finishLocale({ ok: true, json: async () => ({ ready: { message: "RU" } }) } as Response);
  await tick();
  expect(doc.documentElement.lang).toBe(language);
  expect(t.realLocalization!.getMessage("ready")).toBe("Ready");
  expect(t.storage.set).not.toHaveBeenCalled();
});

test("an older real rule read cannot overwrite a newer storage refresh", async () => {
  const t = setup({ realAutostart: true });
  let finishOld!: (value: Record<string, unknown>) => void;
  t.storage.get.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishOld = resolve;
      }),
  );
  t.emit({ whitelist: { newValue: [] } });
  await tick();
  const latest = { id: "new", type: "domain", value: "new.example.com", presetName: "Mine" };
  t.stored.whitelist = [latest];
  t.emit({ whitelist: { newValue: [latest] } });
  await tick();
  expect(t.elements.autostartSettingsList.textContent).toContain("new.example.com");
  finishOld({ whitelist: [{ ...latest, id: "old", value: "old.example.com" }] });
  await tick();
  expect(t.elements.autostartSettingsList.textContent).toContain("new.example.com");
  expect(t.elements.autostartSettingsList.textContent).not.toContain("old.example.com");
});

test("an older real preset read cannot overwrite newer dependency selects", async () => {
  const t = setup({ realAutostart: true });
  const read = t.storage.get.getMockImplementation()!;
  let finishOld!: (value: Record<string, unknown>) => void;
  let intercepted = false;
  t.storage.get.mockImplementation((keys) => {
    if (!intercepted && Array.isArray(keys) && keys.includes(STORAGE_KEYS.PRESETS)) {
      intercepted = true;
      return new Promise((resolve) => {
        finishOld = resolve;
      });
    }
    return read(keys);
  });
  t.emit({ presets: { newValue: {} } });
  await tick();
  t.stored.presets = { Latest: filters };
  t.stored.presetNames = ["Latest"];
  t.emit({ presets: { newValue: t.stored.presets } });
  await tick();
  expect(t.elements.autostartSettingsAddPreset.textContent).toContain("Latest");
  finishOld({ presets: { Old: filters }, presetNames: ["Old"] });
  await tick();
  expect(t.elements.autostartSettingsAddPreset.textContent).toContain("Latest");
  expect(t.elements.autostartSettingsAddPreset.textContent).not.toContain("Old");
});

test("a committed import supersedes an older real rule read", async () => {
  const t = setup({ realAutostart: true });
  let finishOld!: (value: Record<string, unknown>) => void;
  t.storage.get.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishOld = resolve;
      }),
  );
  t.emit({ whitelist: { newValue: [] } });
  await tick();
  const latest = { id: "new", type: "domain", value: "imported.example.com", presetName: "Mine" };
  await t.read(file({ autostartRules: [latest] }));
  await t.confirm();
  expect(t.elements.settingsImportStatus.textContent).toBe("settings_transfer_saved");
  expect(t.elements.autostartSettingsList.textContent).toContain("imported.example.com");
  finishOld({ whitelist: [{ ...latest, id: "old", value: "old.example.com" }] });
  await tick();
  expect(t.elements.autostartSettingsList.textContent).toContain("imported.example.com");
  expect(t.elements.autostartSettingsList.textContent).not.toContain("old.example.com");
  expect(t.storage.set).toHaveBeenCalledOnce();
});

test("disposal invalidates a real pending autostart list read", async () => {
  const t = setup({ realAutostart: true });
  let finishRead!: (value: Record<string, unknown>) => void;
  t.storage.get.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishRead = resolve;
      }),
  );
  t.emit({ whitelist: { newValue: [] } });
  await tick();
  const before = t.elements.autostartSettingsList.textContent;
  t.app.dispose();
  finishRead({ whitelist: [] });
  await tick();
  expect(t.elements.autostartSettingsList.textContent).toBe(before);
});

test.each(["enableSpectrum", "themeSelect"])(
  "saving %s preserves a pending user language selection",
  async (control) => {
    const t = setup({ realLocalization: true });
    await t.realLocalization!.ready;
    let finishLocale!: (response: Response) => void;
    vi.mocked(fetch)
      .mockResolvedValue({ ok: true, json: async () => ({ ready: { message: "RU" } }) } as Response)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishLocale = resolve;
          }),
      );
    t.elements.languageSelect.value = "ru";
    t.elements.languageSelect.dispatchEvent(new Event("change"));
    t.elements[control].checked = false;
    t.elements[control].value = "light";
    t.elements[control].dispatchEvent(new Event("change"));
    await tick();
    finishLocale({ ok: true, json: async () => ({ ready: { message: "RU" } }) } as Response);
    await tick();
    expect(t.stored.uiLanguage).toBe("ru");
    expect(doc.documentElement.lang).toBe("ru");
    expect(t.realLocalization!.getMessage("ready")).toBe("RU");
  },
);

test("a deferred selected-filter read cannot revert a newer canvas edit", async () => {
  const t = setup({ realPersistence: true });
  let finishRead!: (value: Record<string, unknown>) => void;
  t.storage.get.mockReturnValueOnce(
    new Promise((resolve) => {
      finishRead = resolve;
    }),
  );
  t.emit({ [STORAGE_KEYS.tabFilters(42)]: { newValue: filters } });
  await tick();
  const edited = [{ ...filters[0], gain: 7 }];
  t.state.setPoints(edited, { canvasWidth: 400, canvasHeight: 200 });
  mechanics.editFilters();
  finishRead({ [STORAGE_KEYS.tabFilters(42)]: filters });
  await tick();
  expect(
    t.state
      .getFilters({ canvasWidth: 400, canvasHeight: 200 })
      .find((filter) => filter.type === "peaking")?.gain,
  ).toBeCloseTo(7);
  await mechanics.flushFilters();
  expect(t.stored[STORAGE_KEYS.tabFilters(42)]).toEqual(
    t.state.getFilters({ canvasWidth: 400, canvasHeight: 200 }),
  );
});

test("an own write echo cannot replay the saved curve over the next pending canvas edit", async () => {
  const t = setup({ realPersistence: true });
  const edited = [{ ...filters[0], gain: 7 }];
  t.state.setPoints(filters, { canvasWidth: 400, canvasHeight: 200 });
  mechanics.editFilters();
  const write = t.storage.set.getMockImplementation()!;
  let finishWrite!: () => void;
  t.storage.set.mockImplementationOnce(async (patch) => {
    // Model Chrome delivering the previous write's event after another local edit.
    t.state.setPoints(edited, { canvasWidth: 400, canvasHeight: 200 });
    mechanics.editFilters();
    await write(patch);
    await new Promise<void>((resolve) => {
      finishWrite = resolve;
    });
  });
  const flushing = mechanics.flushFilters();
  await tick();
  expect(
    t.state
      .getFilters({ canvasWidth: 400, canvasHeight: 200 })
      .find((filter) => filter.type === "peaking")?.gain,
  ).toBeCloseTo(7);
  finishWrite();
  await flushing;
  await tick();
  expect(t.stored[STORAGE_KEYS.tabFilters(42)]).toEqual(
    t.state.getFilters({ canvasWidth: 400, canvasHeight: 200 }),
  );
  const external = [{ ...filters[0], gain: 9 }];
  t.stored[STORAGE_KEYS.tabFilters(42)] = external;
  t.emit({ [STORAGE_KEYS.tabFilters(42)]: { newValue: external } });
  await tick();
  expect(
    t.state
      .getFilters({ canvasWidth: 400, canvasHeight: 200 })
      .find((filter) => filter.type === "peaking")?.gain,
  ).toBeCloseTo(9);
});

test("pending edits on another tab do not suppress the selected tab refresh", async () => {
  const t = setup({ realPersistence: true });
  mechanics.selected = 43;
  mechanics.editFilters();
  mechanics.selected = 42;
  mechanics.generation++;
  t.stored[STORAGE_KEYS.tabFilters(42)] = filters;
  t.emit({ [STORAGE_KEYS.tabFilters(42)]: { newValue: filters } });
  await tick();
  expect(
    t.state
      .getFilters({ canvasWidth: 400, canvasHeight: 200 })
      .find((filter) => filter.type === "peaking")?.gain,
  ).toBeCloseTo(2);
  await mechanics.flushFilters();
});

test("a user language selection started during a saved-settings read survives its stale snapshot", async () => {
  const t = setup({ realLocalization: true });
  await t.realLocalization!.ready;
  let finishRead!: (value: Record<string, unknown>) => void;
  t.storage.get.mockReturnValueOnce(
    new Promise((resolve) => {
      finishRead = resolve;
    }),
  );
  t.emit({ enableSpectrum: { newValue: false } });
  await tick();
  let finishLocale!: (response: Response) => void;
  vi.mocked(fetch)
    .mockResolvedValue({ ok: true, json: async () => ({ ready: { message: "RU" } }) } as Response)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishLocale = resolve;
        }),
    );
  t.elements.languageSelect.value = "ru";
  t.elements.languageSelect.dispatchEvent(new Event("change"));
  finishRead({ uiLanguage: "en", enableSpectrum: false });
  await tick();
  finishLocale({ ok: true, json: async () => ({ ready: { message: "RU" } }) } as Response);
  await tick();
  expect(t.stored.uiLanguage).toBe("ru");
  expect(doc.documentElement.lang).toBe("ru");
});

test.each(["mute", "toggleEq"] as const)(
  "an imported null %s can be enabled in the connected settings UI",
  async (action) => {
    const t = setup();
    await t.read(file({ shortcuts: { mute: null, toggleEq: null } }));
    await t.confirm();
    t.elements.settingsImportClose.click();
    const input = action === "mute" ? t.elements.shortcutMute : t.elements.shortcutToggleEq;
    input.dispatchEvent(
      Object.assign(new Event("keydown"), {
        key: "u",
        code: "KeyU",
        altKey: true,
        ctrlKey: false,
        shiftKey: false,
        metaKey: false,
      }),
    );
    await tick();
    expect(t.stored.shortcuts).toEqual({
      mute: null,
      toggleEq: null,
      [action]: { key: "U", alt: true, ctrl: false, shift: false, meta: false },
    });
    expect(input.value).toBe("Alt+U");
    expect(t.elements.shortcutsSettingsError.textContent).toBe("");
  },
);
