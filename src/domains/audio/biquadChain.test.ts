import { describe, expect, test } from "vitest";

import {
  applyBiquadSettings,
  createBiquadFilter,
  getBiquadFilterCount,
  getLastBiquadFilter,
} from "./biquadChain";

import type { EqualizerFilter } from "../equalizer/types";

const createFakeBiquadFilter = (): BiquadFilterNode =>
  ({
    type: "lowpass",
    gain: { value: 99 },
    frequency: { value: 99 },
    Q: { value: 99 },
  }) as BiquadFilterNode;

describe("biquadChain", () => {
  test("counts contiguous numeric filter slots", () => {
    expect(getBiquadFilterCount({ 0: createFakeBiquadFilter(), 2: createFakeBiquadFilter() })).toBe(1);
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
    expect(getLastBiquadFilter({ 0: firstFilter, 1: secondFilter }, fallbackNode)).toBe(secondFilter);
  });
});
