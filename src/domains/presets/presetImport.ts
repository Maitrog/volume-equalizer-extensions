import { readPersistedFilter } from "../equalizer/persistedFilters";
import type { EqualizerFilter } from "../equalizer/types";

export type PresetImportResult =
  | {
      ok: true;
      presets: Record<string, EqualizerFilter[]>;
      presetNames: string[];
    }
  | { ok: false; error: "syntax" | "structure" | "name" | "filter" };

const unsafeNames = new Set(["__proto__", "constructor", "prototype"]);

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  return value !== null && typeof value === "object" && !Array.isArray(value);
};

export const parsePresetImport = (text: string): PresetImportResult => {
  try {
    return parsePresetImportData(JSON.parse(text));
  } catch {
    return { ok: false, error: "syntax" };
  }
};

export const parsePresetImportData = (parsed: unknown): PresetImportResult => {
  if (
    !isPlainObject(parsed) ||
    !Object.hasOwn(parsed, "presetNames") ||
    !Object.hasOwn(parsed, "presets") ||
    !Array.isArray(parsed.presetNames) ||
    !isPlainObject(parsed.presets)
  ) {
    return { ok: false, error: "structure" };
  }

  const presets: Record<string, EqualizerFilter[]> = Object.create(null);
  const presetNames: string[] = [];
  for (const rawName of parsed.presetNames) {
    if (typeof rawName !== "string") return { ok: false, error: "name" };
    const name = rawName.trim();
    if (!name || presetNames.includes(name) || unsafeNames.has(name)) {
      return { ok: false, error: "name" };
    }
    if (!Object.hasOwn(parsed.presets, rawName)) return { ok: false, error: "structure" };
    const filters = parsed.presets[rawName];
    if (!Array.isArray(filters)) return { ok: false, error: "structure" };
    const normalized = filters.map(readPersistedFilter);
    if (normalized.some((filter) => filter == null)) {
      return { ok: false, error: "filter" };
    }
    presetNames.push(name);
    presets[name] = normalized as EqualizerFilter[];
  }
  return { ok: true, presets, presetNames };
};
