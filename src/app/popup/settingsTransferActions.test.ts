import { describe, expect, test, vi } from "vitest";
import type { EqualizerFilter } from "../../domains/equalizer/types";
import type { GeneralSettings, TransferGroups } from "../../domains/settings/settingsTransfer";
import {
  createSettingsTransferActions,
  type ImportSession,
  type ImportTarget,
} from "./settingsTransferActions";

const general: GeneralSettings = {
  theme: "dark",
  uiLanguage: "en",
  pointCount: 5,
  enableSpectrum: true,
  enableVolumeCompensation: false,
  skipPointsResetConfirm: false,
};
const filters = (count = 5): EqualizerFilter[] =>
  Array.from({ length: count }, (_, index) => ({
    type: "peaking",
    freq: 100 * (index + 1),
    gain: 3,
    q: 1,
  }));
const file = (settings: TransferGroups) =>
  JSON.stringify({ format: "eq-toolkit-settings", version: 1, settings });
const rule = {
  id: "domain:example.com",
  type: "domain" as const,
  value: "example.com",
  presetName: "Local",
};

const harness = (initial: Record<string, unknown> = {}) => {
  const data = structuredClone(initial);
  let target: ImportTarget = {
    tabId: 42,
    selectionGeneration: 1,
    title: "Example",
    captured: false,
    enabled: false,
    filters: filters(),
  };
  const storage = {
    get: vi.fn(async (keys: string[]) =>
      Object.fromEntries(
        keys
          .filter((key) => Object.hasOwn(data, key))
          .map((key) => [key, structuredClone(data[key])]),
      ),
    ),
    set: vi.fn(async (patch: Record<string, unknown>) => {
      Object.assign(data, structuredClone(patch));
    }),
  };
  const wait = vi.fn<() => Promise<void>>(async () => undefined);
  const getDimensions = vi.fn(() => ({ canvasWidth: 300, canvasHeight: 120 }));
  const actions = createSettingsTransferActions({
    localStorage: storage as unknown as chrome.storage.StorageArea,
    browserLocale: "en-US",
    waitForPendingChanges: wait,
    readTarget: async () => target,
    getDimensions,
  });
  const prepare = async (settings: TransferGroups): Promise<ImportSession> => {
    const result = await actions.prepareImport(file(settings));
    if (!result.ok) throw new Error("Unexpected invalid fixture");
    return result.session;
  };
  return {
    data,
    storage,
    actions,
    wait,
    getDimensions,
    prepare,
    get target() {
      return target;
    },
    set target(value: ImportTarget) {
      target = value;
    },
  };
};

describe("settings transfer snapshots", () => {
  test("exports effective defaults without runtime data or writes", async () => {
    const h = harness({ "gain.42": 7, donationReminderAt: 8 });
    const exported = JSON.parse(await h.actions.exportSettings());
    expect(exported).toMatchObject({
      format: "eq-toolkit-settings",
      version: 1,
      settings: {
        general,
        presets: { presets: {}, presetNames: [], hideDefaultPresets: false },
        autostartRules: [],
      },
    });
    expect(Object.keys(exported.settings)).toEqual([
      "general",
      "shortcuts",
      "autostartRules",
      "presets",
    ]);
    expect(h.storage.set).not.toHaveBeenCalled();
    expect(h.wait).toHaveBeenCalledOnce();
    expect(h.storage.get).toHaveBeenCalledOnce();
  });

  test("exports a complete snapshot and strips filter coordinates", async () => {
    const h = harness({
      ...general,
      theme: "light",
      uiLanguage: "ru",
      pointCount: 7,
      skipPointsResetConfirm: "true",
      hideDefaultPresets: true,
      shortcuts: { mute: null, toggleEq: null },
      whitelist: [rule],
      presetNames: ["Local"],
      presets: { Local: [{ ...filters(1)[0], x: 99, y: 7 }] },
      filters: filters(9),
      "filters.42": filters(9),
    });
    const { settings } = JSON.parse(await h.actions.exportSettings());
    expect(settings.general).toEqual({
      ...general,
      theme: "light",
      uiLanguage: "ru",
      pointCount: 7,
      skipPointsResetConfirm: true,
    });
    expect(settings.shortcuts).toEqual({ mute: null, toggleEq: null });
    expect(settings.autostartRules).toEqual([
      { type: "domain", value: "example.com", presetName: "Local" },
    ]);
    expect(settings.presets).toEqual({
      hideDefaultPresets: true,
      presetNames: ["Local"],
      presets: { Local: filters(1) },
    });
    expect(h.storage.set).not.toHaveBeenCalled();
  });

  test.each([
    { presetNames: ["Local"], presets: { Local: [{ type: "broken" }] } },
    { presetNames: [], presets: { Unlisted: filters(1) } },
    { whitelist: [{ ...rule, value: "" }] },
    { whitelist: [rule, { ...rule, presetName: "Other" }] },
    { presets: null },
  ])("rejects corrupt local lists during strict export and refresh: %j", async (data) => {
    const h = harness(data);
    await expect(h.actions.exportSettings()).rejects.toMatchObject({ issues: expect.any(Array) });
    h.wait.mockClear();
    await expect(h.actions.loadSettingsSnapshot()).rejects.toMatchObject({
      issues: expect.any(Array),
    });
    expect(h.wait).not.toHaveBeenCalled();
    expect(h.storage.set).not.toHaveBeenCalled();
  });

  test("keeps independent groups available while corrupt local lists block dependent changes", async () => {
    const broken = { presetNames: ["Broken"], presets: { Broken: [null] } };
    const h = harness(broken);
    const session = await h.prepare({
      general: { ...general, theme: "light" },
      autostartRules: [rule],
      presets: { presetNames: ["New"], presets: { New: filters(1) } },
    });
    expect(session.localIssues).toEqual([expect.objectContaining({ group: "presets" })]);
    expect(h.actions.previewImport(session, ["presets"], {}).plan.canApply).toBe(false);
    expect(h.actions.previewImport(session, ["autostartRules"], {}).plan.canApply).toBe(false);
    expect(h.storage.set).not.toHaveBeenCalled();
    expect(await h.actions.commitImport(session, ["general"], {}, false)).toMatchObject({
      status: "saved",
    });
    expect(h.data.presets).toEqual(broken.presets);
    expect(h.storage.set).toHaveBeenCalledWith({ theme: "light" });
  });

  test("corrupt local rules also block preset changes that require dependency checks", async () => {
    const h = harness({ whitelist: [null] });
    const session = await h.prepare({
      presets: { presetNames: ["New"], presets: { New: filters(1) } },
    });
    expect(await h.actions.commitImport(session, ["presets"], {}, true)).toMatchObject({
      status: "blocked",
    });
    expect(h.storage.set).not.toHaveBeenCalled();
  });

  test.each([
    { pointCount: 5.5 },
    { shortcuts: { mute: { alt: true, key: "Enter" }, toggleEq: null } },
    { shortcuts: { mute: { alt: true, key: "m" }, toggleEq: { alt: true, key: "M" } } },
  ])("rejects invalid effective scalar groups for strict export: %j", async (data) => {
    const h = harness(data);
    await expect(h.actions.exportSettings()).rejects.toMatchObject({ issues: expect.any(Array) });
    await expect(h.actions.loadSettingsSnapshot()).rejects.toMatchObject({
      issues: expect.any(Array),
    });
    expect(h.storage.set).not.toHaveBeenCalled();
  });

  test("blocks corrupt effective scalars without blocking independent groups", async () => {
    const h = harness({ pointCount: 5.5 });
    const session = await h.prepare({ general, shortcuts: { mute: null, toggleEq: null } });
    expect(session.localIssues).toContainEqual(expect.objectContaining({ group: "general" }));
    expect(await h.actions.commitImport(session, ["general"], {}, false)).toMatchObject({
      status: "blocked",
    });
    expect(await h.actions.commitImport(session, ["shortcuts"], {}, false)).toMatchObject({
      status: "saved",
    });
    expect(h.data.pointCount).toBe(5.5);
  });

  test("preserves identical local rule rows and precedence during export and unrelated imports", async () => {
    const rules = [
      rule,
      { ...rule, id: "domain:sub.example.com", value: "sub.example.com", presetName: "Other" },
      rule,
    ];
    const h = harness({ whitelist: rules });
    const settings = JSON.parse(await h.actions.exportSettings()).settings;
    expect(settings.autostartRules.map((entry: { value: string }) => entry.value)).toEqual([
      "example.com",
      "sub.example.com",
      "example.com",
    ]);
    const session = await h.prepare({ general: { ...general, theme: "light" } });
    expect(session.current.autostartRules).toEqual(rules);
    expect(await h.actions.commitImport(session, ["general"], {}, false)).toMatchObject({
      status: "saved",
    });
    expect(h.data.whitelist).toEqual(rules);
  });

  test("rejects invalid files without reading or writing settings", async () => {
    const h = harness();
    expect(await h.actions.prepareImport("bad JSON")).toMatchObject({ ok: false });
    expect(h.storage.get).not.toHaveBeenCalled();
    expect(h.storage.set).not.toHaveBeenCalled();
  });
});

describe("reviewed import commit", () => {
  test("writes selected settings and confirmed reset once", async () => {
    const h = harness({ pointCount: 5, "gain.42": 4, "mute.42": true, "filters.43": filters(1) });
    const session = await h.prepare({ general: { ...general, pointCount: 7 } });
    expect(session.raw).not.toHaveProperty("gain.42");
    expect(session.raw).not.toHaveProperty("mute.42");
    expect(session.raw).not.toHaveProperty("filters.43");
    const preview = h.actions.previewImport(session, ["general"], {});
    expect(preview.reset).toMatchObject({
      tabId: 42,
      oldPointCount: 5,
      newPointCount: 7,
      enableEq: true,
      requiresConfirmation: true,
    });
    expect(h.storage.set).not.toHaveBeenCalled();
    const result = await h.actions.commitImport(session, ["general"], {}, true);
    expect(result.status).toBe("saved");
    expect(h.storage.set).toHaveBeenCalledTimes(1);
    const patch = h.storage.set.mock.calls[0][0];
    expect(Object.keys(patch).sort()).toEqual([
      "enabled.42",
      "filters",
      "filters.42",
      "pointCount",
    ]);
    expect(patch.pointCount).toBe(7);
    expect(patch["enabled.42"]).toBe(true);
    const neutral = patch.filters as EqualizerFilter[];
    expect(neutral.filter((f) => f.type === "peaking")).toHaveLength(7);
    expect(neutral.filter((f) => f.type === "peaking").every((f) => f.gain === 0)).toBe(true);
    expect(neutral.filter((f) => f.type !== "peaking").map((f) => f.enabled)).toEqual([
      false,
      false,
    ]);
    expect(patch["filters.42"]).toEqual(neutral);
    expect(h.data["gain.42"]).toBe(4);
    expect(h.data["mute.42"]).toBe(true);
    expect(h.data["filters.43"]).toEqual(filters(1));
    expect(session.target.filters).toEqual(filters());
  });

  test("preserves capture bypass", async () => {
    const h = harness();
    h.target = { ...h.target, captured: true };
    const session = await h.prepare({ general: { ...general, pointCount: 7 } });
    const result = await h.actions.commitImport(session, ["general"], {}, true);
    expect(result).toMatchObject({ status: "saved", prepared: { reset: { enableEq: false } } });
    expect(h.storage.set.mock.calls[0][0]).not.toHaveProperty("enabled.42");
  });

  test("blocks unconfirmed reset even if skip flag is true", async () => {
    const h = harness({ skipPointsResetConfirm: true });
    const session = await h.prepare({
      general: { ...general, pointCount: 7, skipPointsResetConfirm: true },
    });
    expect(await h.actions.commitImport(session, ["general"], {}, false)).toMatchObject({
      status: "blocked",
    });
    expect(h.storage.set).not.toHaveBeenCalled();
  });

  test("does not reset when actual point count matches", async () => {
    const h = harness({ pointCount: 5 });
    h.target = { ...h.target, filters: filters(7) };
    const session = await h.prepare({ general: { ...general, pointCount: 7 } });
    expect(await h.actions.commitImport(session, ["general"], {}, false)).toMatchObject({
      status: "saved",
      prepared: { reset: null },
    });
    expect(h.storage.set).toHaveBeenCalledWith({ pointCount: 7 });
  });

  test("compares actual count without clamping", async () => {
    const h = harness({ pointCount: 9 });
    h.target = { ...h.target, filters: filters(32) };
    const session = await h.prepare({ general: { ...general, pointCount: 9 } });
    expect(h.actions.previewImport(session, ["general"], {}).reset).toMatchObject({
      oldPointCount: 32,
      newPointCount: 9,
    });
    expect(await h.actions.commitImport(session, ["general"], {}, false)).toMatchObject({
      status: "blocked",
    });
    expect(await h.actions.commitImport(session, ["general"], {}, true)).toMatchObject({
      status: "saved",
    });
    expect(h.storage.set.mock.calls[0][0]).not.toHaveProperty("pointCount");
  });

  test("handles absent target without arbitrary tab writes", async () => {
    const h = harness();
    h.target = { ...h.target, tabId: null, filters: [] };
    const session = await h.prepare({ general: { ...general, pointCount: 7 } });
    expect(h.actions.previewImport(session, ["general"], {}).reset).toMatchObject({
      tabId: null,
      requiresConfirmation: false,
      enableEq: false,
    });
    expect(await h.actions.commitImport(session, ["general"], {}, false)).toMatchObject({
      status: "saved",
    });
    expect(h.storage.set).toHaveBeenCalledWith({ pointCount: 7 });
  });

  test("invalidates a changed curve with the same number of points", async () => {
    const h = harness();
    const session = await h.prepare({ general: { ...general, pointCount: 7 } });
    h.target.filters[0].gain = 10;
    const result = await h.actions.commitImport(session, ["general"], {}, true);
    expect(result).toMatchObject({
      status: "stale",
      session: { target: { filters: [{ gain: 10 }, ...filters().slice(1)] } },
    });
    expect(session.target.filters[0].gain).toBe(3);
    if (result.status === "stale") expect(result.session.source).toBe(session.source);
    expect(h.storage.set).not.toHaveBeenCalled();
  });

  test.each([
    { tabId: 43 },
    { selectionGeneration: 2 },
    { tabId: null },
    { captured: true },
    { enabled: true },
  ])("invalidates changed selection, closed target and bypass: %j", async (change) => {
    const h = harness();
    const session = await h.prepare({ general: { ...general, pointCount: 7 } });
    h.target = { ...h.target, ...change };
    expect(await h.actions.commitImport(session, ["general"], {}, true)).toMatchObject({
      status: "stale",
    });
    expect(h.storage.set).not.toHaveBeenCalled();
  });

  test.each(["filters", "filters.42", "enabled.42"])(
    "invalidates changed runtime storage %s",
    async (key) => {
      const h = harness();
      const session = await h.prepare({ general: { ...general, pointCount: 7 } });
      h.data[key] = key.startsWith("filters") ? filters(5) : true;
      expect(await h.actions.commitImport(session, ["general"], {}, true)).toMatchObject({
        status: "stale",
      });
      expect(h.storage.set).not.toHaveBeenCalled();
    },
  );

  test("keeps pending edits from overwriting the import", async () => {
    const h = harness();
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    }).then(() => {
      h.data.theme = "light";
    });
    h.wait.mockImplementation(() => pending);
    const preparing = h.prepare({ general });
    await Promise.resolve();
    expect(h.storage.get).not.toHaveBeenCalled();
    release();
    const session = await preparing;
    expect(session.current.general.theme).toBe("light");
    expect(await h.actions.commitImport(session, ["general"], {}, false)).toMatchObject({
      status: "saved",
    });
    await pending;
    expect(h.data.theme).toBe("dark");
  });

  test("ignores unrelated storage churn and object property order", async () => {
    const h = harness({
      presets: { Local: filters(1) },
      presetNames: ["Local"],
      whitelist: [rule],
    });
    const session = await h.prepare({ autostartRules: [rule] });
    h.data["spectrum.43"] = false;
    h.data.donationReminderAt = 1234;
    h.data.theme = "light";
    h.data.presets = { Local: [{ q: 1, gain: 3, freq: 100, type: "peaking" }] };
    expect(await h.actions.commitImport(session, ["autostartRules"], {}, false)).toMatchObject({
      status: "unchanged",
    });
    expect(h.storage.set).not.toHaveBeenCalled();
  });

  test("invalidates preset dependency changes when only rules are selected", async () => {
    const h = harness({ presets: { Local: filters(1) }, presetNames: ["Local"] });
    const session = await h.prepare({ autostartRules: [rule] });
    h.data.presets = { Local: [] };
    const result = await h.actions.commitImport(session, ["autostartRules"], {}, true);
    expect(result.status).toBe("stale");
    if (result.status === "stale") {
      expect(result.session.source).toBe(session.source);
      expect(
        h.actions.previewImport(result.session, ["autostartRules"], {}).plan.warnings,
      ).toContainEqual(expect.objectContaining({ code: "missing-preset" }));
    }
    expect(h.storage.set).not.toHaveBeenCalled();
  });

  test("invalidates changes to selected scalar settings", async () => {
    const h = harness();
    const session = await h.prepare({ general: { ...general, theme: "light" } });
    h.data.pointCount = 7;
    expect(await h.actions.commitImport(session, ["general"], {}, false)).toMatchObject({
      status: "stale",
    });
    expect(h.storage.set).not.toHaveBeenCalled();
  });

  test("does not write a semantic no-op or unselected groups", async () => {
    const h = harness();
    const session = await h.prepare({ general, shortcuts: { mute: null, toggleEq: null } });
    expect(await h.actions.commitImport(session, ["general"], {}, false)).toMatchObject({
      status: "unchanged",
    });
    expect(h.storage.set).not.toHaveBeenCalled();
    expect(await h.actions.commitImport(session, ["shortcuts"], {}, false)).toMatchObject({
      status: "saved",
    });
    expect(h.storage.set).toHaveBeenCalledWith({ shortcuts: { mute: null, toggleEq: null } });
  });

  test("compares imports with effective local shortcut keys without silently rewriting the snapshot", async () => {
    const h = harness({ shortcuts: { mute: { alt: true, key: "m" }, toggleEq: null } });
    const shortcuts = {
      mute: { alt: true, ctrl: false, shift: false, meta: false, key: "M" },
      toggleEq: null,
    };
    const session = await h.prepare({ shortcuts });
    expect(session.current.shortcuts.mute?.key).toBe("m");
    expect(await h.actions.commitImport(session, ["shortcuts"], {}, false)).toMatchObject({
      status: "saved",
    });
    expect(h.storage.set).toHaveBeenCalledWith({ shortcuts });
  });

  test("blocks unresolved conflicts", async () => {
    const h = harness({ presets: { Local: filters(1) }, presetNames: ["Local"] });
    const session = await h.prepare({
      presets: { presets: { Local: [] }, presetNames: ["Local"] },
    });
    expect(await h.actions.commitImport(session, ["presets"], {}, true)).toMatchObject({
      status: "blocked",
    });
    expect(h.storage.set).not.toHaveBeenCalled();
  });

  test("writes selected lists and their visibility setting together without touching other groups", async () => {
    const h = harness({
      theme: "light",
      presets: { Local: filters(1) },
      presetNames: ["Local"],
      whitelist: [rule],
    });
    const session = await h.prepare({
      general,
      presets: { presetNames: ["New"], presets: { New: filters(2) }, hideDefaultPresets: true },
      autostartRules: [
        { ...rule, id: "domain:new.example.com", value: "new.example.com", presetName: "New" },
      ],
    });
    expect(
      await h.actions.commitImport(session, ["presets", "autostartRules"], {}, false),
    ).toMatchObject({ status: "saved" });
    expect(h.storage.set).toHaveBeenCalledExactlyOnceWith({
      presets: { Local: filters(1), New: filters(2) },
      presetNames: ["Local", "New"],
      hideDefaultPresets: true,
      whitelist: [
        rule,
        { ...rule, id: "domain:new.example.com", value: "new.example.com", presetName: "New" },
      ],
    });
    expect(h.data.theme).toBe("light");
  });

  test("keeps valid file groups available without importing an invalid file group", async () => {
    const h = harness();
    const result = await h.actions.prepareImport(
      file({
        general: { ...general, theme: "invalid" as "light" },
        shortcuts: { mute: null, toggleEq: null },
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.session.source.issues).toContainEqual(
      expect.objectContaining({ group: "general" }),
    );
    expect(await h.actions.commitImport(result.session, ["general"], {}, false)).toMatchObject({
      status: "blocked",
    });
    expect(h.storage.set).not.toHaveBeenCalled();
    expect(await h.actions.commitImport(result.session, ["shortcuts"], {}, false)).toMatchObject({
      status: "saved",
    });
  });

  test("uses current dimensions without invalidating confirmation", async () => {
    const h = harness();
    const session = await h.prepare({ general: { ...general, pointCount: 7 } });
    h.actions.previewImport(session, ["general"], {});
    h.getDimensions.mockReturnValue({ canvasWidth: 450, canvasHeight: 180 });
    expect(await h.actions.commitImport(session, ["general"], {}, true)).toMatchObject({
      status: "saved",
    });
    expect(h.storage.set).toHaveBeenCalledOnce();
  });

  test("propagates storage failures without changing the session", async () => {
    const h = harness();
    const session = await h.prepare({ general: { ...general, pointCount: 7 } });
    const original = structuredClone(session);
    h.storage.set.mockRejectedValueOnce(new Error("quota"));
    await expect(h.actions.commitImport(session, ["general"], {}, true)).rejects.toThrow("quota");
    expect(session).toEqual(original);
    expect(h.data).toEqual({});
    h.storage.get.mockRejectedValueOnce(new Error("read"));
    await expect(h.actions.loadSettingsSnapshot()).rejects.toThrow("read");
  });
});
