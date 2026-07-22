import type { EqualizerPersistedFilter } from "../equalizer/equalizerState";

export interface DefaultPreset {
  name: string;
  filters: EqualizerPersistedFilter[];
}

export type PresetStorage = Record<string, EqualizerPersistedFilter[] | undefined>;

const createPresetFilters = (
  gains: [number, number, number, number, number, number, number, number, number],
): EqualizerPersistedFilter[] => {
  const freqs = [64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

  return [
    { type: "highpass", freq: 20, gain: 0, q: 0.5 },
    ...freqs.map((freq, index): EqualizerPersistedFilter => {
      return {
        type: "peaking",
        freq,
        gain: gains[index],
        q: 0.5,
      };
    }),
    { type: "lowpass", freq: 20000, gain: 0, q: 0.5 },
  ];
};

export const DEFAULT_PRESETS: DefaultPreset[] = [
  {
    name: "Bass Boost",
    filters: createPresetFilters([13, 10, 7, 3, 0, 0, 0, 0, 0]),
  },
  {
    name: "Acoustic",
    filters: createPresetFilters([15, 10, 4, 7, 7, 10, 12, 10, 5]),
  },
  {
    name: "Bass Reducer",
    filters: createPresetFilters([-12, -10, -8, -5, 0, 0, 7, 10, 12]),
  },
  {
    name: "Classical",
    filters: createPresetFilters([12, 10, 8, -5, -5, 0, 7, 10, 12]),
  },
  {
    name: "Deep",
    filters: createPresetFilters([12, 5, 3, 10, 8, 5, -6, -12, -15]),
  },
  {
    name: "Electronic",
    filters: createPresetFilters([13, 4, 0, -6, 6, 3, 4, 13, 15]),
  },
  {
    name: "Hip Hop",
    filters: createPresetFilters([14, 4, 10, -4, -3, 4, -2, 6, 10]),
  },
  {
    name: "Jazz",
    filters: createPresetFilters([10, 4, 6, -5, -5, 0, 4, 10, 13]),
  },
  {
    name: "Latin",
    filters: createPresetFilters([5, 0, 0, -5, -5, -5, 0, 10, 15]),
  },
  {
    name: "Lounge",
    filters: createPresetFilters([-8, -2, 4, 13, 4, 0, -5, 6, 3]),
  },
  {
    name: "Piano",
    filters: createPresetFilters([6, 0, 9, 10, 5, 11, 15, 10, 11]),
  },
  {
    name: "Pop",
    filters: createPresetFilters([-4, 0, 6, 15, 13, 6, 0, -3, -5]),
  },
  {
    name: "Rock",
    filters: createPresetFilters([13, 10, 4, -1, -2, 1, 8, 11, 15]),
  },
];

const defaultPresetMap = new Map(
  DEFAULT_PRESETS.map((preset) => [preset.name, preset.filters]),
);

export const isDefaultPresetName = (name: string): boolean => {
  return defaultPresetMap.has(name);
};

export const getAvailablePresetNames = (
  userPresetNames: string[],
  options: { includeDefaultPresets?: boolean } = {},
): string[] => {
  const defaultNames = DEFAULT_PRESETS.map((preset) => preset.name);
  const userNames = userPresetNames.filter((name) => !isDefaultPresetName(name));

  if (options.includeDefaultPresets === false) {
    return userNames;
  }

  return [...userNames, ...defaultNames];
};

export const resolvePresetFilters = (
  name: string,
  userPresets: PresetStorage | undefined,
): EqualizerPersistedFilter[] | undefined => {
  return defaultPresetMap.get(name) ?? userPresets?.[name];
};
