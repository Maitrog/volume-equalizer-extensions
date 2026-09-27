import { expect, test, vi } from "vitest";

import type { EqualizerFilter } from "../../domains/equalizer/types";
import { createCaptureGraph } from "./captureGraph";

class FakeNode {
  connections: FakeNode[] = [];
  disconnect = vi.fn(() => {
    this.connections = [];
  });
  connect(node: FakeNode): FakeNode {
    this.connections.push(node);
    return node;
  }
}

class FakeGain extends FakeNode {
  gain = { value: 1 };
}

class FakeBiquad extends FakeNode {
  frequency = { value: 0 };
  gain = { value: 0 };
  Q = { value: 0 };
  type: BiquadFilterType = "peaking";

  getFrequencyResponse(
    _frequencies: Float32Array,
    magnitudes: Float32Array,
    phases: Float32Array,
  ): void {
    magnitudes.fill(this.gain.value > 0 ? 10 : 1);
    phases.fill(0);
  }
}

const filters = (count: number): EqualizerFilter[] =>
  Array.from({ length: count }, (_, index) => ({
    freq: 100 * (index + 1),
    gain: index,
    q: 0.5,
    type: "peaking",
  }));

test("capture graph rebuilds owned nodes and disposes without stopping stream tracks", () => {
  const source = new FakeNode();
  const destination = new FakeNode();
  const createdGains: FakeGain[] = [];
  const createdFilters: FakeBiquad[] = [];
  const track = { stop: vi.fn() };
  const beforeOutputChange = vi.fn();
  const outputChange = vi.fn();
  const audioContext = {
    sampleRate: 48000,
    destination,
    createGain: () => {
      const gain = new FakeGain();
      createdGains.push(gain);
      return gain;
    },
    createBiquadFilter: () => {
      const filter = new FakeBiquad();
      createdFilters.push(filter);
      return filter;
    },
  } as unknown as AudioContext;

  const graph = createCaptureGraph({
    audioContext,
    source: source as unknown as MediaStreamAudioSourceNode,
    enabled: true,
    gainValue: 0,
    muted: false,
    volumeCompensationEnabled: true,
    filterSettings: filters(1),
    onBeforeOutputChange: beforeOutputChange,
    onOutputChange: outputChange,
  });
  const firstOutput = graph.output;
  graph.update({ filterSettings: filters(1) });
  expect(graph.output).toBe(firstOutput);

  graph.update({ filterSettings: filters(2) });
  expect(beforeOutputChange).toHaveBeenCalledWith(firstOutput);
  expect(graph.output).not.toBe(firstOutput);

  graph.update({ enabled: false });
  expect(graph.filters).toHaveLength(0);
  expect(graph.output).toBe(graph.preamp);
  graph.dispose();
  expect(source.disconnect).toHaveBeenCalled();
  expect(createdGains.every((node) => node.disconnect.mock.calls.length > 0)).toBe(true);
  expect(createdFilters.every((node) => node.disconnect.mock.calls.length > 0)).toBe(true);
  expect(track.stop).not.toHaveBeenCalled();
});

test("capture graph applies volume compensation only when enabled", () => {
  const source = new FakeNode();
  const destination = new FakeNode();
  const audioContext = {
    sampleRate: 48000,
    destination,
    createGain: () => new FakeGain(),
    createBiquadFilter: () => new FakeBiquad(),
  } as unknown as AudioContext;

  const graph = createCaptureGraph({
    audioContext,
    source: source as unknown as MediaStreamAudioSourceNode,
    enabled: true,
    gainValue: 0,
    muted: false,
    volumeCompensationEnabled: false,
    filterSettings: [{ freq: 1000, gain: 6, q: 0.5, type: "peaking" }],
    onBeforeOutputChange: vi.fn(),
    onOutputChange: vi.fn(),
  });

  expect(graph.preamp.gain.value).toBe(1);

  graph.update({ volumeCompensationEnabled: true });

  expect(graph.preamp.gain.value).toBeCloseTo(0.7943282347242815, 6);
});

test("cleans a partial graph and preserves the construction error", () => {
  const source = new FakeNode();
  const destination = new FakeNode();
  const gain = new FakeGain();
  const firstFilter = new FakeBiquad();
  const failure = new Error("second filter failed");
  const createBiquadFilter = vi
    .fn()
    .mockReturnValueOnce(firstFilter)
    .mockImplementationOnce(() => {
      throw failure;
    });
  const audioContext = {
    sampleRate: 48000,
    destination,
    createGain: () => gain,
    createBiquadFilter,
  } as unknown as AudioContext;

  expect(() =>
    createCaptureGraph({
      audioContext,
      source: source as unknown as MediaStreamAudioSourceNode,
      enabled: true,
      gainValue: 0,
      muted: false,
      volumeCompensationEnabled: true,
      filterSettings: filters(2),
      onBeforeOutputChange: vi.fn(),
      onOutputChange: vi.fn(),
    }),
  ).toThrow(failure);

  expect(source.disconnect).toHaveBeenCalledOnce();
  expect(gain.disconnect).toHaveBeenCalledOnce();
  expect(firstFilter.disconnect).toHaveBeenCalledOnce();
});
