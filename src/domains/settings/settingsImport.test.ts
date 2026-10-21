import { describe, expect, test } from "vitest";

import type { AutostartWhitelistEntry } from "../autostart/autostartRules";
import type { EqualizerFilter } from "../equalizer/types";

import { buildSettingsImportPlan } from "./settingsImport";
import type { ResolvedSettings, TransferGroups } from "./settingsTransfer";

const filters = (gain = 2): EqualizerFilter[] => [{ type: "peaking", freq: 1000, gain, q: 0.5 }];
const rule = (value = "example.com", presetName = "Voice"): AutostartWhitelistEntry => ({
  id: `domain:${value}`,
  type: "domain",
  value,
  presetName,
});
const snapshot = (): ResolvedSettings => ({
  general: {
    theme: "dark",
    uiLanguage: "en",
    pointCount: 5,
    enableSpectrum: true,
    enableVolumeCompensation: false,
    skipPointsResetConfirm: false,
  },
  shortcuts: { mute: null, toggleEq: null },
  autostartRules: [rule()],
  presets: {
    presets: { Local: filters(1), Voice: filters() },
    presetNames: ["Local", "Voice"],
    hideDefaultPresets: false,
  },
});
const presetGroup = (presets: Record<string, EqualizerFilter[]>): TransferGroups => ({
  presets: { presets, presetNames: Object.keys(presets) },
});
const presetId = '["presets","Voice"]';
const ruleId = '["autostartRules","domain:example.com"]';

describe("settings import plan", () => {
  test("merges only selected groups preserving local order", () => {
    const current = snapshot();
    const plan = buildSettingsImportPlan(
      current,
      {
        ...presetGroup({ Voice: filters(), New: filters(3) }),
        general: { ...current.general, theme: "light" },
        shortcuts: { mute: null, toggleEq: null },
        autostartRules: [rule("new.com")],
      },
      ["presets"],
      {},
    );
    expect(plan.next.presets.presetNames).toEqual(["Local", "Voice", "New"]);
    expect(plan.next.general).toEqual(current.general);
    expect(plan.next.shortcuts).toEqual(current.shortcuts);
    expect(plan.next.autostartRules).toEqual(current.autostartRules);
    expect(plan.changedGroups).toEqual(["presets"]);
    expect(plan.counts.presets).toEqual({
      added: 1,
      replaced: 0,
      kept: 0,
      identical: 1,
      skipped: 0,
    });
    expect(plan.canApply).toBe(true);
  });

  test("requires a decision for changed Voice", () => {
    const current = snapshot();
    const incoming = presetGroup({ Voice: filters(4) });
    const undecided = buildSettingsImportPlan(current, incoming, ["presets"], {});
    expect(undecided.canApply).toBe(false);
    expect(undecided.next.presets.presets.Voice).toEqual(filters());
    expect(undecided.conflicts).toEqual([
      {
        id: presetId,
        group: "presets",
        key: "Voice",
        current: filters(),
        incoming: filters(4),
        affectedRules: 1,
      },
    ]);
    for (const decision of ["current", "incoming"] as const) {
      const plan = buildSettingsImportPlan(current, incoming, ["presets"], {
        [presetId]: decision,
      });
      expect(plan.canApply).toBe(true);
      expect(plan.conflicts).toHaveLength(1);
      expect(plan.next.presets.presets.Voice).toEqual(filters(decision === "incoming" ? 4 : 2));
      expect(plan.next.presets.presetNames).toEqual(["Local", "Voice"]);
      expect(plan.counts.presets).toEqual({
        added: 0,
        replaced: decision === "incoming" ? 1 : 0,
        kept: decision === "current" ? 1 : 0,
        identical: 0,
        skipped: 0,
      });
    }
  });

  test("ignores semantic equality of legacy enabled defaults", () => {
    const current = snapshot();
    current.presets.presets.Voice = [
      { type: "highpass", freq: 20, gain: 0, q: 0.5 },
      ...filters(),
      { type: "lowpass", freq: 18000, gain: 0, q: 0.5 },
    ];
    const incoming = presetGroup({
      Voice: [
        { type: "highpass", freq: 20, gain: 0, q: 0.5, enabled: false },
        { ...filters()[0], enabled: true },
        { type: "lowpass", freq: 18000, gain: 0, q: 0.5, enabled: true },
      ],
    });
    const plan = buildSettingsImportPlan(current, incoming, ["presets"], {});
    expect(plan.conflicts).toEqual([]);
    expect(plan.changedGroups).toEqual([]);
    expect(plan.counts.presets.identical).toBe(1);
  });

  test("keeps Voice and voice independent", () => {
    const current = snapshot();
    current.presets.presets.voice = filters(1);
    current.presets.presetNames.push("voice");
    const plan = buildSettingsImportPlan(
      current,
      presetGroup({ Voice: filters(3), voice: filters(4), "a:b": [], "声 🎵": filters() }),
      ["presets"],
      {},
    );
    expect(plan.conflicts.map(({ id }) => id)).toEqual([
      '["presets","Voice"]',
      '["presets","voice"]',
    ]);
    expect(plan.next.presets.presetNames).toEqual(["Local", "Voice", "voice", "a:b", "声 🎵"]);
  });

  test("skips protected default names", () => {
    const plan = buildSettingsImportPlan(
      snapshot(),
      presetGroup({ "Bass Boost": [] }),
      ["presets"],
      {},
    );
    expect(plan.next.presets.presetNames).toEqual(["Local", "Voice"]);
    expect(plan.next.presets.presets).not.toHaveProperty("Bass Boost");
    expect(plan.warnings).toEqual([
      { group: "presets", code: "protected-preset", path: "Bass Boost" },
    ]);
    expect(plan.counts.presets.skipped).toBe(1);
  });

  test("skips missing preset while preserving matching local rule", () => {
    const current = snapshot();
    const plan = buildSettingsImportPlan(
      current,
      { autostartRules: [rule("example.com", "Missing")] },
      ["autostartRules"],
      {},
    );
    expect(plan.next.autostartRules).toEqual(current.autostartRules);
    expect(plan.conflicts).toEqual([]);
    expect(plan.warnings).toEqual([
      { group: "autostartRules", code: "missing-preset", path: "domain:example.com → Missing" },
    ]);
    expect(plan.counts.autostartRules.skipped).toBe(1);
    expect(plan.canApply).toBe(true);
  });

  test("recomputes rules after preset decisions", () => {
    const current = snapshot();
    current.presets.presets.Voice = [];
    current.autostartRules = [];
    const incoming = { ...presetGroup({ Voice: filters() }), autostartRules: [rule()] };
    const pending = buildSettingsImportPlan(current, incoming, ["presets", "autostartRules"], {});
    expect(pending.counts.autostartRules.skipped).toBe(1);
    for (const decision of ["current", "incoming"] as const) {
      const plan = buildSettingsImportPlan(current, incoming, ["presets", "autostartRules"], {
        [presetId]: decision,
      });
      expect(plan.next.autostartRules).toEqual(decision === "incoming" ? [rule()] : []);
      expect(plan.counts.autostartRules.skipped).toBe(decision === "incoming" ? 0 : 1);
      expect(plan.canApply).toBe(true);
    }
  });

  test("blocks empty replacement used by retained local rules", () => {
    const current = snapshot();
    const incoming = presetGroup({ Voice: [] });
    const plan = buildSettingsImportPlan(current, incoming, ["presets"], {
      [presetId]: "incoming",
    });
    expect(plan.blockers).toEqual([
      { group: "presets", code: "retained-rule-dependency", path: "domain:example.com → Voice" },
    ]);
    expect(plan.canApply).toBe(false);
    expect(
      buildSettingsImportPlan(current, incoming, ["presets"], { [presetId]: "current" }).blockers,
    ).toEqual([]);
  });

  test("checks final rules rather than rules replaced by the import", () => {
    const incoming = {
      ...presetGroup({ Voice: [] }),
      autostartRules: [rule("example.com", "Local")],
    };
    const plan = buildSettingsImportPlan(snapshot(), incoming, ["presets", "autostartRules"], {
      [presetId]: "incoming",
      [ruleId]: "incoming",
    });
    expect(plan.blockers).toEqual([]);
    expect(plan.canApply).toBe(true);
    expect(plan.next.autostartRules).toEqual([rule("example.com", "Local")]);
    expect(
      buildSettingsImportPlan(snapshot(), incoming, ["presets", "autostartRules"], {
        [presetId]: "incoming",
        [ruleId]: "current",
      }).canApply,
    ).toBe(false);
  });

  test("uses hidden built-ins and local presets when presets are not selected", () => {
    const current = snapshot();
    current.presets.hideDefaultPresets = true;
    const plan = buildSettingsImportPlan(
      current,
      {
        ...presetGroup({ Voice: [] }),
        autostartRules: [rule("builtin.com", "Bass Boost"), rule("local.com", "Voice")],
      },
      ["autostartRules"],
      {},
    );
    expect(plan.next.autostartRules).toEqual([
      rule(),
      rule("builtin.com", "Bass Boost"),
      rule("local.com", "Voice"),
    ]);
    expect(plan.warnings).toEqual([]);
    expect(plan.counts.autostartRules.added).toBe(2);
  });

  test("empty lists preserve local entries and legacy preset visibility", () => {
    const current = snapshot();
    current.presets.hideDefaultPresets = true;
    const plan = buildSettingsImportPlan(
      current,
      { ...presetGroup({}), autostartRules: [] },
      ["presets", "autostartRules"],
      {},
    );
    expect(plan.next).toEqual(current);
    expect(plan.changedGroups).toEqual([]);
    expect(plan.canApply).toBe(true);
  });

  test("replaces selected general shortcuts and preset visibility", () => {
    const current = snapshot();
    const general = { ...current.general, theme: "light" as const };
    const shortcuts = {
      mute: { alt: true, ctrl: false, shift: false, meta: false, key: "M" },
      toggleEq: null,
    };
    const plan = buildSettingsImportPlan(
      current,
      { general, shortcuts, presets: { presets: {}, presetNames: [], hideDefaultPresets: true } },
      ["general", "shortcuts", "presets"],
      {},
    );
    expect(plan.next.general).toEqual(general);
    expect(plan.next.shortcuts).toEqual(shortcuts);
    expect(plan.next.presets.hideDefaultPresets).toBe(true);
    expect(plan.changedGroups).toEqual(["general", "shortcuts", "presets"]);
  });

  test("canonicalizes local matching keys without trusting saved ids", () => {
    const current = snapshot();
    current.autostartRules = [{ ...rule("https://WWW.EXAMPLE.com/path"), id: "untrusted" }];
    const plan = buildSettingsImportPlan(
      current,
      { autostartRules: [rule()] },
      ["autostartRules"],
      {},
    );
    expect(plan.conflicts).toEqual([]);
    expect(plan.counts.autostartRules.identical).toBe(1);
    expect(plan.next.autostartRules).toEqual(current.autostartRules);
    expect(plan.changedGroups).toEqual([]);
  });

  test.each(["current", "incoming"] as const)(
    "resolves rule conflicts with %s preserving local order",
    (decision) => {
      const current = snapshot();
      current.autostartRules.push(rule("last.com"));
      const plan = buildSettingsImportPlan(
        current,
        { autostartRules: [rule("example.com", "Local"), rule("new.com")] },
        ["autostartRules"],
        { [ruleId]: decision },
      );
      expect(plan.next.autostartRules).toEqual([
        rule("example.com", decision === "incoming" ? "Local" : "Voice"),
        rule("last.com"),
        rule("new.com"),
      ]);
      expect(plan.conflicts).toEqual([
        {
          id: ruleId,
          group: "autostartRules",
          key: "domain:example.com",
          current: rule(),
          incoming: rule("example.com", "Local"),
        },
      ]);
      expect(plan.counts.autostartRules).toEqual({
        added: 1,
        replaced: decision === "incoming" ? 1 : 0,
        kept: decision === "current" ? 1 : 0,
        identical: 0,
        skipped: 0,
      });
      expect(plan.canApply).toBe(true);
    },
  );

  test("unresolved rule conflicts retain current and prevent applying", () => {
    const plan = buildSettingsImportPlan(
      snapshot(),
      { autostartRules: [rule("example.com", "Local")] },
      ["autostartRules"],
      {},
    );
    expect(plan.next.autostartRules).toEqual([rule()]);
    expect(plan.canApply).toBe(false);
    expect(plan.counts.autostartRules.kept).toBe(0);
  });

  test("blocks ambiguous local canonical duplicates only for selected rules", () => {
    const current = snapshot();
    current.autostartRules.push(rule("www.EXAMPLE.com", "Local"));
    const incoming = { autostartRules: [rule("new.com")] };
    const plan = buildSettingsImportPlan(current, incoming, ["autostartRules"], {});
    expect(plan.blockers).toEqual([
      { group: "autostartRules", code: "ambiguous-local-rule", path: "domain:example.com" },
    ]);
    expect(plan.next.autostartRules).toEqual(current.autostartRules);
    expect(plan.canApply).toBe(false);
    expect(buildSettingsImportPlan(current, incoming, ["general"], {}).blockers).toEqual([]);
  });

  test("keeps unrelated broken local rules without repairing or blocking them", () => {
    const current = snapshot();
    current.autostartRules.push(rule("broken.com", "Missing"));
    const plan = buildSettingsImportPlan(current, presetGroup({ New: [] }), ["presets"], {});
    expect(plan.next.autostartRules).toEqual(current.autostartRules);
    expect(plan.blockers).toEqual([]);
  });

  test("replaces identical local duplicates in place preserving overlapping rule precedence", () => {
    const current = snapshot();
    current.autostartRules = [rule(), rule("sub.example.com"), rule("www.EXAMPLE.com")];
    const plan = buildSettingsImportPlan(
      current,
      { autostartRules: [rule("example.com", "Local")] },
      ["autostartRules"],
      { [ruleId]: "incoming" },
    );
    expect(plan.next.autostartRules).toEqual([
      rule("example.com", "Local"),
      rule("sub.example.com"),
      rule("example.com", "Local"),
    ]);
    expect(plan.conflicts).toHaveLength(1);
    expect(plan.counts.autostartRules.replaced).toBe(1);
    expect(plan.blockers).toEqual([]);
  });

  test("does not mutate inputs and repeat import is idempotent", () => {
    const current = snapshot();
    const incoming = {
      ...presetGroup({ Voice: filters(4), New: filters(3) }),
      autostartRules: [rule("new.com", "New")],
    };
    const before = structuredClone({ current, incoming });
    const plan = buildSettingsImportPlan(current, incoming, ["presets", "autostartRules"], {
      [presetId]: "incoming",
    });
    expect({ current, incoming }).toEqual(before);
    const repeat = buildSettingsImportPlan(plan.next, incoming, ["presets", "autostartRules"], {});
    expect(repeat.next).toEqual(plan.next);
    expect(repeat.conflicts).toEqual([]);
    expect(repeat.changedGroups).toEqual([]);
    expect(repeat.counts.presets.identical).toBe(2);
    expect(repeat.counts.autostartRules.identical).toBe(1);
  });
});
