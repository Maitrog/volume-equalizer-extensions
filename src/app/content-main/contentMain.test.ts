import { afterEach, describe, expect, test, vi } from "vitest";

const filters = JSON.stringify([
  { freq: 20, gain: 0, q: 0.5, type: "highpass" },
  { freq: 180, gain: 0, q: 0.5, type: "peaking" },
  { freq: 20000, gain: 0, q: 0.5, type: "lowpass" },
]);

class FakePort extends EventTarget {
  id = "eq-tools-port";
  dataset: Record<string, string> = {
    enabled: "true",
    enableSpectrum: "false",
    freqs: filters,
    mute: "false",
    preamp: "1",
  };

  remove(): void {}
}

class FakeAudioNode {
  context: FakeAudioContext;
  readonly label: string;
  connections: unknown[] = [];

  constructor(context: FakeAudioContext, label = "node") {
    this.context = context;
    this.label = label;
  }

  connect(destination: unknown): unknown {
    this.connections.push(destination);
    return destination;
  }

  disconnect(): void {
    this.connections = [];
  }
}

class FakeAudioDestinationNode extends FakeAudioNode {}

class FakeBiquadFilterNode extends FakeAudioNode {
  type: BiquadFilterType = "peaking";
  gain = { value: 0 };
  frequency = { value: 0 };
  Q = { value: 0 };
}

class FakeGainNode extends FakeAudioNode {
  gain = { value: 1 };
}

class FakeStereoPannerNode extends FakeAudioNode {
  pan = { value: 0 };
}

class FakeAnalyserNode extends FakeAudioNode {
  sampleRate = 48000;
  fftSize = 2048;
  minDecibels = -100;
  maxDecibels = -30;
  frequencyBinCount = 8;

  getFloatFrequencyData(buffer: Float32Array): void {
    buffer.fill(this.context.spectrumDb);
  }
}

class FakeAudioContext {
  sampleRate = 48000;
  destination = new FakeAudioDestinationNode(this, "destination");
  spectrumDb: number;

  constructor(spectrumDb: number) {
    this.spectrumDb = spectrumDb;
  }

  createGain(): FakeGainNode {
    return new FakeGainNode(this, "gain");
  }

  createStereoPanner(): FakeStereoPannerNode {
    return new FakeStereoPannerNode(this, "panner");
  }

  createBiquadFilter(): FakeBiquadFilterNode {
    return new FakeBiquadFilterNode(this, "biquad");
  }

  createAnalyser(): FakeAnalyserNode {
    return new FakeAnalyserNode(this, "analyser");
  }
}

const loadContentMain = async (port: FakePort): Promise<void> => {
  vi.resetModules();

  vi.stubGlobal("document", {
    getElementById: (id: string) => (id === "eq-tools-port" ? port : null),
  });
  vi.stubGlobal("window", {
    addEventListener: vi.fn(),
    Audio: class {},
  });
  vi.stubGlobal("self", globalThis.window);
  vi.stubGlobal("AudioNode", FakeAudioNode);
  vi.stubGlobal("AudioDestinationNode", FakeAudioDestinationNode);
  vi.stubGlobal("BiquadFilterNode", FakeBiquadFilterNode);
  class FakeHTMLMediaElement {
    play(): Promise<void> {
      return Promise.resolve();
    }
  }
  vi.stubGlobal("HTMLMediaElement", FakeHTMLMediaElement);
  vi.stubGlobal("setTimeout", vi.fn());
  vi.stubGlobal("setInterval", vi.fn((callback: () => void) => {
    callback();
    return 1;
  }));
  vi.stubGlobal("clearInterval", vi.fn());

  await import("./contentMain");
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("contentMain spectrum state", () => {
  const getLastSpectrumFrame = (
    frames: unknown[],
  ): { buffer?: Float32Array | null } | undefined => {
    for (let i = frames.length - 1; i >= 0; i--) {
      const frame = frames[i] as {
        type?: string;
        buffer?: Float32Array | null;
      };
      if (frame.type === "spectrum") {
        return { buffer: frame.buffer };
      }
    }

    return undefined;
  };

  test("uses the latest connected graph when spectrum is enabled", async () => {
    const port = new FakePort();
    const frames: unknown[] = [];
    port.addEventListener("spectrum-frame", (event) => {
      frames.push((event as CustomEvent).detail);
    });
    await loadContentMain(port);

    const oldContext = new FakeAudioContext(-90);
    const oldSource = new FakeAudioNode(oldContext, "old-source");
    oldSource.connect(oldContext.destination);

    const activeContext = new FakeAudioContext(-42);
    const activeSource = new FakeAudioNode(activeContext, "active-source");
    activeSource.connect(activeContext.destination);

    port.dataset.enableSpectrum = "true";
    port.dispatchEvent(new Event("spectrum-state-changed"));

    const spectrumFrame = getLastSpectrumFrame(frames);

    if (!spectrumFrame?.buffer) {
      throw new Error("Expected a spectrum frame with a buffer");
    }
    expect(spectrumFrame.buffer[0]).toBe(-42);
  });

  test("emits a clear spectrum frame when spectrum is stopped", async () => {
    const port = new FakePort();
    const frames: unknown[] = [];
    port.addEventListener("spectrum-frame", (event) => {
      frames.push((event as CustomEvent).detail);
    });
    await loadContentMain(port);

    const activeContext = new FakeAudioContext(-42);
    const activeSource = new FakeAudioNode(activeContext, "active-source");
    activeSource.connect(activeContext.destination);

    port.dataset.enableSpectrum = "true";
    port.dispatchEvent(new Event("spectrum-state-changed"));
    expect(getLastSpectrumFrame(frames)?.buffer?.[0]).toBe(-42);

    port.dataset.enableSpectrum = "false";
    port.dispatchEvent(new Event("spectrum-state-changed"));

    expect(getLastSpectrumFrame(frames)?.buffer).toBeNull();
  });
});
