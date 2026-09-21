import { afterEach, expect, test, vi } from "vitest";

import type { CaptureSettings } from "../../infrastructure/chrome/runtimeMessages";
import type { CaptureGraph } from "./captureGraph";
import { createCaptureEngine } from "./captureEngine";

afterEach(() => {
  vi.unstubAllGlobals();
});

const settings: CaptureSettings = {
  enabled: true,
  gainValue: 3,
  muted: false,
  volumeCompensationEnabled: true,
  filterSettings: [{ freq: 1000, gain: 2, q: 1, type: "peaking" }],
};

const fakeGraph = (): CaptureGraph =>
  ({ dispose: vi.fn(), update: vi.fn() }) as unknown as CaptureGraph;

const fakeStream = () => {
  const listeners: Array<() => void> = [];
  const stop = vi.fn();
  const track = {
    stop,
    addEventListener: (type: string, listener: () => void) => {
      if (type === "ended") listeners.push(listener);
    },
  };
  return {
    stream: { getTracks: () => [track] } as unknown as MediaStream,
    stop,
    emitEnded: () => listeners.forEach((listener) => listener()),
  };
};

test("creates and connects the graph before resuming the shared audio context", async () => {
  const media = fakeStream();
  const graph = fakeGraph();
  let resolveGraph!: (value: CaptureGraph) => void;
  const graphPromise = new Promise<CaptureGraph>((resolve) => {
    resolveGraph = resolve;
  });
  const resume = vi.fn(async () => undefined);
  const createGraph = vi.fn(() => graphPromise);
  const engine = createCaptureEngine({
    audioContext: { resume } as unknown as AudioContext,
    acquireStream: vi.fn(async () => media.stream),
    createGraph,
  });

  const start = engine.start(7, "stream-a", settings);
  await vi.waitFor(() => expect(createGraph).toHaveBeenCalledOnce());
  expect(resume).not.toHaveBeenCalled();
  resolveGraph(graph);
  await start;

  expect(createGraph).toHaveBeenCalledWith(7, media.stream, settings);
  expect(resume).toHaveBeenCalledOnce();
  expect(engine.list()).toEqual([{ tabId: 7, settings }]);
});

test("cleans the stream and settings when graph construction fails", async () => {
  const media = fakeStream();
  const failure = new Error("graph construction failed");
  const engine = createCaptureEngine({
    audioContext: { resume: vi.fn(async () => undefined) } as unknown as AudioContext,
    acquireStream: vi.fn(async () => media.stream),
    createGraph: vi.fn(async () => {
      throw failure;
    }),
  });

  await expect(engine.start(7, "stream-a", settings)).rejects.toBe(failure);

  expect(media.stop).toHaveBeenCalledOnce();
  expect(engine.list()).toEqual([]);
});

test("cleans the stream when the shared audio context cannot resume", async () => {
  const media = fakeStream();
  const engine = createCaptureEngine({
    audioContext: {
      resume: vi.fn(async () => {
        throw new Error("resume failed");
      }),
    } as unknown as AudioContext,
    acquireStream: vi.fn(async () => media.stream),
    createGraph: vi.fn(async () => fakeGraph()),
  });

  await expect(engine.start(7, "stream-a", settings)).rejects.toThrow("resume failed");

  expect(media.stop).toHaveBeenCalledOnce();
  expect(engine.list()).toEqual([]);
});

test("stops a pending start when it was superseded by a stop", async () => {
  let resolveStream!: (stream: MediaStream) => void;
  const media = fakeStream();
  const createGraph = vi.fn();
  const engine = createCaptureEngine({
    audioContext: { resume: vi.fn(async () => undefined) } as unknown as AudioContext,
    acquireStream: vi.fn(
      () =>
        new Promise<MediaStream>((resolve) => {
          resolveStream = resolve;
        }),
    ),
    createGraph,
  });

  const start = engine.start(7, "stream-a", settings);
  engine.stop(7);
  resolveStream(media.stream);

  await expect(start).rejects.toThrow("Capture start was superseded");
  expect(media.stop).toHaveBeenCalledOnce();
  expect(createGraph).not.toHaveBeenCalled();
  expect(engine.list()).toEqual([]);
});

test("applies settings that arrive while stream acquisition is pending", async () => {
  let resolveStream!: (stream: MediaStream) => void;
  const media = fakeStream();
  const graph = fakeGraph();
  const createGraph = vi.fn(async () => graph);
  const engine = createCaptureEngine({
    audioContext: { resume: vi.fn(async () => undefined) } as unknown as AudioContext,
    acquireStream: vi.fn(
      () =>
        new Promise<MediaStream>((resolve) => {
          resolveStream = resolve;
        }),
    ),
    createGraph,
  });
  const updated = { ...settings, gainValue: 6 };

  const start = engine.start(7, "stream-a", settings);
  engine.update(7, updated);
  resolveStream(media.stream);
  await start;

  expect(createGraph).toHaveBeenCalledWith(7, media.stream, updated);
  expect(graph.update).toHaveBeenLastCalledWith(updated);
  expect(engine.list()).toEqual([{ tabId: 7, settings: updated }]);
});

test("returns settings snapshots rather than live references", async () => {
  const media = fakeStream();
  const engine = createCaptureEngine({
    audioContext: { resume: vi.fn(async () => undefined) } as unknown as AudioContext,
    acquireStream: vi.fn(async () => media.stream),
    createGraph: vi.fn(async () => fakeGraph()),
  });

  await engine.start(7, "stream-a", settings);
  const [snapshot] = engine.list();
  snapshot.settings.filterSettings[0].gain = 99;
  settings.gainValue = 42;

  expect(engine.list()[0].settings.gainValue).toBe(3);
  expect(engine.list()[0].settings.filterSettings[0].gain).toBe(2);
});

test("stopping capture A preserves capture B", async () => {
  const mediaA = fakeStream();
  const mediaB = fakeStream();
  const engine = createCaptureEngine({
    audioContext: { resume: vi.fn(async () => undefined) } as unknown as AudioContext,
    acquireStream: vi.fn(async (tabId: number) => (tabId === 1 ? mediaA.stream : mediaB.stream)),
    createGraph: vi.fn(async () => fakeGraph()),
  });

  await engine.start(1, "stream-a", settings);
  await engine.start(2, "stream-b", settings);
  engine.stop(1);

  expect(mediaA.stop).toHaveBeenCalledOnce();
  expect(mediaB.stop).not.toHaveBeenCalled();
  expect(engine.list()).toEqual([{ tabId: 2, settings }]);
});

test("track ended stops only the matching session and notifies once", async () => {
  const mediaA = fakeStream();
  const mediaB = fakeStream();
  const onCaptureEnded = vi.fn();
  const engine = createCaptureEngine({
    audioContext: { resume: vi.fn(async () => undefined) } as unknown as AudioContext,
    acquireStream: vi.fn(async (tabId: number) => (tabId === 1 ? mediaA.stream : mediaB.stream)),
    createGraph: vi.fn(async () => fakeGraph()),
    onCaptureEnded,
  });

  await engine.start(1, "stream-a", settings);
  await engine.start(2, "stream-b", settings);
  mediaA.emitEnded();
  mediaA.emitEnded();

  expect(mediaA.stop).toHaveBeenCalledOnce();
  expect(mediaB.stop).not.toHaveBeenCalled();
  expect(onCaptureEnded).toHaveBeenCalledOnce();
  expect(onCaptureEnded).toHaveBeenCalledWith(1);
  expect(engine.list()).toEqual([{ tabId: 2, settings }]);
});

class FakeSpectrumNode {
  connect = vi.fn();
  disconnect = vi.fn();
}

class FakeAnalyser extends FakeSpectrumNode {
  fftSize = 4;
  smoothingTimeConstant = 0;
  minDecibels = -100;
  maxDecibels = -30;
  frequencyBinCount = 2;

  getFloatFrequencyData(buffer: Float32Array): void {
    buffer.fill(-Infinity);
  }

  getFloatTimeDomainData(buffer: Float32Array): void {
    buffer.fill(0);
  }
}

class FakeSpectrumContext {
  sampleRate = 48000;
  resume = vi.fn(async () => undefined);
  createAnalyser = vi.fn(() => new FakeAnalyser());
}

test("samples demand per tab, serializes non-finite bins, and keeps the audio graph alive", async () => {
  const ticks: Array<() => void> = [];
  vi.stubGlobal(
    "setInterval",
    vi.fn((tick: () => void) => {
      ticks.push(tick);
      return ticks.length;
    }),
  );
  const clearIntervalSpy = vi.fn();
  vi.stubGlobal("clearInterval", clearIntervalSpy);

  const mediaA = fakeStream();
  const mediaB = fakeStream();
  const graphA = {
    dispose: vi.fn(),
    update: vi.fn(),
    output: new FakeSpectrumNode(),
  } as unknown as CaptureGraph;
  const graphB = {
    dispose: vi.fn(),
    update: vi.fn(),
    output: new FakeSpectrumNode(),
  } as unknown as CaptureGraph;
  const frames: Array<{ tabId: number; payload: unknown }> = [];
  const engine = createCaptureEngine({
    audioContext: new FakeSpectrumContext() as unknown as AudioContext,
    acquireStream: vi.fn(async (tabId: number) => (tabId === 7 ? mediaA.stream : mediaB.stream)),
    createGraph: vi.fn(async (tabId: number) => (tabId === 7 ? graphA : graphB)),
    sendSpectrumFrame: (tabId, payload) => frames.push({ tabId, payload }),
  });

  await engine.start(7, "stream-a", settings);
  await engine.start(8, "stream-b", settings);
  engine.setSpectrumDemand(7, true);
  engine.setSpectrumDemand(8, true);

  const metaFrames = frames.filter(({ payload }) => (payload as { type: string }).type === "meta");
  expect(metaFrames.map(({ tabId }) => tabId)).toEqual([7, 8]);

  ticks[0]();

  const spectrumFrames = frames.filter(
    ({ payload }) =>
      (payload as { type: string; buffer: number[] | null }).type === "spectrum" &&
      (payload as { buffer: number[] | null }).buffer !== null,
  );
  expect(spectrumFrames).toHaveLength(1);
  const spectrumPayload = spectrumFrames[0].payload as { buffer: number[]; clipping: boolean };
  expect(spectrumFrames[0].tabId).toBe(7);
  expect(spectrumPayload.buffer.every((value) => Number.isFinite(value))).toBe(true);
  expect(spectrumPayload.buffer).toEqual([-100, -100]);

  engine.setSpectrumDemand(7, false);

  expect(clearIntervalSpy).toHaveBeenCalled();
  expect(graphA.dispose).not.toHaveBeenCalled();
  expect(mediaA.stop).not.toHaveBeenCalled();
  expect(engine.list()).toEqual([
    { tabId: 7, settings },
    { tabId: 8, settings },
  ]);
});

test("re-emits metadata when demand is restored after a relay restart", async () => {
  vi.stubGlobal(
    "setInterval",
    vi.fn(() => 1),
  );
  vi.stubGlobal("clearInterval", vi.fn());
  const media = fakeStream();
  const graph = {
    dispose: vi.fn(),
    update: vi.fn(),
    output: new FakeSpectrumNode(),
  } as unknown as CaptureGraph;
  const frames: unknown[] = [];
  const engine = createCaptureEngine({
    audioContext: new FakeSpectrumContext() as unknown as AudioContext,
    acquireStream: vi.fn(async () => media.stream),
    createGraph: vi.fn(async () => graph),
    sendSpectrumFrame: (_tabId, payload) => frames.push(payload),
  });

  await engine.start(7, "stream-a", settings);
  engine.setSpectrumDemand(7, true);
  engine.setSpectrumDemand(7, true);

  const metas = frames.filter((payload) => (payload as { type: string }).type === "meta");
  expect(metas.length).toBeGreaterThanOrEqual(2);
});

test("a late track ended does not stop a replacement capture", async () => {
  const oldMedia = fakeStream();
  const newMedia = fakeStream();
  const engine = createCaptureEngine({
    audioContext: { resume: vi.fn(async () => undefined) } as unknown as AudioContext,
    acquireStream: vi.fn(async (_tabId: number, streamId: string) =>
      streamId === "stream-a" ? oldMedia.stream : newMedia.stream,
    ),
    createGraph: vi.fn(async () => fakeGraph()),
  });

  await engine.start(7, "stream-a", settings);
  engine.stop(7);
  await engine.start(7, "stream-b", settings);
  oldMedia.emitEnded();

  expect(newMedia.stop).not.toHaveBeenCalled();
  expect(engine.list()).toEqual([{ tabId: 7, settings }]);
});

test("dispose is terminal: it stops every session, clears state, and closes the context", async () => {
  const mediaA = fakeStream();
  const mediaB = fakeStream();
  const graphA = fakeGraph();
  const graphB = fakeGraph();
  const close = vi.fn(async () => undefined);
  const engine = createCaptureEngine({
    audioContext: {
      resume: vi.fn(async () => undefined),
      close,
    } as unknown as AudioContext,
    acquireStream: vi.fn(async (tabId: number) => (tabId === 1 ? mediaA.stream : mediaB.stream)),
    createGraph: vi.fn(async (tabId: number) => (tabId === 1 ? graphA : graphB)),
  });

  await engine.start(1, "stream-a", settings);
  await engine.start(2, "stream-b", settings);
  await engine.dispose();

  expect(mediaA.stop).toHaveBeenCalledOnce();
  expect(mediaB.stop).toHaveBeenCalledOnce();
  expect(graphA.dispose).toHaveBeenCalledOnce();
  expect(graphB.dispose).toHaveBeenCalledOnce();
  expect(engine.list()).toEqual([]);
  expect(close).toHaveBeenCalledOnce();
  await expect(engine.start(3, "stream-c", settings)).rejects.toThrow();
});
