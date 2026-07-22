import type { EqualizerFilter } from "./types";

import { DEFAULT_FILTER_Q } from "./equalizerMath";

const DEFAULT_PEAKING_FREQS = [5, 30, 180, 800, 5000];

type FilterSettingsInput = Pick<EqualizerFilter, "freq" | "gain"> &
  Partial<Pick<EqualizerFilter, "q" | "type">>;

export const createDefaultFilterSettings = (): EqualizerFilter[] => {
  return [
    { freq: 20, gain: 0, q: DEFAULT_FILTER_Q, type: "highpass" },
    ...DEFAULT_PEAKING_FREQS.map((freq): EqualizerFilter => {
      return { freq, gain: 0, q: DEFAULT_FILTER_Q, type: "peaking" };
    }),
    { freq: 20000, gain: 0, q: DEFAULT_FILTER_Q, type: "lowpass" },
  ];
};

export const normalizeFilterSettings = (
  filters: FilterSettingsInput[] | null | undefined
): EqualizerFilter[] => {
  return (filters ?? []).map((filter) => {
    return {
      freq: filter.freq,
      gain: filter.gain,
      q: filter.q ?? DEFAULT_FILTER_Q,
      type: filter.type ?? "peaking",
    };
  });
};
