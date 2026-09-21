import { afterEach, expect, test, vi } from "vitest";

import { createSpectrumSampler, serializeSpectrumBuffer } from "./spectrumSampler";

class FakeNode {
  connections: object[] = [];
  connect = vi.fn((destination: object) => {
    this.connections.push(destination);
    return destination;
  });
  disconnect = vi.fn((destination?: object) => {
    this.connections = destination
      ? this.connections.filter((connection) => connection !== destination)
      : [];
  });
}

class FakeAnalyser extends FakeNode {
  fftSize = 4;
  smoothingTimeConstant = 0;
  minDecibels = -100;
  maxDecibels = -30;
  frequencyBinCount = 2;
  frequencyBuffers: Float32Array[] = [];
  sampleBuffers: Float32Array[] = [];

  getFloatFrequencyData(buffer: Float32Array): void {
    this.frequencyBuffers.push(buffer);
    buffer.fill(-42);
  }

  getFloatTimeDomainData(buffer: Float32Array): void {
    this.sampleBuffers.push(buffer);
    buffer.fill(0);
  }
}

class FakeContext {
  sampleRate = 48000;
  destination = new FakeNode();
  analysers: FakeAnalyser[] = [];

  createAnalyser(): FakeAnalyser {
    const analyser = new FakeAnalyser();
    this.analysers.push(analyser);
    return analyser;
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
});

test("serializes buffers to finite numbers using the floor for silent bins", () => {
  const buffer = new Float32Array([-42, -Infinity, NaN, 0, Infinity]);

  expect(serializeSpectrumBuffer(buffer, -100)).toEqual([-42, -100, -100, 0, -100]);
});

test("disconnects only its analyser while switching outputs and stopping", () => {
  vi.stubGlobal(
    "setInterval",
    vi.fn(() => 1),
  );
  vi.stubGlobal("clearInterval", vi.fn());
  const sampler = createSpectrumSampler(vi.fn(), vi.fn());
  const contextA = new FakeContext();
  const contextB = new FakeContext();
  const outputA = new FakeNode();
  const outputB = new FakeNode();
  outputA.connect(contextA.destination);
  outputB.connect(contextB.destination);

  sampler.start(contextA as unknown as AudioContext, outputA as unknown as AudioNode);
  const firstAnalyser = contextA.analysers[0];
  sampler.start(contextB as unknown as AudioContext, outputB as unknown as AudioNode);

  expect(outputA.disconnect).toHaveBeenCalledWith(firstAnalyser);
  expect(outputA.disconnect).not.toHaveBeenCalledWith();
  expect(outputA.connections).toEqual([contextA.destination]);

  const secondAnalyser = contextB.analysers[0];
  sampler.start(contextA as unknown as AudioContext, outputA as unknown as AudioNode);
  expect(outputB.disconnect).toHaveBeenCalledWith(secondAnalyser);
  expect(outputB.connections).toEqual([contextB.destination]);

  const thirdAnalyser = contextA.analysers[1];
  sampler.stop();
  expect(outputA.disconnect).toHaveBeenLastCalledWith(thirdAnalyser);
  expect(outputA.connections).toEqual([contextA.destination]);
});

test("reuses its analyser and sample buffers after a stop", () => {
  const ticks: Array<() => void> = [];
  vi.stubGlobal(
    "setInterval",
    vi.fn((tick: () => void) => {
      ticks.push(tick);
      return ticks.length;
    }),
  );
  vi.stubGlobal("clearInterval", vi.fn());
  const onFrame = vi.fn();
  const sampler = createSpectrumSampler(vi.fn(), onFrame);
  const context = new FakeContext();
  const output = new FakeNode();

  sampler.start(context as unknown as AudioContext, output as unknown as AudioNode);
  ticks[0]();
  ticks[0]();
  sampler.stop();
  sampler.start(context as unknown as AudioContext, output as unknown as AudioNode);
  ticks[1]();

  expect(context.analysers).toHaveLength(1);
  expect(context.analysers[0].frequencyBuffers[0]).toBe(context.analysers[0].frequencyBuffers[2]);
  expect(context.analysers[0].sampleBuffers[0]).toBe(context.analysers[0].sampleBuffers[2]);
  expect(onFrame).toHaveBeenLastCalledWith(context.analysers[0].frequencyBuffers[2], false);
});
