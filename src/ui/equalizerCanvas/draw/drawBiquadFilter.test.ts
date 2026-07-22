import { expect, test, vi } from "vitest";

import { drawBiquadFilter } from "./drawBiquadFilter";

test("draws a configured biquad response", () => {
  const filter = {
    type: "lowpass",
    frequency: { value: 0 },
    Q: { value: 0 },
    gain: { value: 0 },
    getFrequencyResponse: vi.fn(
      (_frequencies: Float32Array, magnitudes: Float32Array) => {
        magnitudes.fill(1);
      },
    ),
  };
  const audioContext = {
    sampleRate: 48000,
    createBiquadFilter: vi.fn(() => filter),
  } as unknown as BaseAudioContext;
  const canvas = { width: 3, height: 60 } as HTMLCanvasElement;
  const ctx = {
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    strokeStyle: "",
    lineWidth: 0,
  } as unknown as CanvasRenderingContext2D;

  drawBiquadFilter({
    canvas,
    ctx,
    audioContext,
    type: "peaking",
    freq: 800,
    q: 2,
    gain: 6,
    strokeStyle: "accent",
  });

  expect(filter.type).toBe("peaking");
  expect(filter.frequency.value).toBe(800);
  expect(filter.Q.value).toBe(2);
  expect(filter.gain.value).toBe(6);
  expect(ctx.strokeStyle).toBe("accent");
  expect(ctx.stroke).toHaveBeenCalledOnce();
});
