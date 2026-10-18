import {
  findAmbiguousAutostartRuleKeys,
  readAutostartRule,
} from "../../domains/autostart/autostartRules";
import type { EqualizerFilter } from "../../domains/equalizer/types";
import { parsePresetImportData } from "../../domains/presets/presetImport";
import {
  buildSettingsImportPlan,
  type ImportDecisions,
  type SettingsImportPlan,
} from "../../domains/settings/settingsImport";
import {
  parseSettingsImport,
  parseSettingsPreferencesData,
  serializeSettingsExport,
  type ParsedSettingsImport,
  type ResolvedSettings,
  type SettingsGroup,
  type TransferIssue,
} from "../../domains/settings/settingsTransfer";
import { STORAGE_KEYS } from "../../infrastructure/chrome/storageKeys";
import {
  createEqualizerState,
  type EqualizerCanvasDimensions,
} from "../../ui/equalizerCanvas/equalizerEditorState";
import { resolveSettingsPreferences } from "./settingsActions";

export type ImportTarget = {
  tabId: number | null;
  selectionGeneration: number;
  title: string;
  captured: boolean;
  enabled: boolean;
  filters: EqualizerFilter[];
};
export type ImportSession = {
  source: ParsedSettingsImport;
  current: ResolvedSettings;
  raw: Record<string, unknown>;
  target: ImportTarget;
  localIssues: TransferIssue[];
};
export type PreparedSettingsImport = {
  plan: SettingsImportPlan;
  reset: null | {
    tabId: number | null;
    title: string;
    oldPointCount: number;
    newPointCount: number;
    filters: EqualizerFilter[];
    enableEq: boolean;
    requiresConfirmation: boolean;
  };
};
export type SettingsTransferDependencies = {
  localStorage: chrome.storage.StorageArea;
  browserLocale: string;
  waitForPendingChanges(): Promise<void>;
  readTarget(): Promise<ImportTarget>;
  getDimensions(): EqualizerCanvasDimensions;
};
export type PrepareImportResult =
  { ok: true; session: ImportSession } | { ok: false; issues: TransferIssue[] };
export type CommitImportResult =
  | { status: "saved" | "unchanged"; prepared: PreparedSettingsImport }
  | { status: "stale"; session: ImportSession }
  | { status: "blocked"; prepared: PreparedSettingsImport };

const generalKeys = [
  STORAGE_KEYS.THEME,
  STORAGE_KEYS.UI_LANGUAGE,
  STORAGE_KEYS.POINT_COUNT,
  STORAGE_KEYS.ENABLE_SPECTRUM,
  STORAGE_KEYS.ENABLE_VOLUME_COMPENSATION,
  STORAGE_KEYS.SKIP_POINTS_CONFIRM,
];
const listKeys = [
  STORAGE_KEYS.PRESETS,
  STORAGE_KEYS.PRESET_NAMES,
  STORAGE_KEYS.HIDE_DEFAULT_PRESETS,
  STORAGE_KEYS.AUTOSTART_RULES,
];
const settingsKeys = [...generalKeys, STORAGE_KEYS.SHORTCUTS, ...listKeys];
const runtimeKeys = (tabId: number | null): string[] =>
  tabId === null
    ? []
    : [STORAGE_KEYS.FILTERS, STORAGE_KEYS.tabFilters(tabId), STORAGE_KEYS.tabEnabled(tabId)];

const equalValues = (left: unknown, right: unknown): boolean => {
  if (left === right) return true;
  if (left === null || right === null || typeof left !== "object" || typeof right !== "object")
    return false;
  if (Array.isArray(left) || Array.isArray(right))
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => equalValues(value, right[index]))
    );
  const a = left as Record<string, unknown>;
  const b = right as Record<string, unknown>;
  return (
    Object.keys(a).length === Object.keys(b).length &&
    Object.keys(a).every((key) => Object.hasOwn(b, key) && equalValues(a[key], b[key]))
  );
};

export const createSettingsTransferActions = (deps: SettingsTransferDependencies) => {
  const readSnapshot = async (target?: ImportTarget) => {
    const keys = [...settingsKeys, ...runtimeKeys(target?.tabId ?? null)];
    const stored: Record<string, unknown> = await deps.localStorage.get(keys);
    const raw = structuredClone(
      Object.fromEntries(
        keys.filter((key) => Object.hasOwn(stored, key)).map((key) => [key, stored[key]]),
      ),
    );
    const { general, shortcuts, hideDefaultPresets } = resolveSettingsPreferences(
      raw,
      deps.browserLocale,
    );
    const preferences = parseSettingsPreferencesData({ general, shortcuts });
    const localIssues = preferences.issues;
    const presets = parsePresetImportData({
      presets: Object.hasOwn(raw, STORAGE_KEYS.PRESETS) ? raw[STORAGE_KEYS.PRESETS] : {},
      presetNames: Object.hasOwn(raw, STORAGE_KEYS.PRESET_NAMES)
        ? raw[STORAGE_KEYS.PRESET_NAMES]
        : [],
    });
    const rawPresets = raw[STORAGE_KEYS.PRESETS];
    const rawNames = raw[STORAGE_KEYS.PRESET_NAMES];
    const unlistedPresets =
      presets.ok &&
      rawPresets !== undefined &&
      (Object.keys(rawPresets as object).length !== presets.presetNames.length ||
        !Object.keys(rawPresets as object).every((name) => (rawNames as unknown[]).includes(name)));
    if (!presets.ok || unlistedPresets)
      localIssues.push({
        group: "presets",
        code: presets.ok ? "structure" : presets.error,
        path: "presets",
      });
    const rawRules = Object.hasOwn(raw, STORAGE_KEYS.AUTOSTART_RULES)
      ? raw[STORAGE_KEYS.AUTOSTART_RULES]
      : [];
    const rules = Array.isArray(rawRules) ? rawRules.map(readAutostartRule) : [];
    if (!Array.isArray(rawRules) || rules.some((rule) => rule === null))
      localIssues.push({ group: "autostartRules", code: "value", path: "whitelist" });
    const autostartRules = rules.filter((rule) => rule !== null);
    for (const key of findAmbiguousAutostartRuleKeys(autostartRules))
      localIssues.push({ group: "autostartRules", code: "ambiguous-local-rule", path: key });
    const current: ResolvedSettings = {
      general,
      shortcuts,
      presets: {
        ...(presets.ok
          ? { presets: presets.presets, presetNames: presets.presetNames }
          : { presets: {}, presetNames: [] }),
        hideDefaultPresets,
      },
      autostartRules,
    };
    return { current, raw, localIssues };
  };

  const readSession = async (source: ParsedSettingsImport): Promise<ImportSession> => {
    const target = structuredClone(await deps.readTarget());
    return { source, target, ...(await readSnapshot(target)) };
  };

  const loadSettingsSnapshot = async (): Promise<ResolvedSettings> => {
    const snapshot = await readSnapshot();
    if (snapshot.localIssues.length > 0)
      throw Object.assign(new Error("Invalid local settings"), { issues: snapshot.localIssues });
    return snapshot.current;
  };

  const previewImport = (
    session: ImportSession,
    selected: readonly SettingsGroup[],
    decisions: ImportDecisions,
  ): PreparedSettingsImport => {
    const plan = buildSettingsImportPlan(
      session.current,
      session.source.groups,
      selected,
      decisions,
    );
    const importsLists = selected.some(
      (group) =>
        (group === "presets" || group === "autostartRules") &&
        session.source.groups[group] !== undefined,
    );
    const localBlockers = session.localIssues.filter(
      (issue) =>
        issue.group !== null &&
        (selected.includes(issue.group) ||
          (importsLists && (issue.group === "presets" || issue.group === "autostartRules"))),
    );
    plan.blockers.push(
      ...localBlockers,
      ...session.source.issues.filter(
        (issue) => issue.group !== null && selected.includes(issue.group),
      ),
    );
    plan.canApply &&= plan.blockers.length === 0;
    const general = selected.includes("general") ? session.source.groups.general : undefined;
    const oldPointCount = session.target.filters.filter(
      (filter) => filter.type === "peaking",
    ).length;
    if (!general || general.pointCount === oldPointCount) return { plan, reset: null };
    const dimensions = deps.getDimensions();
    const state = createEqualizerState();
    state.initPoints(general.pointCount, dimensions);
    return {
      plan,
      reset: {
        tabId: session.target.tabId,
        title: session.target.title,
        oldPointCount,
        newPointCount: general.pointCount,
        filters: state.getFilters(dimensions),
        enableEq:
          session.target.tabId !== null && !session.target.captured && !session.target.enabled,
        requiresConfirmation: session.target.tabId !== null,
      },
    };
  };

  const commitImport = async (
    session: ImportSession,
    selected: readonly SettingsGroup[],
    decisions: ImportDecisions,
    resetConfirmed: boolean,
  ): Promise<CommitImportResult> => {
    await deps.waitForPendingChanges();
    const prepared = previewImport(session, selected, decisions);
    const fresh = await readSession(session.source);
    const relevantKeys: string[] = [];
    const importsGeneral =
      selected.includes("general") && session.source.groups.general !== undefined;
    if (importsGeneral) relevantKeys.push(...generalKeys);
    if (selected.includes("shortcuts") && session.source.groups.shortcuts)
      relevantKeys.push(STORAGE_KEYS.SHORTCUTS);
    if (
      selected.some(
        (group) =>
          (group === "presets" || group === "autostartRules") && session.source.groups[group],
      )
    )
      relevantKeys.push(...listKeys);
    if (prepared.reset) relevantKeys.push(...runtimeKeys(session.target.tabId));
    const targetChanged = importsGeneral && !equalValues(session.target, fresh.target);
    if (targetChanged || relevantKeys.some((key) => !equalValues(session.raw[key], fresh.raw[key])))
      return { status: "stale", session: fresh };
    if (!prepared.plan.canApply || (prepared.reset?.requiresConfirmation && !resetConfirmed))
      return { status: "blocked", prepared };

    const { next, changedGroups } = prepared.plan;
    const patch: Record<string, unknown> = {};
    if (changedGroups.includes("general")) {
      for (const key of Object.keys(next.general) as (keyof typeof next.general)[]) {
        if (next.general[key] !== session.current.general[key]) patch[key] = next.general[key];
      }
    }
    if (changedGroups.includes("shortcuts")) patch[STORAGE_KEYS.SHORTCUTS] = next.shortcuts;
    if (changedGroups.includes("autostartRules"))
      patch[STORAGE_KEYS.AUTOSTART_RULES] = next.autostartRules;
    if (changedGroups.includes("presets")) {
      for (const key of [
        STORAGE_KEYS.PRESETS,
        STORAGE_KEYS.PRESET_NAMES,
        STORAGE_KEYS.HIDE_DEFAULT_PRESETS,
      ] as const) {
        if (!equalValues(next.presets[key], session.current.presets[key]))
          patch[key] = next.presets[key];
      }
    }
    if (prepared.reset && prepared.reset.tabId !== null) {
      patch[STORAGE_KEYS.FILTERS] = prepared.reset.filters;
      patch[STORAGE_KEYS.tabFilters(prepared.reset.tabId)] = prepared.reset.filters;
      if (!session.target.captured) patch[STORAGE_KEYS.tabEnabled(prepared.reset.tabId)] = true;
    }
    if (Object.keys(patch).length === 0) return { status: "unchanged", prepared };
    await deps.localStorage.set(patch);
    return { status: "saved", prepared };
  };

  return {
    exportSettings: async (): Promise<string> => {
      await deps.waitForPendingChanges();
      return serializeSettingsExport(await loadSettingsSnapshot());
    },
    loadSettingsSnapshot,
    prepareImport: async (text: string): Promise<PrepareImportResult> => {
      const parsed = parseSettingsImport(text);
      if (!parsed.ok) return parsed;
      await deps.waitForPendingChanges();
      return { ok: true, session: await readSession(parsed.value) };
    },
    previewImport,
    commitImport,
  };
};

export type SettingsTransferActions = ReturnType<typeof createSettingsTransferActions>;
