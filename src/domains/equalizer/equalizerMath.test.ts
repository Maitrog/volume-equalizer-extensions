import { describe, expect, test } from "vitest";

import {
  clampPointCount,
  dbToGain,
  ensureQFactor,
  frequencyToX,
  xToFrequency,
  yToDb,
} from "./equalizerMath";

describe("equalizerMath", () => {
  test("clamps point counts to the supported range", () => {
    expect(clampPointCount(Number.NaN)).toBe(5);
    expect(clampPointCount(3)).toBe(5);
    expect(clampPointCount(7)).toBe(7);
    expect(clampPointCount(12)).toBe(9);
  });

  test("normalizes q factors to the supported range", () => {
    expect(ensureQFactor("bad")).toBe(0.5);
    expect(ensureQFactor(0.01)).toBe(0.1);
    expect(ensureQFactor(2)).toBe(2);
    expect(ensureQFactor(99)).toBe(10);
  });

  test("converts frequency and x positions back and forth", () => {
    const x = frequencyToX(1000, 500);

    expect(xToFrequency(x, 500)).toBeCloseTo(1000, 10);
  });

  test("converts y positions to decibels", () => {
    expect(yToDb(100, 200)).toBe(0);
    expect(yToDb(20, 200)).toBe(25);
  });
});
