import { describe, expect, test } from "vitest";

import { isSameSpectrumSource, normalizeSpectrumPayload } from "./runtimeMessages";

describe("normalizeSpectrumPayload", () => {
  test("accepts finite metadata with valid analyser dimensions", () => {
    const input = {
      type: "meta",
      sampleRate: 48000,
      fftSize: 2048,
      minDb: -100,
      maxDb: -30,
      frequencyBinCount: 1024,
    };

    expect(normalizeSpectrumPayload(input)).toEqual(input);
  });

  test("copies typed spectrum buffers into serializable number arrays", () => {
    const input = {
      type: "spectrum",
      buffer: new Float32Array([-42, -38]),
      clipping: false,
    };

    const normalized = normalizeSpectrumPayload(input);

    expect(normalized).toEqual({
      type: "spectrum",
      buffer: [-42, -38],
      clipping: false,
    });
    expect((normalized as { buffer: unknown }).buffer).not.toBe(input.buffer);
  });

  test.each([
    {
      type: "meta",
      sampleRate: Infinity,
      fftSize: 2048,
      minDb: -100,
      maxDb: -30,
      frequencyBinCount: 1024,
    },
    {
      type: "meta",
      sampleRate: 48000,
      fftSize: 2.5,
      minDb: -100,
      maxDb: -30,
      frequencyBinCount: 1024,
    },
    {
      type: "meta",
      sampleRate: 48000,
      fftSize: 2048,
      minDb: -30,
      maxDb: -100,
      frequencyBinCount: 1024,
    },
    { type: "spectrum", buffer: { 0: -42, length: 1 }, clipping: false },
    { type: "spectrum", buffer: new DataView(new ArrayBuffer(8)), clipping: false },
    { type: "spectrum", buffer: [Number.NaN], clipping: false },
    { type: "spectrum", buffer: null, clipping: "false" },
    { type: "unknown" },
  ])("rejects invalid external payload %#", (input) => {
    expect(normalizeSpectrumPayload(input)).toBeNull();
  });
});

describe("isSameSpectrumSource", () => {
  test("matches capture sources together and content sources by frame", () => {
    expect(isSameSpectrumSource({ kind: "capture" }, { kind: "capture" })).toBe(true);
    expect(
      isSameSpectrumSource({ kind: "content", frameId: 1 }, { kind: "content", frameId: 1 }),
    ).toBe(true);
    expect(
      isSameSpectrumSource({ kind: "content", frameId: 1 }, { kind: "content", frameId: 2 }),
    ).toBe(false);
    expect(isSameSpectrumSource({ kind: "capture" }, { kind: "content", frameId: 1 })).toBe(false);
    expect(isSameSpectrumSource({ kind: "content", frameId: 1 }, { kind: "capture" })).toBe(false);
  });
});
