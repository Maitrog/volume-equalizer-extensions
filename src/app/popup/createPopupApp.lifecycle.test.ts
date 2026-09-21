import { afterEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  canvasCleanup: vi.fn(),
  filterDispose: vi.fn(() => Promise.resolve()),
  connectSpectrum: vi.fn(),
  disposeSubscriptions: vi.fn(),
  ensureContentScripts: vi.fn(() => Promise.resolve()),
  syncSnapshot: vi.fn(() => Promise.resolve()),
  handleStorageChange: vi.fn(() => Promise.resolve()),
  stopCapture: vi.fn(() => Promise.resolve()),
  renderCapturedTabs: vi.fn(() => Promise.resolve()),
}));

vi.mock("../../ui/equalizerCanvas/createEqualizerCanvas", () => ({
  createEqualizerCanvas: () => ({
    draw: vi.fn(),
    resize: vi.fn(),
    getDimensions: () => ({ canvasWidth: 500, canvasHeight: 200 }),
    cleanup: mocks.canvasCleanup,
  }),
}));
vi.mock("./filterPersistence", () => ({
  createFilterPersistence: () => ({
    schedule: vi.fn(),
    flush: vi.fn(() => Promise.resolve()),
    dispose: mocks.filterDispose,
  }),
}));
vi.mock("./captureController", () => ({
  createCaptureController: () => ({
    init: vi.fn(() => Promise.resolve()),
    startCapture: vi.fn(() => Promise.resolve({ ok: true })),
    stopCapture: mocks.stopCapture,
    selectTab: vi.fn(() => Promise.resolve()),
    toggleCaptureEnabled: vi.fn(() => Promise.resolve()),
    handleStorageChange: mocks.handleStorageChange,
    isTabCaptured: vi.fn(() => false),
    getSelectedTabId: vi.fn(() => 12),
    syncSnapshot: mocks.syncSnapshot,
  }),
}));
vi.mock("../../ui/popup/capturedTabsView", () => ({
  createCapturedTabsView: () => ({
    render: mocks.renderCapturedTabs,
  }),
}));
vi.mock("./popupSubscriptions", () => ({
  attachPopupSubscriptions: () => ({
    connectSpectrum: mocks.connectSpectrum,
    dispose: mocks.disposeSubscriptions,
  }),
}));
vi.mock("./settingsActions", () => ({
  createSettingsActions: () => ({
    loadPointCount: vi.fn(() => Promise.resolve(3)),
    load: vi.fn(),
    shouldSkipPointCountConfirmation: vi.fn(),
    saveTheme: vi.fn(),
    saveShortcuts: vi.fn(),
    savePointCount: vi.fn(),
    saveSkipPointCountConfirmation: vi.fn(),
    saveSpectrumEnabled: vi.fn(),
    saveHideDefaultPresets: vi.fn(),
  }),
}));
vi.mock("./presetActions", () => ({
  createPresetActions: () => ({
    load: vi.fn(() =>
      Promise.resolve({
        presetNames: [],
        includeDefaultPresets: true,
      }),
    ),
    savePreset: vi.fn(),
    deletePreset: vi.fn(),
    selectPreset: vi.fn(),
    importPresets: vi.fn(),
    exportPresets: vi.fn(),
    loadAvailablePresetNames: vi.fn(),
  }),
}));
vi.mock("./ensureContentScripts", () => ({
  ensureContentScripts: mocks.ensureContentScripts,
}));
vi.mock("./autostartActions", () => ({
  createAutostartActions: () => ({
    getActiveTab: vi.fn(),
    load: vi.fn(),
    add: vi.fn(),
    remove: vi.fn(),
  }),
}));
vi.mock("../../ui/equalizerCanvas/draw/drawSpectrum", () => ({
  createSpectrumRenderer: () => ({
    setMeta: vi.fn(),
    scheduleDraw: vi.fn(),
  }),
}));
vi.mock("../../ui/popup/controlsView", () => ({
  formatGainValue: (value: number) => String(value),
  createControlsView: () => ({
    setEnableButtonClass: vi.fn(),
    setMuteButtonClass: vi.fn(),
    resetClipping: vi.fn(),
    setClipping: vi.fn(),
  }),
}));
vi.mock("../../ui/popup/presetsView", () => ({
  createPresetsView: () => ({
    renderPresetNames: vi.fn(),
    addPresetToDropdown: vi.fn(),
  }),
}));
vi.mock("../../ui/popup/autostartView", () => ({
  createAutostartView: () => ({
    init: vi.fn(() => Promise.resolve()),
    renderWhitelist: vi.fn(() => Promise.resolve()),
    refreshPresetSelects: vi.fn(() => Promise.resolve()),
  }),
}));
vi.mock("../../ui/popup/settingsView", () => ({
  createSettingsView: () => ({
    init: vi.fn(() => Promise.resolve({ pointCount: 3 })),
    getShortcutSettings: vi.fn(() => ({ mute: null, toggleEq: null })),
    setTheme: vi.fn(),
    setPointCount: vi.fn(),
  }),
}));
vi.mock("../../ui/popup/installUpdateNoticeView", () => ({
  getPendingInstallUpdateNotice: vi.fn(() => null),
  createInstallUpdateNoticeView: () => ({ showInstallUpdateNotice: vi.fn() }),
}));
vi.mock("../../ui/popup/donationReminderView", () => ({
  createDonationReminderView: () => ({ showDonationReminder: vi.fn() }),
}));
vi.mock("../../ui/popup/onboardingGuideView", () => ({
  createOnboardingGuideView: () => ({ start: vi.fn(() => Promise.resolve()) }),
}));

import type { PopupElements } from "../../ui/popup/popupElements";
import { createPopupApp } from "./createPopupApp";

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

class FakeElement {}

const createTestApp = (ready: Promise<void>, audioContext: AudioContext = {} as AudioContext) => {
  const genericElement = {
    style: {},
    classList: { add: vi.fn(), remove: vi.fn(), toggle: vi.fn() },
    className: "",
    value: "0",
    textContent: "",
  };
  const elements = new Proxy(
    {},
    {
      get: (_target, property) => {
        if (property === "eqCanvas" || property === "spectrumCanvas") {
          return {
            ...genericElement,
            getContext: () => ({}),
          };
        }
        return genericElement;
      },
    },
  ) as PopupElements;
  vi.stubGlobal("HTMLElement", FakeElement);
  vi.stubGlobal("document", {
    body: { children: [] },
    documentElement: genericElement,
  });
  vi.stubGlobal("chrome", {
    tabs: { query: vi.fn(() => Promise.resolve([{ id: 12 }])) },
    storage: {
      local: {
        get: vi.fn(() => Promise.resolve({})),
        set: vi.fn(() => Promise.resolve()),
        remove: vi.fn(() => Promise.resolve()),
      },
    },
    runtime: { getManifest: () => ({ version: "1.0.0" }) },
  });
  return createPopupApp({
    elements,
    audioContext,
    equalizerState: {
      getFilters: vi.fn(() => []),
      setPoints: vi.fn(),
      initPoints: vi.fn(),
      hasCrossoverFilters: vi.fn(() => true),
    } as never,
    localization: {
      ready,
      getMessage: (key: string) => key,
    } as never,
    readThemeColors: () => ({}) as never,
  });
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

test("dispose blocks a late popup start and releases app resources once", async () => {
  const ready = deferred();
  const app = createTestApp(ready.promise);

  const starting = app.start();
  app.dispose();
  app.dispose();
  ready.resolve();
  await starting;

  expect(mocks.connectSpectrum).not.toHaveBeenCalled();
  expect(mocks.syncSnapshot).not.toHaveBeenCalled();
  expect(mocks.disposeSubscriptions).toHaveBeenCalledOnce();
  expect(mocks.canvasCleanup).toHaveBeenCalledOnce();
  expect(mocks.filterDispose).toHaveBeenCalledOnce();
});

test("closing the popup frees only local resources and keeps capture running", async () => {
  // The popup AudioContext feeds createEqualizerCanvas only; the offscreen
  // document owns the audio graph that produces sound.
  const popupAudioContext = { close: vi.fn() } as unknown as AudioContext;
  const app = createTestApp(Promise.resolve(), popupAudioContext);
  await app.start();
  app.dispose();

  expect(mocks.stopCapture).not.toHaveBeenCalled();
  expect(mocks.canvasCleanup).toHaveBeenCalledOnce();
  expect(mocks.disposeSubscriptions).toHaveBeenCalledOnce();
  expect(popupAudioContext.close).not.toHaveBeenCalled();
});

test("connects the spectrum port for the selected tab", async () => {
  const popup = createTestApp(Promise.resolve());
  await popup.start();

  expect(mocks.connectSpectrum).toHaveBeenCalledWith(12);
  expect(mocks.handleStorageChange).toBeDefined();
  popup.dispose();
});
