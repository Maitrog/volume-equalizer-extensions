import { describe, expect, test } from "vitest";
import { findWhitelistMatch } from "../autostart/autostartRules";

import {
  parseSettingsImport,
  serializeSettingsExport,
  type ResolvedSettings,
} from "./settingsTransfer";

const general = {
  theme: "dark" as const,
  uiLanguage: "ru" as const,
  pointCount: 5,
  enableSpectrum: true,
  enableVolumeCompensation: false,
  skipPointsResetConfirm: false,
};
const altM = { alt: true, ctrl: false, shift: false, meta: false, key: "M" };
const presets = {
  Voice: [20001, 1000.4, 0.5].map((freq) => ({ type: "peaking" as const, freq, gain: 2, q: 0.5 })),
};

describe("settings transfer", () => {
  test("round trips four groups without derived ids or runtime keys", () => {
    const snapshot: ResolvedSettings & { captureTabIds: number[]; "filters.1": unknown[] } = {
      general,
      shortcuts: { mute: altM, toggleEq: { ...altM, key: "K" } },
      autostartRules: [
        { id: "domain:example.com", type: "domain", value: "example.com", presetName: "Voice" },
      ],
      presets: { presets, presetNames: ["Voice"], hideDefaultPresets: false },
      captureTabIds: [1],
      "filters.1": [],
    };
    const expectedFile = {
      format: "eq-toolkit-settings",
      version: 1,
      settings: {
        general: {
          theme: "dark",
          uiLanguage: "ru",
          pointCount: 5,
          enableSpectrum: true,
          enableVolumeCompensation: false,
          skipPointsResetConfirm: false,
        },
        shortcuts: {
          mute: { alt: true, ctrl: false, shift: false, meta: false, key: "M" },
          toggleEq: { alt: true, ctrl: false, shift: false, meta: false, key: "K" },
        },
        autostartRules: [{ type: "domain", value: "example.com", presetName: "Voice" }],
        presets: {
          hideDefaultPresets: false,
          presetNames: ["Voice"],
          presets,
        },
      },
    };
    const text = serializeSettingsExport(snapshot);
    expect(JSON.parse(text)).toEqual(expectedFile);
    expect(text).toContain('\n  "format"');
    expect(text).not.toMatch(/"id"|filters\.1|captureTabIds/);
    expect(parseSettingsImport(text)).toEqual({
      ok: true,
      value: {
        groups: {
          general,
          shortcuts: snapshot.shortcuts,
          autostartRules: snapshot.autostartRules,
          presets: snapshot.presets,
        },
        issues: [],
      },
    });
  });

  test("imports legacy presets without changing visibility", () => {
    const result = parseSettingsImport(
      JSON.stringify({ presets, presetNames: ["Voice"], hideDefaultPresets: true, ignored: true }),
    );
    expect(result).toEqual({
      ok: true,
      value: { groups: { presets: { presets, presetNames: ["Voice"] } }, issues: [] },
    });
  });

  test("preserves preset and filter order including disabled crossovers", () => {
    const snapshot: ResolvedSettings = {
      general,
      shortcuts: { mute: null, toggleEq: null },
      autostartRules: [],
      presets: {
        hideDefaultPresets: true,
        presetNames: ["Second", "First"],
        presets: {
          First: [],
          Second: [
            { type: "highpass", freq: 20, gain: 0, q: 0.5, enabled: false },
            { type: "peaking", freq: 1000, gain: 1000, q: 0.5 },
            { type: "lowpass", freq: 20000, gain: 0, q: 0.5, enabled: false },
          ],
        },
      },
    };
    expect(JSON.parse(serializeSettingsExport(snapshot)).settings.presets).toEqual({
      hideDefaultPresets: true,
      presetNames: ["Second", "First"],
      presets: {
        Second: [
          { type: "highpass", freq: 20, gain: 0, q: 0.5, enabled: false },
          { type: "peaking", freq: 1000, gain: 1000, q: 0.5 },
          { type: "lowpass", freq: 20000, gain: 0, q: 0.5, enabled: false },
        ],
        First: [],
      },
    });
  });

  test("does not reinterpret unknown version as legacy", () => {
    expect(
      parseSettingsImport(
        JSON.stringify({
          format: "eq-toolkit-settings",
          version: 2,
          presets,
          presetNames: ["Voice"],
        }),
      ),
    ).toMatchObject({ ok: false, issues: [{ code: "version", path: "version" }] });
  });

  test("keeps valid presets when general is malformed", () => {
    const result = parseSettingsImport(
      JSON.stringify({
        format: "eq-toolkit-settings",
        version: 1,
        settings: { general: { theme: "dark" }, presets: { presets, presetNames: ["Voice"] } },
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.groups.general).toBeUndefined();
    expect(result.value.groups.presets).toEqual({ presets, presetNames: ["Voice"] });
    expect(result.value.issues).toMatchObject([{ group: "general", code: "value" }]);
  });

  test.each([
    { pointCount: 4 },
    { pointCount: 10 },
    { pointCount: 5.5 },
    { pointCount: "5" },
    { enableSpectrum: "false" },
    { uiLanguage: "unknown" },
    { theme: "auto" },
    { enableVolumeCompensation: 0 },
    { skipPointsResetConfirm: null },
  ])("validates settings without coercion: %j", (change) => {
    expect(
      parseSettingsImport(
        JSON.stringify({
          format: "eq-toolkit-settings",
          version: 1,
          settings: { general: { ...general, ...change } },
        }),
      ),
    ).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([
        expect.objectContaining({ group: "general", code: "value" }),
      ]),
    });
  });

  test.each([5, 9])("accepts point count %s", (pointCount) => {
    expect(
      parseSettingsImport(
        JSON.stringify({
          format: "eq-toolkit-settings",
          version: 1,
          settings: { general: { ...general, pointCount } },
        }),
      ),
    ).toMatchObject({ ok: true, value: { groups: { general: { pointCount } } } });
  });

  test("supports disabled shortcuts but rejects duplicate active combinations", () => {
    const file = {
      format: "eq-toolkit-settings",
      version: 1,
      settings: { shortcuts: { mute: null as unknown, toggleEq: { ...altM, key: "m" } } },
    };
    expect(parseSettingsImport(JSON.stringify(file))).toMatchObject({
      ok: true,
      value: { groups: { shortcuts: { mute: null, toggleEq: altM } } },
    });
    file.settings.shortcuts.mute = altM;
    expect(parseSettingsImport(JSON.stringify(file))).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([expect.objectContaining({ code: "shortcut" })]),
    });
  });

  test.each([
    {},
    { mute: null },
    { mute: { ...altM, alt: "true" }, toggleEq: null },
    { mute: { ...altM, key: "Enter" }, toggleEq: null },
    { mute: { ...altM, alt: false }, toggleEq: null },
  ])("rejects malformed shortcuts %j", (shortcuts) => {
    expect(
      parseSettingsImport(
        JSON.stringify({ format: "eq-toolkit-settings", version: 1, settings: { shortcuts } }),
      ),
    ).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([expect.objectContaining({ code: "shortcut" })]),
    });
  });

  test.each<unknown>([
    { presetNames: ["Voice"], presets: { ...presets, Extra: [] } },
    { presetNames: [" Voice "], presets },
    { presetNames: ["Voice", " Voice "], presets: { ...presets, " Voice ": [] } },
    { presetNames: ["constructor"], presets: { constructor: [] } },
    { presetNames: [], presets: {}, hideDefaultPresets: "false" },
  ])("rejects mismatched keys, ambiguous names or invalid visibility %j", (group) => {
    expect(
      parseSettingsImport(
        JSON.stringify({ format: "eq-toolkit-settings", version: 1, settings: { presets: group } }),
      ),
    ).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([expect.objectContaining({ group: "presets" })]),
    });
  });

  test("compares raw preset keys before checking normalized names", () => {
    expect(
      parseSettingsImport(
        JSON.stringify({
          format: "eq-toolkit-settings",
          version: 1,
          settings: { presets: { presetNames: ["Voice", "Voice"], presets } },
        }),
      ),
    ).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([
        { group: "presets", code: "structure", path: "settings.presets.presets" },
      ]),
    });
  });

  test("collapses identical canonical rules and rejects conflicting destinations", () => {
    const file = {
      format: "eq-toolkit-settings",
      version: 1,
      settings: {
        autostartRules: [
          { id: "fake", type: "domain", value: "EXAMPLE.com", presetName: " Voice " },
          { type: "domain", value: "https://www.example.com/a", presetName: "Voice" },
        ],
      },
    };
    expect(parseSettingsImport(JSON.stringify(file))).toMatchObject({
      ok: true,
      value: {
        groups: {
          autostartRules: [
            { id: "domain:example.com", type: "domain", value: "example.com", presetName: "Voice" },
          ],
        },
      },
    });
    file.settings.autostartRules[1].presetName = "Other";
    expect(parseSettingsImport(JSON.stringify(file))).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([
        { group: "autostartRules", code: "duplicateRule", path: "settings.autostartRules[1]" },
      ]),
    });
  });

  test("collapses repeated rules at their last position to preserve matching precedence", () => {
    const result = parseSettingsImport(
      JSON.stringify({
        format: "eq-toolkit-settings",
        version: 1,
        settings: {
          autostartRules: [
            { type: "domain", value: "example.com", presetName: "Parent" },
            { type: "domain", value: "sub.example.com", presetName: "Child" },
            { type: "domain", value: "www.EXAMPLE.com", presetName: "Parent" },
          ],
        },
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.groups.autostartRules?.map((entry) => entry.value)).toEqual([
      "sub.example.com",
      "example.com",
    ]);
    expect(
      findWhitelistMatch(result.value.groups.autostartRules, "https://sub.example.com/a")
        ?.presetName,
    ).toBe("Parent");
  });

  test.each([
    "{",
    "null",
    "[]",
    '{"format":"other","version":1}',
    '{"format":"eq-toolkit-settings","version":1,"settings":{}}',
  ])("rejects invalid roots or unavailable groups %s", (text) => {
    expect(parseSettingsImport(text).ok).toBe(false);
  });

  test("accepts empty list groups and ignores unknown fields", () => {
    expect(
      parseSettingsImport(
        '{"format":"eq-toolkit-settings","version":1,"settings":{"autostartRules":[],"presets":{"presetNames":[],"presets":{}},"gain":100}}',
      ),
    ).toEqual({
      ok: true,
      value: {
        groups: { autostartRules: [], presets: { presetNames: [], presets: {} } },
        issues: [],
      },
    });
  });
});
