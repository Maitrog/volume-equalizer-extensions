import { describe, expect, test } from "vitest";

import {
  createDefaultFilterSettings,
  normalizeFilterSettings,
} from "./defaultFilters";

describe("defaultFilters", () => {
  test("creates default filter settings in legacy order", () => {
    expect(createDefaultFilterSettings()).toEqual([
      { freq: 20, gain: 0, q: 0.5, type: "highpass" },
      { freq: 5, gain: 0, q: 0.5, type: "peaking" },
      { freq: 30, gain: 0, q: 0.5, type: "peaking" },
      { freq: 180, gain: 0, q: 0.5, type: "peaking" },
      { freq: 800, gain: 0, q: 0.5, type: "peaking" },
      { freq: 5000, gain: 0, q: 0.5, type: "peaking" },
      { freq: 20000, gain: 0, q: 0.5, type: "lowpass" },
    ]);
  });

  test("normalizes missing filter q and type to legacy defaults", () => {
    expect(normalizeFilterSettings([{ freq: 100, gain: 2 }])).toEqual([
      { freq: 100, gain: 2, q: 0.5, type: "peaking" },
    ]);
  });
});
