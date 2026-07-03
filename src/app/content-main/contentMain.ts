import {
  applyBiquadSettings,
  createBiquadFilter,
  getBiquadFilterCount,
  getLastBiquadFilter,
} from "../../domains/audio/biquadChain";

import type { EqualizerFilter } from "../../domains/equalizer/types";

interface EqualizerNodeChain extends Record<number, BiquadFilterNode | undefined> {
  preamp: GainNode;
  balance: StereoPannerNode;
}

interface CapturedMediaSource {
  context: AudioContext;
  source: MediaElementAudioSourceNode;
}

type AnalyserWithLegacySampleRate = AnalyserNode & { sampleRate?: number };
type CapturableMediaElement = HTMLMediaElement & {
  captureStream?: () => MediaStream;
};

const port = document.getElementById("eq-tools-port") as HTMLSpanElement;
port.remove();

const equalizerGraphs = new Map<AudioNode, EqualizerNodeChain>();
let currentAudioCtx: AudioContext | null = null;
let currentSourceNode: AudioNode | null = null;
let analyser: AnalyserWithLegacySampleRate | null = null;
let spectrumTimer: ReturnType<typeof setInterval> | null = null;
const mediaSources = new WeakMap<HTMLMediaElement, CapturedMediaSource>();
const pendingMedia = new WeakSet<HTMLMediaElement>();
const cachedMedia = new Set<HTMLMediaElement>();

const nativeConnect = AudioNode.prototype.connect;

const getAudioContext = (source: AudioNode): AudioContext =>
  source.context as AudioContext;

const connectToDestination = (
  source: AudioNode,
  destination: AudioDestinationNode,
): AudioNode => Reflect.apply(nativeConnect, source, [destination]) as AudioNode;

const readFilterSettings = (): EqualizerFilter[] =>
  JSON.parse(port.dataset.freqs as string) as EqualizerFilter[];

const getErrorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error && error.message ? error.message : fallback;

const rebuildBiquadChain = (
  source: AudioNode,
  filters: EqualizerNodeChain,
  filterSettings: EqualizerFilter[],
): void => {
  filters.balance.disconnect();

  const oldCount = getBiquadFilterCount(filters);
  for (let i = 0; i < oldCount; i++) {
    filters[i]?.disconnect();
    delete filters[i];
  }

  const context = getAudioContext(source);
  let previousNode: AudioNode = filters.balance;
  filterSettings.forEach((filter, i) => {
    const biquadFilter = createBiquadFilter(context, filter);
    previousNode.connect(biquadFilter);
    filters[i] = biquadFilter;
    previousNode = biquadFilter;
  });

  connectToDestination(previousNode, context.destination);
};

const startSpectrum = (): void => {
  const audioCtx = currentAudioCtx;
  const sourceNode = currentSourceNode;
  const currentAnalyser = ensureAnalyser(audioCtx, sourceNode);

  if (!audioCtx || !sourceNode || !currentAnalyser) {
    return;
  }

  let payload: Record<string, unknown> = {
    type: "meta",
    sampleRate: audioCtx.sampleRate,
    fftSize: currentAnalyser.fftSize,
    minDb: currentAnalyser.minDecibels,
    maxDb: currentAnalyser.maxDecibels,
    frequencyBinCount: currentAnalyser.frequencyBinCount,
  };
  port.dispatchEvent(
    new CustomEvent("spectrum-frame", {
      detail: { ...payload },
      bubbles: true,
      composed: true,
    }),
  );

  if (spectrumTimer) clearInterval(spectrumTimer);
  spectrumTimer = setInterval(() => {
    if (!currentAnalyser) return;

    const buffer = new Float32Array(currentAnalyser.frequencyBinCount);
    currentAnalyser.getFloatFrequencyData(buffer);

    payload = {
      type: "spectrum",
      buffer,
    };
    port.dispatchEvent(
      new CustomEvent("spectrum-frame", {
        detail: { ...payload },
        bubbles: true,
        composed: true,
      }),
    );
  }, 50);
};

const attach = (source: AudioNode): AudioNode => {
  const context = getAudioContext(source);

  if (port.dataset.enabled === "false") {
    return connectToDestination(source, context.destination);
  }

  if (equalizerGraphs.has(source)) {
    port.dispatchEvent(new Event("connected"));
    return context.destination;
  }

  const filters: EqualizerNodeChain = {
    preamp: context.createGain(),
    balance: context.createStereoPanner(),
  };
  const preampValue = isNaN(Number(port.dataset.preamp))
    ? 1
    : Number(port.dataset.preamp);
  filters.preamp.gain.value = port.dataset.mute === "true" ? 0 : preampValue;
  source.connect(filters.preamp);
  filters.balance.pan.value = 0;
  filters.preamp.connect(filters.balance);
  equalizerGraphs.set(source, filters);

  const filterSettings = readFilterSettings();
  rebuildBiquadChain(source, filters, filterSettings);

  if (port.dataset.enableSpectrum === "true") {
    currentSourceNode = getLastBiquadFilter(filters, filters.balance);
    startSpectrum();
  }

  port.dispatchEvent(new Event("connected"));
  return context.destination;
};

const setCurrentAudioGraph = (
  audioCtx: AudioContext,
  sourceNode: AudioNode,
): void => {
  currentAudioCtx = audioCtx;
  currentSourceNode = sourceNode;
  analyser = null;
};

const createMediaSource = (
  target: HTMLMediaElement,
): Promise<MediaElementAudioSourceNode> =>
  new Promise((resolve, reject) => {
    const existing = mediaSources.get(target);
    if (existing) {
      setCurrentAudioGraph(existing.context, existing.source);
      resolve(existing.source);
      return;
    }

    const context = new AudioContext();

    const next = (): void => {
      try {
        const source = context.createMediaElementSource(target);
        mediaSources.set(target, { context, source });
        setCurrentAudioGraph(context, source);
        resolve(source);
      } catch (error) {
        reject(error);
      }
    };

    setTimeout(() => {
      try {
        target.setAttribute("crossOrigin", "anonymous");
        (target as CapturableMediaElement).captureStream?.();
        next();
      } catch (error) {
        if (getErrorMessage(error, "").includes("cross-origin")) {
          reject(error);
        } else {
          next();
        }
      }
    });
  });

const detach = (): void => {
  stopSpectrum();
  equalizerGraphs.forEach((filters, source) => {
    const context = getAudioContext(source);
    source.disconnect();
    getLastBiquadFilter(filters, filters.balance).disconnect();
    connectToDestination(source, context.destination);
    port.dispatchEvent(new Event("disconnected"));
  });
};

const reattach = (): void => {
  const filterSettings = readFilterSettings();
  equalizerGraphs.forEach((filters, source) => {
    source.disconnect();
    source.connect(filters.preamp);
    if (getBiquadFilterCount(filters) !== filterSettings.length) {
      rebuildBiquadChain(source, filters, filterSettings);
    } else {
      filterSettings.forEach((filter, i) => {
        applyBiquadSettings(filters[i] as BiquadFilterNode, filter);
      });
      const lastFilter = getLastBiquadFilter(filters, filters.balance);
      lastFilter.disconnect();
      connectToDestination(lastFilter, getAudioContext(source).destination);
    }

    if (port.dataset.enableSpectrum === "true") {
      currentSourceNode = getLastBiquadFilter(filters, filters.balance);
      analyser = null;
      startSpectrum();
    }
    port.dispatchEvent(new Event("connected"));
  });
  if (equalizerGraphs.size) {
    port.dispatchEvent(new Event("connected"));
  }
};

const updateSpectrumState = (): void => {
  if (port.dataset.enableSpectrum !== "true") {
    stopSpectrum();
    return;
  }

  for (const [source, filters] of equalizerGraphs) {
    currentAudioCtx = getAudioContext(source);
    currentSourceNode = getLastBiquadFilter(filters, filters.balance);
    analyser = null;
    startSpectrum();
    return;
  }
};

port.addEventListener("spectrum-state-changed", updateSpectrumState);

AudioNode.prototype.connect = new Proxy(nativeConnect, {
  apply(target, self, args) {
    const [node] = args;

    if (node && node instanceof AudioDestinationNode) {
      try {
        return attach(self as AudioNode);
      } catch (error) {
        console.warn("cannot equalize;", getErrorMessage(error, ""));
        port.dispatchEvent(new Event("cannot-attach"));
      }
    }

    return Reflect.apply(target, self, args);
  },
});

const convert = async (target: EventTarget | null): Promise<void> => {
  if (!(target instanceof HTMLMediaElement)) return;

  if (port.dataset.enabled === "false") {
    cachedMedia.add(target);
    return;
  }

  if (pendingMedia.has(target)) return;

  try {
    pendingMedia.add(target);
    const sourceNode = await createMediaSource(target);
    if (!equalizerGraphs.has(sourceNode)) {
      attach(sourceNode);
    } else {
      port.dispatchEvent(new Event("connected"));
    }
  } catch (error) {
    port.dispatchEvent(
      new CustomEvent("capture-error", {
        detail: { message: getErrorMessage(error, "Unknown error") },
      }),
    );
  } finally {
    pendingMedia.delete(target);
  }
};

window.addEventListener("playing", (event) => void convert(event.target), true);

window.Audio = new Proxy(window.Audio, {
  construct(target, args, newTarget) {
    const result = Reflect.construct(target, args, newTarget) as HTMLAudioElement;
    try {
      void convert(result);
    } catch (error) {
      console.error(error);
    }
    return result;
  },
});

HTMLMediaElement.prototype.play = new Proxy(HTMLMediaElement.prototype.play, {
  apply(target, self, args) {
    const mediaElement = self as HTMLMediaElement;
    if (mediaElement.isConnected === false) {
      try {
        void convert(mediaElement);
      } catch (error) {
        console.error(error);
      }
    }

    return Reflect.apply(target, self, args) as Promise<void>;
  },
});

port.addEventListener("filters-changed", () => {
  equalizerGraphs.forEach((filters, source) => {
    const filterSettings = readFilterSettings();
    if (getBiquadFilterCount(filters) !== filterSettings.length) {
      rebuildBiquadChain(source, filters, filterSettings);
      if (port.dataset.enableSpectrum === "true") {
        currentSourceNode =
          filterSettings.length > 0 ? filters[filterSettings.length - 1] ?? null : null;
        analyser = null;
        startSpectrum();
      }
      port.dispatchEvent(new Event("connected"));
      return;
    }

    filterSettings.forEach((filter, i) => {
      applyBiquadSettings(filters[i] as BiquadFilterNode, filter);
    });
  });
});

port.addEventListener("preamp-changed", () => {
  equalizerGraphs.forEach((filters) => {
    filters.preamp.gain.value = Number(port.dataset.preamp);
  });
});

port.addEventListener("mute-enabled", () => {
  equalizerGraphs.forEach((filters) => {
    filters.preamp.gain.value = Number(0);
  });
});

port.addEventListener("mute-disabled", () => {
  equalizerGraphs.forEach((filters) => {
    filters.preamp.gain.value = Number(port.dataset.preamp);
  });
});

port.addEventListener("enabled-changed", () => {
  if (port.dataset.enabled === "false") {
    detach();
  } else {
    reattach();

    if (cachedMedia.size) {
      for (const target of cachedMedia) {
        void convert(target);
      }
      cachedMedia.clear();
    }
  }
});

function ensureAnalyser(
  audioCtx: AudioContext | null,
  sourceNode: AudioNode | null,
): AnalyserWithLegacySampleRate | null {
  if (!audioCtx || !sourceNode) return null;
  if (analyser) return analyser;

  analyser = audioCtx.createAnalyser();
  analyser.sampleRate = 48000;
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.5;

  try {
    sourceNode.connect(analyser);
  } catch (error) {}
  return analyser;
}

function stopSpectrum(): void {
  if (spectrumTimer) {
    clearInterval(spectrumTimer);
    spectrumTimer = null;
  }
}
