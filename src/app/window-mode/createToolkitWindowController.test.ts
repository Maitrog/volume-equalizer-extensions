import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { dbToGain } from "../../domains/equalizer/equalizerMath";
import { STORAGE_KEYS } from "../../infrastructure/chrome/storageKeys";
import { createToolkitWindowController } from "./createToolkitWindowController";

class FakeClassList {
  add = vi.fn();
}

class FakeElement {
  classList = new FakeClassList();
  className = "";
  disabled = false;
  addEventListener = vi.fn();
  replaceChildren = vi.fn();
  querySelectorAll = vi.fn(() => []);
}

class FakeMediaStream {
  getTracks(): Array<{ stop(): void }> {
    return [{ stop: vi.fn() }];
  }
}

class FakeAudioNode {
  connections: unknown[] = [];

  connect(destination: unknown): unknown {
    this.connections.push(destination);
    return destination;
  }

  disconnect(destination?: unknown): void {
    this.connections = destination
      ? this.connections.filter((connection) => connection !== destination)
      : [];
  }
}

class FakeGainNode extends FakeAudioNode {
  gain = { value: 1 };
}

class FakeBiquadFilterNode extends FakeAudioNode {
  type: BiquadFilterType = "peaking";
  gain = { value: 0 };
  frequency = { value: 0 };
  Q = { value: 0 };

  getFrequencyResponse(
    _frequencies: Float32Array,
    magnitudes: Float32Array,
    phases: Float32Array,
  ): void {
    magnitudes.fill(this.gain.value > 0 ? 2 : 1);
    phases.fill(0);
  }
}

class FakeAnalyserNode extends FakeAudioNode {
  fftSize = 2048;
  minDecibels = -100;
  maxDecibels = -30;
  frequencyBinCount = 8;
  peakAmplitude = 0;
  frequencyBuffers: Float32Array[] = [];
  sampleBuffers: Float32Array[] = [];

  getFloatFrequencyData(buffer: Float32Array): void {
    this.frequencyBuffers.push(buffer);
    buffer.fill(-37);
  }

  getFloatTimeDomainData(buffer: Float32Array): void {
    this.sampleBuffers.push(buffer);
    buffer.fill(this.peakAmplitude);
  }
}

class FakeAudioContext {
  sampleRate = 44100;
  destination = new FakeAudioNode();
  createdAnalyser: FakeAnalyserNode | null = null;
  createdAnalysers: FakeAnalyserNode[] = [];
  analyserPeaks: number[] = [];
  createdSource: FakeAudioNode | null = null;
  createdSources: FakeAudioNode[] = [];

  resume = vi.fn(() => Promise.resolve());

  createMediaStreamSource(): FakeAudioNode {
    this.createdSource = new FakeAudioNode();
    this.createdSources.push(this.createdSource);
    return this.createdSource;
  }

  createGain(): FakeGainNode {
    return new FakeGainNode();
  }

  createBiquadFilter(): FakeBiquadFilterNode {
    return new FakeBiquadFilterNode();
  }

  createAnalyser(): FakeAnalyserNode {
    this.createdAnalyser = new FakeAnalyserNode();
    this.createdAnalyser.peakAmplitude = this.analyserPeaks.shift() ?? 0;
    this.createdAnalysers.push(this.createdAnalyser);
    return this.createdAnalyser;
  }
}

const createChromeStorage = () => {
  const localValues: Record<string, unknown> = {
    [STORAGE_KEYS.ENABLE_SPECTRUM]: true,
  };
  const sessionValues: Record<string, unknown> = {
    [STORAGE_KEYS.CAPTURE_ACTIVE_TAB_ID]: 123,
    [STORAGE_KEYS.TOOLKIT_WINDOW_CAPTURE_STREAM_IDS]: { 123: "stream-123" },
  };

  const getValues = (
    store: Record<string, unknown>,
    keys: string | string[] | Record<string, unknown>,
  ): Record<string, unknown> => {
    if (typeof keys === "string") {
      return { [keys]: store[keys] };
    }
    if (Array.isArray(keys)) {
      return Object.fromEntries(keys.map((key) => [key, store[key]]));
    }

    return Object.fromEntries(
      Object.entries(keys).map(([key, fallback]) => [key, store[key] ?? fallback]),
    );
  };

  return {
    local: {
      get: vi.fn((keys) => Promise.resolve(getValues(localValues, keys))),
      set: vi.fn((values: Record<string, unknown>) => {
        Object.assign(localValues, values);
        return Promise.resolve();
      }),
      remove: vi.fn((keys: string | string[]) => {
        (Array.isArray(keys) ? keys : [keys]).forEach((key) => {
          delete localValues[key];
        });
        return Promise.resolve();
      }),
    },
    session: {
      get: vi.fn((keys) => Promise.resolve(getValues(sessionValues, keys))),
      set: vi.fn((values: Record<string, unknown>) => {
        Object.assign(sessionValues, values);
        return Promise.resolve();
      }),
    },
    localValues,
    sessionValues,
  };
};

const createController = (
  deps: Partial<Parameters<typeof createToolkitWindowController>[0]> = {},
) => {
  const audioContext = new FakeAudioContext();

  const controller = createToolkitWindowController({
    body: new FakeElement() as unknown as HTMLElement,
    capturedTabs: new FakeElement() as unknown as HTMLElement,
    audioContext: audioContext as unknown as AudioContext,
    getPointCount: () => Promise.resolve(3),
    getFilters: () => [{ type: "peaking", freq: 1000, gain: 0, q: 0.5 }],
    setFilters: vi.fn(),
    initPoints: vi.fn(),
    resize: vi.fn(),
    setEnableButtonClass: vi.fn(),
    setMuteButtonClass: vi.fn(),
    renderCaptureError: vi.fn(),
    getGainValue: () => 0,
    setGainValue: vi.fn(),
    isMuted: () => false,
    getMessage: (messageName) => messageName,
    ...deps,
  });

  return { controller, audioContext };
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("createToolkitWindowController spectrum", () => {
  test("does not start a local sampler after capture demand is disposed", async () => {
    const storage = createChromeStorage();
    const renderCaptureError = vi.fn();
    let resolveStream!: (stream: FakeMediaStream) => void;
    const getUserMedia = vi.fn(
      () =>
        new Promise<FakeMediaStream>((resolve) => {
          resolveStream = resolve;
        }),
    );
    vi.stubGlobal("window", {
      location: { search: "?mode=window" },
      addEventListener: vi.fn(),
    });
    vi.stubGlobal("document", {
      createElement: () => new FakeElement(),
    });
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
    vi.stubGlobal("chrome", { storage });
    vi.stubGlobal(
      "setInterval",
      vi.fn(() => 1),
    );
    vi.stubGlobal("clearInterval", vi.fn());
    const { controller } = createController({ renderCaptureError });

    const started = controller.startTabCapture();
    await vi.waitFor(() => expect(getUserMedia).toHaveBeenCalled());
    controller.stopTabCapture();
    resolveStream(new FakeMediaStream());
    await started;

    expect(setInterval).not.toHaveBeenCalled();
    expect(renderCaptureError).not.toHaveBeenCalled();
  });

  test("ignores a stale stream snapshot while allowing the same stream in a fresh start", async () => {
    const storage = createChromeStorage();
    storage.sessionValues[STORAGE_KEYS.TOOLKIT_WINDOW_CAPTURE_STREAM_IDS] = {
      123: "stream-a",
    };
    const originalSessionGet = storage.session.get.getMockImplementation();
    let captureReads = 0;
    let resolveStaleSnapshot!: (value: Record<string, unknown>) => void;
    storage.session.get.mockImplementation((keys) => {
      if (keys !== STORAGE_KEYS.TOOLKIT_WINDOW_CAPTURE_STREAM_IDS) {
        return originalSessionGet?.(keys) ?? Promise.resolve({});
      }

      captureReads += 1;
      const snapshot = {
        [STORAGE_KEYS.TOOLKIT_WINDOW_CAPTURE_STREAM_IDS]: {
          ...(storage.sessionValues[STORAGE_KEYS.TOOLKIT_WINDOW_CAPTURE_STREAM_IDS] as Record<
            string,
            string
          >),
        },
      };
      if (captureReads === 1) {
        return new Promise((resolve) => {
          resolveStaleSnapshot = resolve;
        });
      }
      return Promise.resolve(snapshot);
    });
    const getUserMedia = vi.fn(() => Promise.resolve(new FakeMediaStream()));

    vi.stubGlobal("window", {
      location: { search: "?mode=window" },
      addEventListener: vi.fn(),
    });
    vi.stubGlobal("document", {
      createElement: () => new FakeElement(),
    });
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
    vi.stubGlobal("chrome", { storage });
    vi.stubGlobal(
      "setInterval",
      vi.fn(() => 1),
    );
    vi.stubGlobal("clearInterval", vi.fn());
    const { controller, audioContext } = createController();

    const staleStart = controller.startTabCapture();
    await vi.waitFor(() => expect(captureReads).toBe(1));

    storage.sessionValues[STORAGE_KEYS.TOOLKIT_WINDOW_CAPTURE_STREAM_IDS] = {
      123: "stream-b",
    };
    await controller.startTabCapture();
    resolveStaleSnapshot({
      [STORAGE_KEYS.TOOLKIT_WINDOW_CAPTURE_STREAM_IDS]: { 123: "stream-a" },
    });
    await staleStart;

    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(getUserMedia).toHaveBeenLastCalledWith({
      audio: {
        mandatory: {
          chromeMediaSource: "tab",
          chromeMediaSourceId: "stream-b",
        },
      },
      video: false,
    });
    expect(audioContext.createdSources).toHaveLength(1);

    storage.sessionValues[STORAGE_KEYS.TOOLKIT_WINDOW_CAPTURE_STREAM_IDS] = {
      123: "stream-a",
    };
    await controller.startTabCapture();

    expect(getUserMedia).toHaveBeenCalledTimes(2);
    expect(getUserMedia).toHaveBeenLastCalledWith({
      audio: {
        mandatory: {
          chromeMediaSource: "tab",
          chromeMediaSourceId: "stream-a",
        },
      },
      video: false,
    });
    expect(audioContext.createdSources).toHaveLength(2);
  });

  test("does not restore a capture from a start invalidated by stopping that tab", async () => {
    const storage = createChromeStorage();
    storage.sessionValues[STORAGE_KEYS.TOOLKIT_WINDOW_TAB_IDS] = [123];
    const originalSessionGet = storage.session.get.getMockImplementation();
    let resolveStreamSnapshot!: (value: Record<string, unknown>) => void;
    storage.session.get.mockImplementation((keys) => {
      if (keys === STORAGE_KEYS.TOOLKIT_WINDOW_CAPTURE_STREAM_IDS) {
        return new Promise((resolve) => {
          resolveStreamSnapshot = resolve;
        });
      }
      return originalSessionGet?.(keys) ?? Promise.resolve({});
    });
    const getUserMedia = vi.fn(() => Promise.resolve(new FakeMediaStream()));

    vi.stubGlobal("window", {
      location: { search: "?mode=window" },
      addEventListener: vi.fn(),
    });
    vi.stubGlobal("document", {
      createElement: () => new FakeElement(),
    });
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
    vi.stubGlobal("chrome", {
      storage,
      runtime: { sendMessage: vi.fn(async () => ({ tabs: [], activeTabId: null })) },
    });
    vi.stubGlobal(
      "setInterval",
      vi.fn(() => 1),
    );
    vi.stubGlobal("clearInterval", vi.fn());
    const { controller } = createController();

    const staleStart = controller.startTabCapture();
    await vi.waitFor(() => expect(resolveStreamSnapshot).toBeTypeOf("function"));
    await controller.stopCapturedTabCapture(123);
    resolveStreamSnapshot({
      [STORAGE_KEYS.TOOLKIT_WINDOW_CAPTURE_STREAM_IDS]: { 123: "stream-123" },
    });
    await staleStart;

    expect(getUserMedia).not.toHaveBeenCalled();
    expect(controller.hasCapture(123)).toBe(false);
  });

  test("keeps manual gain unchanged below the headroom threshold", async () => {
    const storage = createChromeStorage();
    storage.localValues[STORAGE_KEYS.tabGain(123)] = 6;

    vi.stubGlobal("window", {
      location: { search: "?mode=window" },
      addEventListener: vi.fn(),
    });
    vi.stubGlobal("document", {
      createElement: () => new FakeElement(),
    });
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getUserMedia: vi.fn(() => Promise.resolve(new FakeMediaStream())),
      },
    });
    vi.stubGlobal("chrome", { storage });
    vi.stubGlobal(
      "setInterval",
      vi.fn(() => 1),
    );
    vi.stubGlobal("clearInterval", vi.fn());

    const { controller, audioContext } = createController({
      getGainValue: () => 6,
      getFilters: () => [{ type: "peaking", freq: 1000, gain: 6, q: 0.5 }],
    });

    await controller.startTabCapture();

    const preamp = audioContext.createdSource?.connections[0] as FakeGainNode;
    expect(preamp.gain.value).toBeCloseTo(1.973822685184001, 10);
  });

  test("updates active captures when volume compensation changes", async () => {
    const storage = createChromeStorage();
    storage.localValues[STORAGE_KEYS.ENABLE_VOLUME_COMPENSATION] = false;

    vi.stubGlobal("window", {
      location: { search: "?mode=window" },
      addEventListener: vi.fn(),
    });
    vi.stubGlobal("document", {
      createElement: () => new FakeElement(),
    });
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getUserMedia: vi.fn(() => Promise.resolve(new FakeMediaStream())),
      },
    });
    vi.stubGlobal("chrome", { storage });
    vi.stubGlobal(
      "setInterval",
      vi.fn(() => 1),
    );
    vi.stubGlobal("clearInterval", vi.fn());

    const boostedFilters = Array.from({ length: 4 }, (_, index) => ({
      type: "peaking" as const,
      freq: 1000 + index,
      gain: 6,
      q: 0.5,
    }));
    const { controller, audioContext } = createController({
      getFilters: () => boostedFilters,
    });

    await controller.startTabCapture();

    const preamp = audioContext.createdSource?.connections[0] as FakeGainNode;
    expect(preamp.gain.value).toBe(1);

    await controller.handleStorageChange({
      [STORAGE_KEYS.ENABLE_VOLUME_COMPENSATION]: {
        oldValue: false,
        newValue: true,
      },
    });

    expect(preamp.gain.value).toBeCloseTo(0.49645513, 6);
  });

  test("does not add disabled crossover filters to the capture graph", async () => {
    const storage = createChromeStorage();

    vi.stubGlobal("window", {
      location: { search: "?mode=window" },
      addEventListener: vi.fn(),
    });
    vi.stubGlobal("document", {
      createElement: () => new FakeElement(),
    });
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getUserMedia: vi.fn(() => Promise.resolve(new FakeMediaStream())),
      },
    });
    vi.stubGlobal("chrome", { storage });
    vi.stubGlobal(
      "setInterval",
      vi.fn(() => 1),
    );
    vi.stubGlobal("clearInterval", vi.fn());

    const { controller, audioContext } = createController({
      getFilters: () => [
        { type: "highpass", freq: 20, gain: 0, q: 0.5, enabled: false },
        { type: "peaking", freq: 1000, gain: 3, q: 0.5 },
        { type: "lowpass", freq: 20000, gain: 0, q: 0.5, enabled: false },
      ],
    });

    await controller.startTabCapture();

    const preamp = audioContext.createdSource?.connections[0] as FakeGainNode;
    const filter = preamp.connections[0] as FakeBiquadFilterNode;
    expect(filter.type).toBe("peaking");
    expect(filter.connections).toContain(audioContext.destination);
  });

  test("bypasses filters without stopping captured audio when disabled", async () => {
    const storage = createChromeStorage();
    storage.localValues[STORAGE_KEYS.tabGain(123)] = 6;
    const setEnableButtonClass = vi.fn();

    vi.stubGlobal("window", {
      location: { search: "?mode=window" },
      addEventListener: vi.fn(),
    });
    vi.stubGlobal("document", {
      createElement: () => new FakeElement(),
    });
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getUserMedia: vi.fn(() => Promise.resolve(new FakeMediaStream())),
      },
    });
    vi.stubGlobal("chrome", { storage });
    vi.stubGlobal(
      "setInterval",
      vi.fn(() => 1),
    );
    vi.stubGlobal("clearInterval", vi.fn());

    const { controller, audioContext } = createController({
      setEnableButtonClass,
      getGainValue: () => 6,
    });

    await controller.startTabCapture();
    const filteredPreamp = audioContext.createdSource?.connections[0] as FakeGainNode;
    expect(filteredPreamp.gain.value).toBeCloseTo(dbToGain(6));
    expect(filteredPreamp.connections[0]).toBeInstanceOf(FakeBiquadFilterNode);
    expect(setEnableButtonClass).toHaveBeenLastCalledWith(true);

    controller.toggleEqualizer();

    const bypassPreamp = audioContext.createdSource?.connections[0] as FakeGainNode;
    expect(bypassPreamp.gain.value).toBe(1);
    expect(bypassPreamp.connections).toContain(audioContext.destination);
    expect(
      bypassPreamp.connections.some((connection) => connection instanceof FakeBiquadFilterNode),
    ).toBe(false);
    expect(setEnableButtonClass).toHaveBeenLastCalledWith(false);

    controller.setCaptureMuted(123, true);
    expect(bypassPreamp.gain.value).toBe(0);
    controller.setCaptureMuted(123, false);
    expect(bypassPreamp.gain.value).toBe(1);

    setEnableButtonClass.mockClear();
    await controller.loadTabSettings(123);
    expect(setEnableButtonClass).toHaveBeenCalledWith(false);

    controller.toggleEqualizer();
    const restoredPreamp = audioContext.createdSource?.connections[0] as FakeGainNode;
    expect(restoredPreamp.gain.value).toBeCloseTo(dbToGain(6));
    expect(restoredPreamp.connections[0]).toBeInstanceOf(FakeBiquadFilterNode);
    expect(setEnableButtonClass).toHaveBeenLastCalledWith(true);
  });

  test("preserves independent enabled state for captured tabs", async () => {
    const storage = createChromeStorage();
    storage.sessionValues[STORAGE_KEYS.TOOLKIT_WINDOW_CAPTURE_STREAM_IDS] = {
      123: "stream-123",
      456: "stream-456",
    };
    const setEnableButtonClass = vi.fn();

    vi.stubGlobal("window", {
      location: { search: "?mode=window" },
      addEventListener: vi.fn(),
    });
    vi.stubGlobal("document", {
      createElement: () => new FakeElement(),
    });
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getUserMedia: vi.fn(() => Promise.resolve(new FakeMediaStream())),
      },
    });
    vi.stubGlobal("chrome", { storage });
    vi.stubGlobal(
      "setInterval",
      vi.fn(() => 1),
    );
    vi.stubGlobal("clearInterval", vi.fn());

    const { controller } = createController({ setEnableButtonClass });

    await controller.startTabCapture();
    expect(controller.hasCapture(123)).toBe(true);
    expect(controller.hasCapture(999)).toBe(false);
    controller.toggleEqualizer();

    setEnableButtonClass.mockClear();
    await controller.loadTabSettings(456);
    expect(setEnableButtonClass).toHaveBeenLastCalledWith(true);

    setEnableButtonClass.mockClear();
    controller.toggleEqualizer(123);
    expect(setEnableButtonClass).not.toHaveBeenCalled();

    await controller.loadTabSettings(123);
    expect(setEnableButtonClass).toHaveBeenLastCalledWith(true);
  });

  test("applies mute and gain to the targeted capture without reading active UI", async () => {
    const storage = createChromeStorage();
    storage.sessionValues[STORAGE_KEYS.TOOLKIT_WINDOW_CAPTURE_STREAM_IDS] = {
      123: "stream-123",
      456: "stream-456",
    };
    storage.localValues[STORAGE_KEYS.tabGain(456)] = 6;
    storage.localValues[STORAGE_KEYS.tabMute(456)] = true;

    vi.stubGlobal("window", {
      location: { search: "?mode=window" },
      addEventListener: vi.fn(),
    });
    vi.stubGlobal("document", {
      createElement: () => new FakeElement(),
    });
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getUserMedia: vi.fn(() => Promise.resolve(new FakeMediaStream())),
      },
    });
    vi.stubGlobal("chrome", { storage });
    vi.stubGlobal(
      "setInterval",
      vi.fn(() => 1),
    );
    vi.stubGlobal("clearInterval", vi.fn());

    const { controller, audioContext } = createController({
      getGainValue: () => 0,
      isMuted: () => false,
    });

    await controller.startTabCapture();
    const targetSource = audioContext.createdSources[1];
    const mutedPreamp = targetSource.connections[0] as FakeGainNode;
    expect(mutedPreamp.gain.value).toBe(0);

    controller.setCaptureMuted(456, false);
    const unmutedPreamp = targetSource.connections[0] as FakeGainNode;
    expect(unmutedPreamp.gain.value).toBeCloseTo(dbToGain(6));
  });

  test("emits spectrum meta and frames from the active captured tab", async () => {
    const spectrumMeta: unknown[] = [];
    const spectrumFrames: Array<Float32Array | null> = [];
    const storage = createChromeStorage();

    vi.stubGlobal("window", {
      location: { search: "?mode=window" },
      addEventListener: vi.fn(),
    });
    vi.stubGlobal("document", {
      createElement: () => new FakeElement(),
    });
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getUserMedia: vi.fn(() => Promise.resolve(new FakeMediaStream())),
      },
    });
    vi.stubGlobal("chrome", { storage });
    vi.stubGlobal(
      "setInterval",
      vi.fn((callback: () => void) => {
        callback();
        return 1;
      }),
    );
    vi.stubGlobal("clearInterval", vi.fn());

    const { controller, audioContext } = createController({
      onSpectrumMeta: (meta) => spectrumMeta.push(meta),
      onSpectrumFrame: (buffer) => spectrumFrames.push(buffer),
    });

    await controller.startTabCapture();

    expect(audioContext.createdAnalyser).not.toBeNull();
    expect(spectrumMeta).toContainEqual({
      type: "meta",
      sampleRate: 44100,
      fftSize: 2048,
      minDb: -100,
      maxDb: -30,
      frequencyBinCount: 8,
    });
    expect(spectrumFrames.at(-1)?.[0]).toBe(-37);
  });

  test("reports clipping only for the active captured tab", async () => {
    const clippingStates: Array<boolean | undefined> = [];
    const storage = createChromeStorage();
    storage.sessionValues[STORAGE_KEYS.TOOLKIT_WINDOW_CAPTURE_STREAM_IDS] = {
      123: "stream-123",
      456: "stream-456",
    };

    vi.stubGlobal("window", {
      location: { search: "?mode=window" },
      addEventListener: vi.fn(),
    });
    vi.stubGlobal("document", {
      createElement: () => new FakeElement(),
    });
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getUserMedia: vi.fn(() => Promise.resolve(new FakeMediaStream())),
      },
    });
    vi.stubGlobal("chrome", {
      storage,
      runtime: {
        sendMessage: vi.fn(() => Promise.resolve({ tabs: [], activeTabId: 456 })),
      },
    });
    vi.stubGlobal(
      "setInterval",
      vi.fn((callback: () => void) => {
        callback();
        return 1;
      }),
    );
    vi.stubGlobal("clearInterval", vi.fn());

    const { controller, audioContext } = createController({
      onSpectrumFrame: (_buffer, clipping) => clippingStates.push(clipping),
    });
    audioContext.analyserPeaks.push(0.2);

    await controller.startTabCapture();
    expect(clippingStates.at(-1)).toBe(false);

    if (!audioContext.createdAnalyser) {
      throw new Error("Expected a spectrum analyser");
    }
    audioContext.createdAnalyser.peakAmplitude = 0.95;
    storage.sessionValues[STORAGE_KEYS.CAPTURE_ACTIVE_TAB_ID] = 456;
    await controller.handleStorageChange({
      [STORAGE_KEYS.CAPTURE_ACTIVE_TAB_ID]: {
        oldValue: 123,
        newValue: 456,
      },
    });

    expect(clippingStates.slice(-2)).toEqual([false, true]);
  });

  test("clears spectrum frames when spectrum is disabled", async () => {
    const spectrumFrames: Array<Float32Array | null> = [];
    const storage = createChromeStorage();

    vi.stubGlobal("window", {
      location: { search: "?mode=window" },
      addEventListener: vi.fn(),
    });
    vi.stubGlobal("document", {
      createElement: () => new FakeElement(),
    });
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getUserMedia: vi.fn(() => Promise.resolve(new FakeMediaStream())),
      },
    });
    vi.stubGlobal("chrome", { storage });
    vi.stubGlobal(
      "setInterval",
      vi.fn((callback: () => void) => {
        callback();
        return 1;
      }),
    );
    vi.stubGlobal("clearInterval", vi.fn());

    const { controller } = createController({
      onSpectrumFrame: (buffer) => spectrumFrames.push(buffer),
    });

    await controller.startTabCapture();
    expect(spectrumFrames.at(-1)?.[0]).toBe(-37);

    await controller.handleStorageChange({
      [STORAGE_KEYS.ENABLE_SPECTRUM]: {
        oldValue: true,
        newValue: false,
      },
    });

    expect(clearInterval).toHaveBeenCalledWith(1);
    expect(spectrumFrames.at(-1)).toBeNull();
  });

  test("disconnects only its analyser when spectrum is disabled", async () => {
    const storage = createChromeStorage();

    vi.stubGlobal("window", {
      location: { search: "?mode=window" },
      addEventListener: vi.fn(),
    });
    vi.stubGlobal("document", {
      createElement: () => new FakeElement(),
    });
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getUserMedia: vi.fn(() => Promise.resolve(new FakeMediaStream())),
      },
    });
    vi.stubGlobal("chrome", { storage });
    vi.stubGlobal(
      "setInterval",
      vi.fn(() => 1),
    );
    vi.stubGlobal("clearInterval", vi.fn());

    const { controller, audioContext } = createController();
    await controller.startTabCapture();
    const output = (audioContext.createdSource?.connections[0] as FakeGainNode)
      .connections[0] as FakeAudioNode;
    const analyser = audioContext.createdAnalyser;
    const disconnect = vi.spyOn(output, "disconnect");

    await controller.handleStorageChange({
      [STORAGE_KEYS.ENABLE_SPECTRUM]: {
        oldValue: true,
        newValue: false,
      },
    });

    expect(disconnect).toHaveBeenCalledOnce();
    expect(disconnect).toHaveBeenCalledWith(analyser);
    expect(disconnect).not.toHaveBeenCalledWith();
    expect(output.connections).toEqual([audioContext.destination]);
  });

  test("switches active captures using one analyser", async () => {
    const storage = createChromeStorage();
    storage.sessionValues[STORAGE_KEYS.TOOLKIT_WINDOW_CAPTURE_STREAM_IDS] = {
      123: "stream-123",
      456: "stream-456",
    };

    vi.stubGlobal("window", {
      location: { search: "?mode=window" },
      addEventListener: vi.fn(),
    });
    vi.stubGlobal("document", {
      createElement: () => new FakeElement(),
    });
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getUserMedia: vi.fn(() => Promise.resolve(new FakeMediaStream())),
      },
    });
    vi.stubGlobal("chrome", {
      storage,
      runtime: {
        sendMessage: vi.fn(() => Promise.resolve({ tabs: [], activeTabId: 456 })),
      },
    });
    vi.stubGlobal(
      "setInterval",
      vi.fn(() => 1),
    );
    vi.stubGlobal("clearInterval", vi.fn());

    const { controller, audioContext } = createController();
    await controller.startTabCapture();
    const firstOutput = (audioContext.createdSources[0].connections[0] as FakeGainNode)
      .connections[0] as FakeAudioNode;
    const secondOutput = (audioContext.createdSources[1].connections[0] as FakeGainNode)
      .connections[0] as FakeAudioNode;
    const analyser = audioContext.createdAnalyser;

    storage.sessionValues[STORAGE_KEYS.CAPTURE_ACTIVE_TAB_ID] = 456;
    await controller.handleStorageChange({
      [STORAGE_KEYS.CAPTURE_ACTIVE_TAB_ID]: {
        oldValue: 123,
        newValue: 456,
      },
    });

    expect(audioContext.createdAnalysers).toHaveLength(1);
    expect(firstOutput.connections).toEqual([audioContext.destination]);
    expect(secondOutput.connections).toContain(audioContext.destination);
    expect(secondOutput.connections).toContain(analyser);
  });

  test("reuses spectrum buffers between ticks", async () => {
    const storage = createChromeStorage();
    const ticks: Array<() => void> = [];
    const frames: Array<Float32Array | null> = [];

    vi.stubGlobal("window", {
      location: { search: "?mode=window" },
      addEventListener: vi.fn(),
    });
    vi.stubGlobal("document", {
      createElement: () => new FakeElement(),
    });
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getUserMedia: vi.fn(() => Promise.resolve(new FakeMediaStream())),
      },
    });
    vi.stubGlobal("chrome", { storage });
    vi.stubGlobal(
      "setInterval",
      vi.fn((tick: () => void) => {
        ticks.push(tick);
        return ticks.length;
      }),
    );
    vi.stubGlobal("clearInterval", vi.fn());

    const { controller, audioContext } = createController({
      onSpectrumFrame: (buffer) => frames.push(buffer),
    });
    await controller.startTabCapture();
    ticks[0]();
    ticks[0]();

    const spectrumFrames = frames.filter(
      (frame): frame is Float32Array => frame instanceof Float32Array,
    );
    expect(spectrumFrames).toHaveLength(2);
    expect(spectrumFrames[0]).toBe(spectrumFrames[1]);
    expect(audioContext.createdAnalyser?.frequencyBuffers[0]).toBe(
      audioContext.createdAnalyser?.frequencyBuffers[1],
    );
    expect(audioContext.createdAnalyser?.sampleBuffers[0]).toBe(
      audioContext.createdAnalyser?.sampleBuffers[1],
    );
  });

  test("stops the active sampler before rebuilding its graph", async () => {
    const storage = createChromeStorage();

    vi.stubGlobal("window", {
      location: { search: "?mode=window" },
      addEventListener: vi.fn(),
    });
    vi.stubGlobal("document", {
      createElement: () => new FakeElement(),
    });
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getUserMedia: vi.fn(() => Promise.resolve(new FakeMediaStream())),
      },
    });
    vi.stubGlobal("chrome", { storage });
    vi.stubGlobal(
      "setInterval",
      vi.fn(() => 1),
    );
    vi.stubGlobal("clearInterval", vi.fn());

    const { controller, audioContext } = createController();
    await controller.startTabCapture();
    const output = (audioContext.createdSource?.connections[0] as FakeGainNode)
      .connections[0] as FakeAudioNode;
    const analyser = audioContext.createdAnalyser;
    const disconnect = vi.spyOn(output, "disconnect");

    controller.toggleEqualizer();

    expect(disconnect).toHaveBeenNthCalledWith(1, analyser);
    expect(disconnect).toHaveBeenNthCalledWith(2);
  });

  test("keeps the active spectrum timer running when capture settings refresh", async () => {
    const storage = createChromeStorage();

    vi.stubGlobal("window", {
      location: { search: "?mode=window" },
      addEventListener: vi.fn(),
    });
    vi.stubGlobal("document", {
      createElement: () => new FakeElement(),
    });
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getUserMedia: vi.fn(() => Promise.resolve(new FakeMediaStream())),
      },
    });
    vi.stubGlobal("chrome", { storage });
    vi.stubGlobal(
      "setInterval",
      vi.fn((callback: () => void) => {
        callback();
        return 1;
      }),
    );
    vi.stubGlobal("clearInterval", vi.fn());

    const { controller } = createController();

    await controller.startTabCapture();
    vi.mocked(setInterval).mockClear();
    vi.mocked(clearInterval).mockClear();

    controller.refreshCaptureFilters(123);

    expect(setInterval).not.toHaveBeenCalled();
    expect(clearInterval).not.toHaveBeenCalled();
  });

  test("keeps the bypass graph intact when capture settings refresh", async () => {
    const storage = createChromeStorage();

    vi.stubGlobal("window", {
      location: { search: "?mode=window" },
      addEventListener: vi.fn(),
    });
    vi.stubGlobal("document", {
      createElement: () => new FakeElement(),
    });
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getUserMedia: vi.fn(() => Promise.resolve(new FakeMediaStream())),
      },
    });
    vi.stubGlobal("chrome", { storage });
    vi.stubGlobal(
      "setInterval",
      vi.fn(() => 1),
    );
    vi.stubGlobal("clearInterval", vi.fn());

    const { controller, audioContext } = createController();

    await controller.startTabCapture();
    controller.toggleEqualizer();
    const bypassPreamp = audioContext.createdSource?.connections[0] as FakeGainNode;
    vi.mocked(setInterval).mockClear();
    vi.mocked(clearInterval).mockClear();

    controller.refreshCaptureFilters();

    expect(audioContext.createdSource?.connections[0]).toBe(bypassPreamp);
    expect(setInterval).not.toHaveBeenCalled();
    expect(clearInterval).not.toHaveBeenCalled();
  });

  test("restarts spectrum with the same analyser after rebuilding the active graph", async () => {
    const storage = createChromeStorage();
    let filters = [{ type: "peaking" as const, freq: 1000, gain: 0, q: 0.5 }];

    vi.stubGlobal("window", {
      location: { search: "?mode=window" },
      addEventListener: vi.fn(),
    });
    vi.stubGlobal("document", {
      createElement: () => new FakeElement(),
    });
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getUserMedia: vi.fn(() => Promise.resolve(new FakeMediaStream())),
      },
    });
    vi.stubGlobal("chrome", { storage });
    vi.stubGlobal(
      "setInterval",
      vi.fn((callback: () => void) => {
        callback();
        return 1;
      }),
    );
    vi.stubGlobal("clearInterval", vi.fn());

    const { controller, audioContext } = createController({
      getFilters: () => filters,
    });

    await controller.startTabCapture();
    const firstAnalyser = audioContext.createdAnalyser;
    vi.mocked(setInterval).mockClear();
    vi.mocked(clearInterval).mockClear();

    filters = [
      { type: "peaking", freq: 500, gain: 0, q: 0.5 },
      { type: "peaking", freq: 1000, gain: 0, q: 0.5 },
    ];
    controller.refreshCaptureFilters(123);

    expect(audioContext.createdAnalyser).toBe(firstAnalyser);
    expect(audioContext.createdAnalysers).toHaveLength(1);
    expect(clearInterval).toHaveBeenCalledWith(1);
    expect(setInterval).toHaveBeenCalledTimes(1);
  });

  test("removes one captured tab from window capture storage", async () => {
    const storage = createChromeStorage();
    storage.sessionValues[STORAGE_KEYS.TOOLKIT_WINDOW_TAB_IDS] = [123, 456];
    storage.sessionValues[STORAGE_KEYS.TOOLKIT_WINDOW_CAPTURE_STREAM_IDS] = {
      123: "stream-123",
      456: "stream-456",
    };

    vi.stubGlobal("window", {
      location: { search: "?mode=window" },
      addEventListener: vi.fn(),
    });
    vi.stubGlobal("document", {
      createElement: () => new FakeElement(),
    });
    vi.stubGlobal("chrome", {
      storage,
      runtime: { sendMessage: vi.fn(async () => ({ tabs: [], activeTabId: null })) },
    });

    const { controller } = createController();

    await controller.stopCapturedTabCapture(123);

    expect(storage.session.set).toHaveBeenCalledWith({
      [STORAGE_KEYS.TOOLKIT_WINDOW_TAB_IDS]: [456],
      [STORAGE_KEYS.CAPTURE_ACTIVE_TAB_ID]: 456,
      [STORAGE_KEYS.TOOLKIT_WINDOW_CAPTURE_STREAM_IDS]: {
        456: "stream-456",
      },
    });
  });
});

beforeEach(() => {
  vi.stubGlobal("HTMLElement", FakeElement);
  vi.stubGlobal("document", { activeElement: null });
});
