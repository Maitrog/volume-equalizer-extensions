import { readAutostartRule, type AutostartWhitelistEntry } from "../autostart/autostartRules";
import { MAX_POINT_COUNT, MIN_POINT_COUNT } from "../equalizer/equalizerMath";
import type { EqualizerFilter } from "../equalizer/types";
import { AVAILABLE_LANGUAGE_CODES, type AvailableLanguageCode } from "../localization/languages";
import { parsePresetImportData } from "../presets/presetImport";
import {
  areShortcutsEqual,
  normalizeShortcutKey,
  type Shortcut,
  type ShortcutMap,
} from "../shortcuts/shortcuts";

export type SettingsGroup = "general" | "shortcuts" | "autostartRules" | "presets";
export type GeneralSettings = {
  theme: "dark" | "light";
  uiLanguage: AvailableLanguageCode;
  pointCount: number;
  enableSpectrum: boolean;
  enableVolumeCompensation: boolean;
  skipPointsResetConfirm: boolean;
};
export type TransferPresets = {
  presets: Record<string, EqualizerFilter[]>;
  presetNames: string[];
  hideDefaultPresets?: boolean;
};
export type TransferGroups = {
  general?: GeneralSettings;
  shortcuts?: ShortcutMap;
  autostartRules?: AutostartWhitelistEntry[];
  presets?: TransferPresets;
};
export type ResolvedSettings = Required<TransferGroups> & {
  presets: TransferPresets & { hideDefaultPresets: boolean };
};
export type TransferIssue = {
  group: SettingsGroup | null;
  code: string;
  path: string;
};
export type ParsedSettingsImport = { groups: TransferGroups; issues: TransferIssue[] };
export type SettingsParseResult =
  { ok: true; value: ParsedSettingsImport } | { ok: false; issues: TransferIssue[] };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const readShortcut = (value: unknown): Shortcut | null => {
  if (!isRecord(value)) return null;
  const key = normalizeShortcutKey(value.key);
  if (
    !key ||
    !["alt", "ctrl", "shift", "meta", "key"].every((field) => Object.hasOwn(value, field)) ||
    [value.alt, value.ctrl, value.shift, value.meta].some(
      (modifier) => typeof modifier !== "boolean",
    ) ||
    !(value.alt || value.ctrl || value.shift || value.meta)
  )
    return null;
  return {
    alt: value.alt as boolean,
    ctrl: value.ctrl as boolean,
    shift: value.shift as boolean,
    meta: value.meta as boolean,
    key,
  };
};

export const parseSettingsImport = (text: string): SettingsParseResult => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, issues: [{ group: null, code: "syntax", path: "$" }] };
  }
  if (!isRecord(parsed))
    return { ok: false, issues: [{ group: null, code: "structure", path: "$" }] };

  const groups: TransferGroups = {};
  const issues: TransferIssue[] = [];
  const issue = (group: SettingsGroup, code: TransferIssue["code"], path: string): void => {
    issues.push({ group, code, path });
  };
  if (!Object.hasOwn(parsed, "format") && !Object.hasOwn(parsed, "version")) {
    const legacy = parsePresetImportData(parsed);
    if (!legacy.ok)
      return {
        ok: false,
        issues: [
          {
            group: "presets",
            code: legacy.error,
            path: legacy.error === "name" ? "presetNames" : "presets",
          },
        ],
      };
    return {
      ok: true,
      value: {
        groups: { presets: { presets: legacy.presets, presetNames: legacy.presetNames } },
        issues,
      },
    };
  }
  if (parsed.format !== "eq-toolkit-settings")
    return { ok: false, issues: [{ group: null, code: "structure", path: "format" }] };
  if (parsed.version !== 1)
    return { ok: false, issues: [{ group: null, code: "version", path: "version" }] };
  if (!isRecord(parsed.settings))
    return { ok: false, issues: [{ group: null, code: "structure", path: "settings" }] };
  const settings = parsed.settings;

  if (Object.hasOwn(settings, "general")) {
    const general = settings.general;
    if (!isRecord(general)) {
      issue("general", "structure", "settings.general");
    } else {
      const invalidField = [
        "theme",
        "uiLanguage",
        "pointCount",
        "enableSpectrum",
        "enableVolumeCompensation",
        "skipPointsResetConfirm",
      ].find((field) => {
        if (!Object.hasOwn(general, field)) return true;
        const value = general[field];
        if (field === "theme") return value !== "dark" && value !== "light";
        if (field === "uiLanguage") return !AVAILABLE_LANGUAGE_CODES.some((code) => code === value);
        if (field === "pointCount")
          return (
            typeof value !== "number" ||
            !Number.isInteger(value) ||
            value < MIN_POINT_COUNT ||
            value > MAX_POINT_COUNT
          );
        return typeof value !== "boolean";
      });
      if (invalidField) {
        issue("general", "value", `settings.general.${invalidField}`);
      } else {
        groups.general = {
          theme: general.theme as GeneralSettings["theme"],
          uiLanguage: general.uiLanguage as AvailableLanguageCode,
          pointCount: general.pointCount as number,
          enableSpectrum: general.enableSpectrum as boolean,
          enableVolumeCompensation: general.enableVolumeCompensation as boolean,
          skipPointsResetConfirm: general.skipPointsResetConfirm as boolean,
        };
      }
    }
  }

  if (Object.hasOwn(settings, "shortcuts")) {
    const shortcuts = settings.shortcuts;
    if (!isRecord(shortcuts)) {
      issue("shortcuts", "shortcut", "settings.shortcuts");
    } else {
      const mute = readShortcut(shortcuts.mute);
      const toggleEq = readShortcut(shortcuts.toggleEq);
      const invalid = ["mute", "toggleEq"].find(
        (action) =>
          !Object.hasOwn(shortcuts, action) ||
          (shortcuts[action] !== null && (action === "mute" ? !mute : !toggleEq)),
      );
      if (invalid) issue("shortcuts", "shortcut", `settings.shortcuts.${invalid}`);
      else if (mute && toggleEq && areShortcutsEqual(mute, toggleEq))
        issue("shortcuts", "shortcut", "settings.shortcuts.toggleEq");
      else groups.shortcuts = { mute, toggleEq };
    }
  }

  if (Object.hasOwn(settings, "autostartRules")) {
    if (!Array.isArray(settings.autostartRules)) {
      issue("autostartRules", "structure", "settings.autostartRules");
    } else {
      const rules = new Map<string, AutostartWhitelistEntry>();
      const issuesBefore = issues.length;
      settings.autostartRules.forEach((value, index) => {
        const rule = readAutostartRule(value);
        const path = `settings.autostartRules[${index}]`;
        if (!rule) {
          issue("autostartRules", "value", path);
          return;
        }
        const previous = rules.get(rule.id);
        if (previous && previous.presetName !== rule.presetName)
          issue("autostartRules", "duplicateRule", path);
        else if (!previous) rules.set(rule.id, rule);
      });
      if (issues.length === issuesBefore) groups.autostartRules = [...rules.values()];
    }
  }

  if (Object.hasOwn(settings, "presets")) {
    const value = settings.presets;
    const rawPresets = isRecord(value) ? value.presets : null;
    const rawNames = isRecord(value) ? value.presetNames : null;
    if (
      !isRecord(value) ||
      !isRecord(rawPresets) ||
      !Array.isArray(rawNames) ||
      Object.keys(rawPresets).length !== rawNames.length ||
      !Object.keys(rawPresets).every((name) => rawNames.includes(name))
    ) {
      issue("presets", "structure", "settings.presets.presets");
    } else {
      const presets = parsePresetImportData(value);
      if (!presets.ok) {
        issue(
          "presets",
          presets.error,
          presets.error === "name" ? "settings.presets.presetNames" : "settings.presets.presets",
        );
      } else if (
        Object.hasOwn(value, "hideDefaultPresets") &&
        typeof value.hideDefaultPresets !== "boolean"
      ) {
        issue("presets", "value", "settings.presets.hideDefaultPresets");
      } else {
        groups.presets = { presets: presets.presets, presetNames: presets.presetNames };
        if (typeof value.hideDefaultPresets === "boolean")
          groups.presets.hideDefaultPresets = value.hideDefaultPresets;
      }
    }
  }

  if (Object.keys(groups).length === 0)
    return { ok: false, issues: [...issues, { group: null, code: "noGroups", path: "settings" }] };
  return { ok: true, value: { groups, issues } };
};

const exportShortcut = (shortcut: Shortcut | null): Shortcut | null =>
  shortcut === null
    ? null
    : {
        alt: shortcut.alt,
        ctrl: shortcut.ctrl,
        shift: shortcut.shift,
        meta: shortcut.meta,
        key: shortcut.key,
      };

export const serializeSettingsExport = (settings: ResolvedSettings): string => {
  const presets: Record<string, EqualizerFilter[]> = Object.create(null);
  for (const name of settings.presets.presetNames) {
    presets[name] = settings.presets.presets[name].map((filter) => ({
      type: filter.type,
      freq: filter.freq,
      gain: filter.gain,
      q: filter.q,
      ...(filter.enabled === undefined ? {} : { enabled: filter.enabled }),
    }));
  }
  return JSON.stringify(
    {
      format: "eq-toolkit-settings",
      version: 1,
      settings: {
        general: {
          theme: settings.general.theme,
          uiLanguage: settings.general.uiLanguage,
          pointCount: settings.general.pointCount,
          enableSpectrum: settings.general.enableSpectrum,
          enableVolumeCompensation: settings.general.enableVolumeCompensation,
          skipPointsResetConfirm: settings.general.skipPointsResetConfirm,
        },
        shortcuts: {
          mute: exportShortcut(settings.shortcuts.mute),
          toggleEq: exportShortcut(settings.shortcuts.toggleEq),
        },
        autostartRules: settings.autostartRules.map((rule) => ({
          type: rule.type,
          value: rule.value,
          presetName: rule.presetName,
        })),
        presets: {
          hideDefaultPresets: settings.presets.hideDefaultPresets,
          presetNames: settings.presets.presetNames,
          presets,
        },
      },
    },
    null,
    2,
  );
};
