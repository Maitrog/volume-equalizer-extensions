import { describe, expect, test } from "vitest";
import { validatePresetName } from "./presetNameValidation";

describe("validatePresetName", () => {
  test("trims a valid new name", () => {
    expect(validatePresetName("  My preset  ", [])).toEqual({
      kind: "valid",
      name: "My preset",
    });
  });

  test("rejects empty, reserved, and duplicate names", () => {
    expect(validatePresetName("   ", [])).toEqual({
      kind: "error",
      reason: "empty",
    });
    expect(validatePresetName("Rock", [])).toEqual({
      kind: "error",
      reason: "reserved",
    });
    expect(validatePresetName("Mine", ["Mine"])).toEqual({
      kind: "error",
      reason: "duplicate",
    });
  });
});
