import { readAutostartRule, type AutostartWhitelistEntry } from "../autostart/autostartRules";
import { isEqualizerFilterEnabled } from "../equalizer/defaultFilters";
import type { EqualizerFilter } from "../equalizer/types";
import { isDefaultPresetName, resolvePresetFilters } from "../presets/defaultPresets";
import { areShortcutsEqual } from "../shortcuts/shortcuts";

import type {
  ResolvedSettings,
  SettingsGroup,
  TransferGroups,
  TransferIssue,
} from "./settingsTransfer";

export type ImportDecisions = Readonly<Record<string, "current" | "incoming">>;
export type ListCounts = {
  added: number;
  replaced: number;
  kept: number;
  identical: number;
  skipped: number;
};
export type ImportConflict =
  | {
      id: string;
      group: "presets";
      key: string;
      current: EqualizerFilter[];
      incoming: EqualizerFilter[];
      affectedRules: number;
    }
  | {
      id: string;
      group: "autostartRules";
      key: string;
      current: AutostartWhitelistEntry;
      incoming: AutostartWhitelistEntry;
    };
export type SettingsImportPlan = {
  next: ResolvedSettings;
  changedGroups: SettingsGroup[];
  conflicts: ImportConflict[];
  warnings: TransferIssue[];
  blockers: TransferIssue[];
  counts: Record<"presets" | "autostartRules", ListCounts>;
  canApply: boolean;
};

const equalFilters = (current: EqualizerFilter[], incoming: EqualizerFilter[]): boolean =>
  current.length === incoming.length &&
  current.every((filter, index) => {
    const other = incoming[index];
    return (
      filter.type === other.type &&
      filter.freq === other.freq &&
      filter.gain === other.gain &&
      filter.q === other.q &&
      isEqualizerFilterEnabled(filter) === isEqualizerFilterEnabled(other)
    );
  });

const emptyCounts = (): ListCounts => ({
  added: 0,
  replaced: 0,
  kept: 0,
  identical: 0,
  skipped: 0,
});

export const buildSettingsImportPlan = (
  current: ResolvedSettings,
  incoming: TransferGroups,
  selected: readonly SettingsGroup[],
  decisions: ImportDecisions,
): SettingsImportPlan => {
  const next: ResolvedSettings = { ...current };
  const changed = new Set<SettingsGroup>();
  const conflicts: ImportConflict[] = [];
  const warnings: TransferIssue[] = [];
  const blockers: TransferIssue[] = [];
  const counts = { presets: emptyCounts(), autostartRules: emptyCounts() };
  const localRules = current.autostartRules.map(readAutostartRule);
  const emptiedPresets = new Set<string>();

  if (selected.includes("general") && incoming.general) {
    const general = incoming.general;
    if (
      (Object.keys(general) as (keyof typeof general)[]).some(
        (key) => general[key] !== current.general[key],
      )
    ) {
      next.general = general;
      changed.add("general");
    }
  }
  if (selected.includes("shortcuts") && incoming.shortcuts) {
    const shortcuts = incoming.shortcuts;
    if (
      !areShortcutsEqual(current.shortcuts.mute, shortcuts.mute) ||
      !areShortcutsEqual(current.shortcuts.toggleEq, shortcuts.toggleEq)
    ) {
      next.shortcuts = shortcuts;
      changed.add("shortcuts");
    }
  }

  if (selected.includes("presets") && incoming.presets) {
    const presets = { ...current.presets.presets };
    const presetNames = [...current.presets.presetNames];
    const hideDefaultPresets =
      incoming.presets.hideDefaultPresets ?? current.presets.hideDefaultPresets;
    if (hideDefaultPresets !== current.presets.hideDefaultPresets) changed.add("presets");
    for (const name of incoming.presets.presetNames) {
      const filters = incoming.presets.presets[name];
      if (isDefaultPresetName(name)) {
        warnings.push({ group: "presets", code: "protected-preset", path: name });
        counts.presets.skipped++;
        continue;
      }
      if (!Object.hasOwn(presets, name)) {
        presets[name] = filters;
        presetNames.push(name);
        counts.presets.added++;
        changed.add("presets");
        continue;
      }
      if (equalFilters(presets[name], filters)) {
        counts.presets.identical++;
        continue;
      }
      const id = JSON.stringify(["presets", name]);
      conflicts.push({
        id,
        group: "presets",
        key: name,
        current: presets[name],
        incoming: filters,
        affectedRules: localRules.filter((entry) => entry?.presetName === name).length,
      });
      if (decisions[id] === "current") counts.presets.kept++;
      if (decisions[id] === "incoming") {
        if (presets[name].length > 0 && filters.length === 0) emptiedPresets.add(name);
        presets[name] = filters;
        counts.presets.replaced++;
        changed.add("presets");
      }
    }
    next.presets = { presets, presetNames, hideDefaultPresets };
  }

  const finalRules = [...localRules];
  if (selected.includes("autostartRules") && incoming.autostartRules) {
    const byKey = new Map<string, { entry: AutostartWhitelistEntry; positions: number[] }>();
    const ambiguousKeys = new Set<string>();
    localRules.forEach((entry, index) => {
      if (!entry) return;
      const existing = byKey.get(entry.id);
      if (!existing) {
        byKey.set(entry.id, { entry, positions: [index] });
      } else {
        existing.positions.push(index);
        if (existing.entry.presetName !== entry.presetName) ambiguousKeys.add(entry.id);
      }
    });
    for (const key of ambiguousKeys)
      blockers.push({ group: "autostartRules", code: "ambiguous-local-rule", path: key });
    if (ambiguousKeys.size === 0) {
      const rules = [...current.autostartRules];
      for (const entry of incoming.autostartRules) {
        const key = entry.id;
        if (!resolvePresetFilters(entry.presetName, next.presets.presets)?.length) {
          warnings.push({
            group: "autostartRules",
            code: "missing-preset",
            path: `${key} → ${entry.presetName}`,
          });
          counts.autostartRules.skipped++;
          continue;
        }
        const local = byKey.get(key);
        if (!local) {
          rules.push(entry);
          finalRules.push(entry);
          counts.autostartRules.added++;
          changed.add("autostartRules");
          continue;
        }
        if (local.entry.presetName === entry.presetName) {
          counts.autostartRules.identical++;
          continue;
        }
        const id = JSON.stringify(["autostartRules", key]);
        conflicts.push({ id, group: "autostartRules", key, current: local.entry, incoming: entry });
        if (decisions[id] === "current") counts.autostartRules.kept++;
        if (decisions[id] === "incoming") {
          for (const index of local.positions) {
            rules[index] = entry;
            finalRules[index] = entry;
          }
          counts.autostartRules.replaced++;
          changed.add("autostartRules");
        }
      }
      next.autostartRules = rules;
    }
  }

  for (const entry of finalRules) {
    if (entry && emptiedPresets.has(entry.presetName))
      blockers.push({
        group: "presets",
        code: "retained-rule-dependency",
        path: `${entry.id} → ${entry.presetName}`,
      });
  }

  return {
    next,
    changedGroups: (["general", "shortcuts", "autostartRules", "presets"] as const).filter(
      (group) => changed.has(group),
    ),
    conflicts,
    warnings,
    blockers,
    counts,
    canApply:
      blockers.length === 0 &&
      conflicts.every(({ id }) => decisions[id] === "current" || decisions[id] === "incoming"),
  };
};
