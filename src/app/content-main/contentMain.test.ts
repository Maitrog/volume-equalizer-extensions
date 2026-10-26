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
    enableVolumeCompensation: "true",
    spectrumDemand: "true",
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

  disconnect(destination?: unknown): void {
    this.connections = destination
      ? this.connections.filter((connection) => connection !== destination)
      : [];
  }
}

const nativeFakeConnect = FakeAudioNode.prototype.connect;

class FakeAudioDestinationNode extends FakeAudioNode {}

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

  getFloatTimeDomainData(buffer: Float32Array): void {
    buffer.fill(this.context.peakAmplitude);
  }
}

class FakeHTMLMediaElement {
  captured = false;
  alreadyConnected = false;
  isConnected = true;
  paused = false;
  ended = false;
  currentSrc = "https://www.youtube.com/watch?v=test";
  readyState = 4;

  play(): Promise<void> {
    return Promise.resolve();
  }

  setAttribute(): void {}
}

const nativeFakePlay = FakeHTMLMediaElement.prototype.play;

class FakeMediaElementAudioSourceNode extends FakeAudioNode {
  readonly mediaElement: FakeHTMLMediaElement;

  constructor(context: FakeAudioContext, mediaElement: FakeHTMLMediaElement) {
    super(context, "media");
    this.mediaElement = mediaElement;
  }
}

class FakeAudioContext {
  sampleRate = 48000;
  destination = new FakeAudioDestinationNode(this, "destination");
  spectrumDb: number;
  peakAmplitude: number;
  closed = false;

  constructor(spectrumDb: number, peakAmplitude = 0) {
    this.spectrumDb = spectrumDb;
    this.peakAmplitude = peakAmplitude;
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

  createMediaElementSource(target: FakeHTMLMediaElement): FakeMediaElementAudioSourceNode {
    if (target.alreadyConnected) {
      throw new DOMException(
        "HTMLMediaElement already connected previously to a different MediaElementSourceNode.",
        "InvalidStateError",
      );
    }

    target.captured = true;
    return new FakeMediaElementAudioSourceNode(this, target);
  }

  close(): Promise<void> {
    this.closed = true;
    return Promise.resolve();
  }
}

let playingListener: EventListener | null = null;
let pauseListener: EventListener | null = null;
let pagehideListener: EventListener | null = null;

const dispatchPlaying = (media: FakeHTMLMediaElement): void => {
  if (!playingListener) throw new Error("Playing listener was not registered");

  playingListener({ target: media } as unknown as Event);
};

const dispatchPause = (media: FakeHTMLMediaElement): void => {
  if (!pauseListener) throw new Error("Pause listener was not registered");

  pauseListener({ target: media } as unknown as Event);
};

const dispatchPagehide = (persisted: boolean): void => {
  if (!pagehideListener) throw new Error("Pagehide listener was not registered");

  pagehideListener({ persisted } as PageTransitionEvent);
};

const loadContentMain = async (
  port: FakePort,
  media: FakeHTMLMediaElement[] = [],
): Promise<void> => {
  vi.resetModules();
  playingListener = null;
  pauseListener = null;
  pagehideListener = null;
  FakeAudioNode.prototype.connect = nativeFakeConnect;
  FakeHTMLMediaElement.prototype.play = nativeFakePlay;

  vi.stubGlobal("document", {
    getElementById: (id: string) => (id === "eq-tools-port" ? port : null),
    querySelectorAll: () => media,
  });
  vi.stubGlobal("window", {
    addEventListener: vi.fn((type: string, listener: EventListener) => {
      if (type === "playing") playingListener = listener;
      if (type === "pause") pauseListener = listener;
      if (type === "pagehide") pagehideListener = listener;
    }),
    removeEventListener: vi.fn((type: string, listener: EventListener) => {
      if (type === "playing" && playingListener === listener) playingListener = null;
      if (type === "pause" && pauseListener === listener) pauseListener = null;
      if (type === "pagehide" && pagehideListener === listener) pagehideListener = null;
    }),
    Audio: FakeHTMLMediaElement,
  });
  vi.stubGlobal("self", globalThis.window);
  vi.stubGlobal("AudioNode", FakeAudioNode);
  vi.stubGlobal("AudioDestinationNode", FakeAudioDestinationNode);
  vi.stubGlobal("BiquadFilterNode", FakeBiquadFilterNode);
  vi.stubGlobal("HTMLMediaElement", FakeHTMLMediaElement);
  vi.stubGlobal("MediaElementAudioSourceNode", FakeMediaElementAudioSourceNode);
  vi.stubGlobal("AudioContext", FakeAudioContext);
  vi.stubGlobal(
    "setTimeout",
    vi.fn((callback: () => void) => {
      callback();
      return 1;
    }),
  );
  vi.stubGlobal(
    "setInterval",
    vi.fn((callback: () => void) => {
      callback();
      return 1;
    }),
  );
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
  ): { buffer?: Float32Array | null; clipping?: boolean } | undefined => {
    for (let i = frames.length - 1; i >= 0; i--) {
      const frame = frames[i] as {
        type?: string;
        buffer?: Float32Array | null;
        clipping?: boolean;
      };
      if (frame.type === "spectrum") {
        return { buffer: frame.buffer, clipping: frame.clipping };
      }
    }

    return undefined;
  };

  test("samples only on demand and refreshes metadata for repeated demand", async () => {
    const port = new FakePort();
    port.dataset.enableSpectrum = "true";
    port.dataset.spectrumDemand = "false";
    const frames: Array<{ type?: string }> = [];
    port.addEventListener("spectrum-frame", (event) => {
      frames.push((event as CustomEvent).detail);
    });
    await loadContentMain(port);

    const context = new FakeAudioContext(-42);
    const source = new FakeAudioNode(context, "active-source");
    source.connect(context.destination);
    expect(frames.filter((message) => message.type === "meta")).toHaveLength(0);
    expect(getLastSpectrumFrame(frames)?.buffer).toBeNull();

    port.dataset.spectrumDemand = "true";
    port.dispatchEvent(new Event("spectrum-state-changed"));
    expect(frames.filter((message) => message.type === "meta")).toHaveLength(1);
    expect(getLastSpectrumFrame(frames)?.buffer?.[0]).toBe(-42);

    port.dispatchEvent(new Event("spectrum-state-changed"));
    expect(frames.filter((message) => message.type === "meta")).toHaveLength(2);
  });

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

    const activeContext = new FakeAudioContext(-42, 0.89);
    const activeSource = new FakeAudioNode(activeContext, "active-source");
    activeSource.connect(activeContext.destination);

    port.dataset.enableSpectrum = "true";
    port.dispatchEvent(new Event("spectrum-state-changed"));

    const spectrumFrame = getLastSpectrumFrame(frames);

    if (!spectrumFrame?.buffer) {
      throw new Error("Expected a spectrum frame with a buffer");
    }
    expect(spectrumFrame.buffer[0]).toBe(-42);
    expect(spectrumFrame.clipping).toBe(false);
  });

  test("keeps spectrum on playing video when paused service media attach later", async () => {
    const port = new FakePort();
    port.dataset.enableSpectrum = "true";
    const frames: unknown[] = [];
    port.addEventListener("spectrum-frame", (event) => {
      frames.push((event as CustomEvent).detail);
    });
    await loadContentMain(port);

    const videoContext = new FakeAudioContext(-42);
    const video = new FakeHTMLMediaElement();
    videoContext.createMediaElementSource(video).connect(videoContext.destination);

    [-90, -91, -92, -93].forEach((spectrumDb) => {
      const serviceContext = new FakeAudioContext(spectrumDb);
      const serviceMedia = new FakeHTMLMediaElement();
      serviceMedia.isConnected = false;
      serviceMedia.paused = true;
      serviceContext.createMediaElementSource(serviceMedia).connect(serviceContext.destination);
    });

    expect(getLastSpectrumFrame(frames)?.buffer?.[0]).toBe(-42);

    port.dataset.enabled = "false";
    port.dispatchEvent(new Event("enabled-changed"));
    port.dataset.enabled = "true";
    port.dispatchEvent(new Event("enabled-changed"));

    expect(getLastSpectrumFrame(frames)?.buffer?.[0]).toBe(-42);
  });

  test("prefers connected playing media over detached playing media", async () => {
    const port = new FakePort();
    port.dataset.enableSpectrum = "true";
    const frames: unknown[] = [];
    port.addEventListener("spectrum-frame", (event) => {
      frames.push((event as CustomEvent).detail);
    });
    await loadContentMain(port);

    const connectedContext = new FakeAudioContext(-42);
    const connectedMedia = new FakeHTMLMediaElement();
    connectedContext.createMediaElementSource(connectedMedia).connect(connectedContext.destination);

    const detachedContext = new FakeAudioContext(-70);
    const detachedMedia = new FakeHTMLMediaElement();
    detachedMedia.isConnected = false;
    detachedContext.createMediaElementSource(detachedMedia).connect(detachedContext.destination);

    expect(getLastSpectrumFrame(frames)?.buffer?.[0]).toBe(-42);
  });

  test("clears spectrum when every media source is paused or ended", async () => {
    const port = new FakePort();
    port.dataset.enableSpectrum = "true";
    const frames: unknown[] = [];
    port.addEventListener("spectrum-frame", (event) => {
      frames.push((event as CustomEvent).detail);
    });
    await loadContentMain(port);

    const pausedContext = new FakeAudioContext(-90);
    const pausedMedia = new FakeHTMLMediaElement();
    pausedMedia.paused = true;
    pausedContext.createMediaElementSource(pausedMedia).connect(pausedContext.destination);

    const endedContext = new FakeAudioContext(-91);
    const endedMedia = new FakeHTMLMediaElement();
    endedMedia.ended = true;
    endedContext.createMediaElementSource(endedMedia).connect(endedContext.destination);

    expect(getLastSpectrumFrame(frames)?.buffer).toBeNull();
  });

  test("starts spectrum for a page-owned audio graph", async () => {
    const port = new FakePort();
    port.dataset.enableSpectrum = "true";
    const frames: unknown[] = [];
    port.addEventListener("spectrum-frame", (event) => {
      frames.push((event as CustomEvent).detail);
    });
    await loadContentMain(port);

    const context = new FakeAudioContext(-42);
    const pageSource = new FakeAudioNode(context, "page-source");
    pageSource.connect(context.destination);

    expect(getLastSpectrumFrame(frames)?.buffer?.[0]).toBe(-42);
  });

  test("reports duplicate media capture as connected when the page graph is active", async () => {
    const port = new FakePort();
    const captureErrors: unknown[] = [];
    let connectedCount = 0;
    port.addEventListener("capture-error", (event) => {
      captureErrors.push((event as CustomEvent).detail);
    });
    port.addEventListener("connected", () => {
      connectedCount++;
    });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await loadContentMain(port);

    const context = new FakeAudioContext(-42);
    const pageSource = new FakeAudioNode(context, "page-source");
    pageSource.connect(context.destination);

    const media = new FakeHTMLMediaElement();
    media.alreadyConnected = true;
    dispatchPlaying(media);
    await Promise.resolve();

    expect(captureErrors).toEqual([]);
    expect(connectedCount).toBe(2);
  });

  test("reports a sample peak above -1 dBFS as clipping", async () => {
    const port = new FakePort();
    const frames: unknown[] = [];
    port.addEventListener("spectrum-frame", (event) => {
      frames.push((event as CustomEvent).detail);
    });
    await loadContentMain(port);

    const context = new FakeAudioContext(-42, 0.9);
    const source = new FakeAudioNode(context, "active-source");
    source.connect(context.destination);

    port.dataset.enableSpectrum = "true";
    port.dispatchEvent(new Event("spectrum-state-changed"));

    expect(getLastSpectrumFrame(frames)?.clipping).toBe(true);
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

  test("captures media already present when the script loads", async () => {
    const media = new FakeHTMLMediaElement();

    await loadContentMain(new FakePort(), [media]);
    await Promise.resolve();

    expect(media.captured).toBe(true);
  });

  test("waits for isolated state before capturing existing media", async () => {
    const port = new FakePort();
    delete port.dataset.enabled;
    delete port.dataset.freqs;
    const media = new FakeHTMLMediaElement();

    await loadContentMain(port, [media]);
    await Promise.resolve();

    expect(media.captured).toBe(false);

    port.dataset.enabled = "true";
    port.dataset.freqs = filters;
    port.dispatchEvent(new Event("enabled-changed"));
    await Promise.resolve();

    expect(media.captured).toBe(true);
  });

  test("reattaches an early audio node after enabled state arrives", async () => {
    const port = new FakePort();
    port.dataset.enabled = "false";
    await loadContentMain(port);
    const context = new FakeAudioContext(-42);
    const source = new FakeAudioNode(context, "early-source");
    const pageAnalyser = new FakeAnalyserNode(context, "page-analyser");

    source.connect(pageAnalyser);
    source.connect(context.destination);
    expect(source.connections).toEqual([pageAnalyser, context.destination]);

    port.dataset.enabled = "true";
    port.dispatchEvent(new Event("enabled-changed"));

    expect(source.connections.some((connection) => connection instanceof FakeGainNode)).toBe(true);
    expect(source.connections).toContain(pageAnalyser);
  });

  test("does not reduce preamp below the headroom threshold", async () => {
    const port = new FakePort();
    port.dataset.freqs = JSON.stringify([{ freq: 1000, gain: 6, q: 0.5, type: "peaking" }]);
    await loadContentMain(port);
    const context = new FakeAudioContext(-42);
    const source = new FakeAudioNode(context, "source");

    source.connect(context.destination);

    const preamp = source.connections[0] as FakeGainNode;
    expect(preamp.gain.value).toBe(1);
  });

  test("reapplies graph gain when volume compensation is toggled", async () => {
    const port = new FakePort();
    port.dataset.enableVolumeCompensation = "false";
    port.dataset.freqs = JSON.stringify(
      Array.from({ length: 4 }, (_, index) => ({
        freq: 1000 + index,
        gain: 6,
        q: 0.5,
        type: "peaking",
      })),
    );
    await loadContentMain(port);
    const context = new FakeAudioContext(-42);
    const source = new FakeAudioNode(context, "source");

    source.connect(context.destination);
    const preamp = source.connections[0] as FakeGainNode;
    expect(preamp.gain.value).toBe(1);

    port.dataset.enableVolumeCompensation = "true";
    port.dispatchEvent(new Event("volume-compensation-changed"));

    expect(preamp.gain.value).toBeCloseTo(0.49645513, 6);
  });

  test("marks the reusable main bridge as ready", async () => {
    const port = new FakePort();

    await loadContentMain(port);

    expect(port.dataset.mainReady).toBe("true");
  });
  test("disconnects and reuses its analyser when spectrum is toggled", async () => {
    const port = new FakePort();
    port.dataset.enableSpectrum = "true";
    await loadContentMain(port);
    const context = new FakeAudioContext(-42);
    const createAnalyser = vi.spyOn(context, "createAnalyser");
    const source = new FakeAudioNode(context, "source");
    source.connect(context.destination);
    let output = source;
    while (!output.connections.includes(context.destination)) {
      output = output.connections[0] as FakeAudioNode;
    }
    const analyser = createAnalyser.mock.results[0].value;
    expect(output.connections).toContain(analyser);
    port.dataset.enableSpectrum = "false";
    port.dispatchEvent(new Event("spectrum-state-changed"));
    expect(output.connections).not.toContain(analyser);
    expect(output.connections).toContain(context.destination);
    port.dataset.enableSpectrum = "true";
    port.dispatchEvent(new Event("spectrum-state-changed"));
    expect(createAnalyser).toHaveBeenCalledTimes(1);
    expect(output.connections).toContain(analyser);
  });

  test("uses one owned context for different media elements", async () => {
    const createSource = vi.spyOn(FakeAudioContext.prototype, "createMediaElementSource");
    await loadContentMain(new FakePort(), [new FakeHTMLMediaElement(), new FakeHTMLMediaElement()]);
    await Promise.resolve();
    expect(createSource).toHaveBeenCalledTimes(2);
    expect(createSource.mock.contexts[0]).toBe(createSource.mock.contexts[1]);
  });

  test.each([
    { state: "connected", detach: false },
    { state: "detached", detach: true },
  ])("reuses a media source after $state media resumes", async ({ detach }) => {
    const media = new FakeHTMLMediaElement();
    const createSource = vi.spyOn(FakeAudioContext.prototype, "createMediaElementSource");
    await loadContentMain(new FakePort(), [media]);
    await Promise.resolve();

    media.paused = true;
    media.isConnected = !detach;
    dispatchPause(media);
    media.paused = false;
    media.isConnected = true;
    dispatchPlaying(media);
    await Promise.resolve();

    expect(createSource).toHaveBeenCalledOnce();
  });

  test("captures a detached audio created through the Audio constructor", async () => {
    const createSource = vi.spyOn(FakeAudioContext.prototype, "createMediaElementSource");
    await loadContentMain(new FakePort());

    const media = new window.Audio() as unknown as FakeHTMLMediaElement;
    media.isConnected = false;
    await Promise.resolve();

    expect(createSource).toHaveBeenCalledOnce();
  });

  test("closes only its owned context on final page teardown", async () => {
    const media = new FakeHTMLMediaElement();
    const createSource = vi.spyOn(FakeAudioContext.prototype, "createMediaElementSource");
    await loadContentMain(new FakePort(), [media]);
    await Promise.resolve();
    const ownedContext = createSource.mock.contexts[0] as FakeAudioContext;

    const pageContext = new FakeAudioContext(-42);
    const pageSource = new FakeAudioNode(pageContext, "page-source");
    pageSource.connect(pageContext.destination);
    dispatchPagehide(false);

    expect(ownedContext.closed).toBe(true);
    expect(pageContext.closed).toBe(false);
  });

  test("preserves page-owned connections across equalizer toggles", async () => {
    const port = new FakePort();
    await loadContentMain(port);
    const context = new FakeAudioContext(-42);
    const source = new FakeAudioNode(context, "source");
    const pageAnalyser = new FakeAnalyserNode(context, "page-analyser");
    const pageGain = new FakeGainNode(context, "page-gain");
    source.connect(pageAnalyser);
    source.connect(pageGain);
    source.connect(context.destination);
    port.dataset.enabled = "false";
    port.dispatchEvent(new Event("enabled-changed"));
    expect(source.connections).toContain(pageAnalyser);
    expect(source.connections).toContain(pageGain);
    port.dataset.enabled = "true";
    port.dispatchEvent(new Event("enabled-changed"));
    expect(source.connections).toContain(pageAnalyser);
    expect(source.connections).toContain(pageGain);
  });
});
