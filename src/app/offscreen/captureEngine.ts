import type {
  CaptureSettings,
  CaptureState,
  SpectrumPayload,
} from "../../infrastructure/chrome/runtimeMessages";
import {
  createSpectrumSampler,
  serializeSpectrumBuffer,
} from "../../infrastructure/audio/spectrumSampler";
import { createCaptureGraph, type CaptureGraph } from "./captureGraph";
import { createCaptureSession } from "./captureSession";

const DEFAULT_SPECTRUM_FLOOR = -100;

const copySettings = (settings: CaptureSettings): CaptureSettings => ({
  ...settings,
  filterSettings: settings.filterSettings.map((filter) => ({ ...filter })),
});

export const createCaptureEngine = (deps: {
  audioContext: AudioContext;
  acquireStream?(tabId: number, streamId: string): Promise<MediaStream>;
  createGraph?(
    tabId: number,
    stream: MediaStream,
    settings: CaptureSettings,
  ): Promise<CaptureGraph>;
  onCaptureEnded?(tabId: number): void;
  sendSpectrumFrame?(tabId: number, payload: SpectrumPayload): void;
}) => {
  const settingsByTab = new Map<string, { streamId: string; settings: CaptureSettings }>();
  const spectrumDemand = new Set<string>();
  const spectrumFloors = new Map<string, number>();
  const spectrumSamplers = new Map<string, ReturnType<typeof createSpectrumSampler>>();
  const watchedStreams = new WeakSet<MediaStream>();

  const acquireStream =
    deps.acquireStream ??
    ((_tabId: number, streamId: string) =>
      navigator.mediaDevices.getUserMedia({
        audio: {
          mandatory: {
            chromeMediaSource: "tab",
            chromeMediaSourceId: streamId,
          },
        } as MediaTrackConstraints,
        video: false,
      }));

  const createGraph =
    deps.createGraph ??
    ((tabId: number, stream: MediaStream, settings: CaptureSettings) =>
      Promise.resolve(
        createCaptureGraph({
          audioContext: deps.audioContext,
          source: deps.audioContext.createMediaStreamSource(stream),
          ...settings,
          onBeforeOutputChange: () => stopSpectrum(tabId),
          onOutputChange: () => startSpectrum(tabId),
        }),
      ));

  const session = createCaptureSession({
    acquireStream,
    createGraph: async (tabId, streamId, stream) => {
      const entry = settingsByTab.get(String(tabId));
      if (!entry || entry.streamId !== streamId) {
        throw new Error("Capture settings are unavailable");
      }
      return createGraph(tabId, stream, entry.settings);
    },
  });

  const getSpectrumSampler = (tabId: number) => {
    const key = String(tabId);
    let sampler = spectrumSamplers.get(key);
    if (!sampler) {
      sampler = createSpectrumSampler(
        (meta) => {
          spectrumFloors.set(key, meta.minDb);
          deps.sendSpectrumFrame?.(tabId, meta);
        },
        (buffer, clipping) =>
          deps.sendSpectrumFrame?.(tabId, {
            type: "spectrum",
            buffer: buffer
              ? serializeSpectrumBuffer(buffer, spectrumFloors.get(key) ?? DEFAULT_SPECTRUM_FLOOR)
              : null,
            clipping,
          }),
      );
      spectrumSamplers.set(key, sampler);
    }
    return sampler;
  };

  const stopSpectrum = (tabId: number): void => {
    spectrumSamplers.get(String(tabId))?.stop();
  };

  const startSpectrum = (tabId: number): void => {
    const key = String(tabId);
    if (!spectrumDemand.has(key)) return;
    const capture = session.get(tabId);
    if (!capture) return;
    getSpectrumSampler(tabId).start(deps.audioContext, capture.graph.output);
  };

  // Demand is re-issued on subscribe and after a background restart, so restart the
  // sampler to re-emit metadata the relay may have lost.
  const restartSpectrum = (tabId: number): void => {
    stopSpectrum(tabId);
    startSpectrum(tabId);
  };

  const stop = (tabId: number): void => {
    const key = String(tabId);
    spectrumSamplers.get(key)?.dispose();
    spectrumSamplers.delete(key);
    spectrumFloors.delete(key);
    session.stopTab(tabId);
    settingsByTab.delete(key);
    spectrumDemand.delete(key);
  };

  const watchStream = (tabId: number, streamId: string, stream: MediaStream): void => {
    if (watchedStreams.has(stream)) return;
    watchedStreams.add(stream);
    stream.getTracks().forEach((track) => {
      track.addEventListener(
        "ended",
        () => {
          const capture = session.get(tabId);
          if (!capture || capture.streamId !== streamId || capture.stream !== stream) return;
          stop(tabId);
          deps.onCaptureEnded?.(tabId);
        },
        { once: true },
      );
    });
  };

  return {
    start: async (tabId: number, streamId: string, settings: CaptureSettings): Promise<void> => {
      const key = String(tabId);
      const snapshot = copySettings(settings);
      settingsByTab.set(key, { streamId, settings: snapshot });
      try {
        await session.start(tabId, streamId);
        const capture = session.get(tabId);
        const currentSettings = settingsByTab.get(key);
        if (
          !capture ||
          capture.streamId !== streamId ||
          !currentSettings ||
          currentSettings.streamId !== streamId
        ) {
          throw new Error("Capture start was superseded");
        }
        watchStream(tabId, streamId, capture.stream);
        capture.graph.update(currentSettings.settings);
        startSpectrum(tabId);
        await deps.audioContext.resume();
      } catch (error) {
        const capture = session.get(tabId);
        if (capture?.streamId === streamId) session.stopTab(tabId);
        if (settingsByTab.get(key)?.streamId === streamId) settingsByTab.delete(key);
        throw error;
      }
    },
    stop,
    update: (tabId: number, settings: CaptureSettings): void => {
      const key = String(tabId);
      const snapshot = copySettings(settings);
      const capture = session.get(tabId);
      if (!capture) {
        const pending = settingsByTab.get(key);
        if (pending) settingsByTab.set(key, { ...pending, settings: snapshot });
        return;
      }
      try {
        capture.graph.update(snapshot);
      } catch (error) {
        stop(tabId);
        throw error;
      }
      settingsByTab.set(key, { streamId: capture.streamId, settings: snapshot });
    },
    list: (): CaptureState[] =>
      [...session.captures.entries()].flatMap(([key, capture]) => {
        const entry = settingsByTab.get(key);
        return entry?.streamId === capture.streamId
          ? [{ tabId: Number(key), settings: copySettings(entry.settings) }]
          : [];
      }),
    setSpectrumDemand: (tabId: number, enabled: boolean): void => {
      const key = String(tabId);
      if (enabled) {
        spectrumDemand.add(key);
        restartSpectrum(tabId);
      } else {
        spectrumDemand.delete(key);
        stopSpectrum(tabId);
      }
    },
    dispose: async (): Promise<void> => {
      spectrumSamplers.forEach((sampler) => sampler.dispose());
      spectrumSamplers.clear();
      spectrumFloors.clear();
      session.stop();
      settingsByTab.clear();
      spectrumDemand.clear();
      await deps.audioContext.close();
    },
  };
};
