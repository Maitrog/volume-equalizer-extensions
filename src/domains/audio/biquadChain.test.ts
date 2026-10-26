import { describe, expect, test } from "vitest";

import {
  applyBiquadSettings,
  createBiquadFilter,
  getBiquadHeadroomGain,
  getBiquadFilterCount,
  getLastBiquadFilter,
} from "./biquadChain";

import type { EqualizerFilter } from "../equalizer/types";

const createFakeBiquadFilter = (magnitude = 1): BiquadFilterNode =>
  ({
    type: "lowpass",
    gain: { value: 99 },
    frequency: { value: 99 },
    Q: { value: 99 },
    getFrequencyResponse: (
      _frequencies: Float32Array,
      magnitudes: Float32Array,
      phases: Float32Array,
    ) => {
      magnitudes.fill(magnitude);
      phases.fill(0);
    },
  }) as BiquadFilterNode;

describe("biquadChain", () => {
  test.each([
    { position: "below", magnitude: 1.7782794100389228, expected: 1 },
    { position: "at", magnitude: 4.466835921509632, expected: 1 },
    { position: "above", magnitude: 10, expected: 0.7943282347242815 },
  ])("applies headroom compensation $position 18 decibels", ({ magnitude, expected }) => {
    const gain = getBiquadHeadroomGain([createFakeBiquadFilter(magnitude)], 48000);

    if (expected === 1) expect(gain).toBe(1);
    else expect(gain).toBeCloseTo(expected, 6);
  });

  test("counts contiguous numeric filter slots", () => {
    expect(getBiquadFilterCount({ 0: createFakeBiquadFilter(), 2: createFakeBiquadFilter() })).toBe(
      1,
    );
  });

  test("applies legacy biquad defaults and numeric coercion", () => {
    const biquadFilter = createFakeBiquadFilter();

    applyBiquadSettings(biquadFilter, { freq: 125, gain: 3 } as EqualizerFilter);

    expect(biquadFilter.type).toBe("peaking");
    expect(biquadFilter.gain.value).toBe(3);
    expect(biquadFilter.frequency.value).toBe(125);
    expect(biquadFilter.Q.value).toBe(0.5);
  });

  test("creates a biquad filter from an audio context and applies settings", () => {
    const biquadFilter = createFakeBiquadFilter();
    const context = {
      createBiquadFilter: () => biquadFilter,
    } as BaseAudioContext;

    expect(
      createBiquadFilter(context, {
        freq: 800,
        gain: -4,
        q: 1.5,
        type: "highpass",
      }),
    ).toBe(biquadFilter);
    expect(biquadFilter.type).toBe("highpass");
    expect(biquadFilter.gain.value).toBe(-4);
    expect(biquadFilter.frequency.value).toBe(800);
    expect(biquadFilter.Q.value).toBe(1.5);
  });

  test("returns the last contiguous biquad filter or the fallback node", () => {
    const fallbackNode = { label: "fallback" } as unknown as AudioNode;
    const firstFilter = createFakeBiquadFilter();
    const secondFilter = createFakeBiquadFilter();

    expect(getLastBiquadFilter({}, fallbackNode)).toBe(fallbackNode);
    expect(getLastBiquadFilter({ 0: firstFilter, 1: secondFilter }, fallbackNode)).toBe(
      secondFilter,
    );
  });
});

test.each(["highpass", "peaking", "lowpass"] as const)(
  "passes 20001 Hz unchanged to %s audio nodes",
  (type) => {
    const node = createFakeBiquadFilter();
    applyBiquadSettings(node, { type, freq: 20001, gain: 2, q: 0.5 });
    expect(node.frequency.value).toBe(20001);
    expect(node.type).toBe(type);
  },
);
