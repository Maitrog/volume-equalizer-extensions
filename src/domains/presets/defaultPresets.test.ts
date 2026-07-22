import { describe, expect, test } from "vitest";

import {
  DEFAULT_PRESETS,
  getAvailablePresetNames,
  isDefaultPresetName,
  resolvePresetFilters,
} from "./defaultPresets";

describe("default presets", () => {
  test("keeps user preset names before default preset names", () => {
    const names = getAvailablePresetNames(["Custom", DEFAULT_PRESETS[0].name]);

    expect(names[0]).toBe("Custom");
    expect(names.slice(1)).toEqual(
      DEFAULT_PRESETS.map((preset) => preset.name),
    );
    expect(names.filter((name) => name === DEFAULT_PRESETS[0].name)).toHaveLength(1);
  });

  test("hides default preset names when requested", () => {
    expect(
      getAvailablePresetNames(["Custom", DEFAULT_PRESETS[0].name], {
        includeDefaultPresets: false,
      }),
    ).toEqual(["Custom"]);
  });

  test("resolves default presets without user storage", () => {
    const preset = DEFAULT_PRESETS[0];

    expect(resolvePresetFilters(preset.name, {})).toEqual(preset.filters);
  });

  test("marks default presets as immutable", () => {
    expect(isDefaultPresetName(DEFAULT_PRESETS[0].name)).toBe(true);
    expect(isDefaultPresetName("Custom")).toBe(false);
  });
});
