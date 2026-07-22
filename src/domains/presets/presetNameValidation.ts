import { isDefaultPresetName } from "./defaultPresets";

export type PresetNameValidation =
  | { kind: "valid"; name: string }
  | { kind: "error"; reason: "empty" | "reserved" | "duplicate" };

export const validatePresetName = (
  rawName: string,
  userPresetNames: readonly string[],
): PresetNameValidation => {
  const name = rawName.trim();
  if (!name) return { kind: "error", reason: "empty" };
  if (isDefaultPresetName(name)) return { kind: "error", reason: "reserved" };
  if (userPresetNames.includes(name)) return { kind: "error", reason: "duplicate" };
  return { kind: "valid", name };
};
