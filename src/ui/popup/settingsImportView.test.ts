import { afterEach, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createSettingsTransferActions } from "../../app/popup/settingsTransferActions";
import { DEFAULT_SHORTCUTS } from "../../domains/shortcuts/shortcuts";
import { createSettingsImportView, type SettingsImportElements } from "./settingsImportView";

class FakeElement extends EventTarget {
  style = { display: "none" };
  dataset: Record<string, string> = {};
  attributes: Record<string, string> = {};
  children: FakeElement[] = [];
  parentElement: FakeElement | null = null;
  inert = false;
  tabIndex = 0;
  disabled = false;
  hidden = false;
  checked = false;
  value = "";
  type = "";
  name = "";
  download = "";
  href = "";
  files: unknown[] = [];
  private text = "";
  constructor(public tagName = "DIV") {
    super();
  }
  set textContent(value: string) {
    this.text = value;
    this.children = [];
  }
  get textContent(): string {
    return this.text + this.children.map((child) => child.textContent).join("");
  }
  append(...children: FakeElement[]): void {
    children.forEach((child) => {
      child.parentElement = this;
      this.children.push(child);
    });
  }
  replaceChildren(...children: FakeElement[]): void {
    this.text = "";
    this.children = [];
    this.append(...children);
  }
  setAttribute(name: string, value: string): void {
    this.attributes[name] = value;
  }
  matches(): boolean {
    return this.disabled;
  }
  closest(): FakeElement | null {
    return this.inert ? this : (this.parentElement?.closest() ?? null);
  }
  getClientRects(): object[] {
    return this.hidden ? [] : [{}];
  }
  querySelectorAll(): FakeElement[] {
    return descendants(this).filter((child) => ["INPUT", "BUTTON"].includes(child.tagName));
  }
  querySelector(): FakeElement | null {
    return null;
  }
  contains(element: unknown): boolean {
    return element === this || descendants(this).includes(element as FakeElement);
  }
  focus(): void {
    doc.activeElement = this;
  }
  click(): void {
    if (!this.disabled) this.dispatchEvent(new Event("click"));
  }
  remove(): void {
    this.parentElement?.children.splice(this.parentElement.children.indexOf(this), 1);
  }
}
const descendants = (element: FakeElement): FakeElement[] =>
  element.children.flatMap((child) => [child, ...descendants(child)]);
const doc = Object.assign(new EventTarget(), {
  activeElement: null as FakeElement | null,
  body: new FakeElement(),
  createElement: (tag: string) => new FakeElement(tag.toUpperCase()),
});
class Reader {
  static pending: Reader[] = [];
  result: string | null = null;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readAsText(file: { text: string; defer?: boolean; error?: boolean }): void {
    this.result = file.text;
    if (file.defer) Reader.pending.push(this);
    else if (file.error) this.onerror?.();
    else this.onload?.();
  }
}
const disposers: Array<() => void> = [];
afterEach(() => {
  disposers.splice(0).forEach((dispose) => dispose());
  Reader.pending = [];
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const filters = [{ type: "peaking", freq: 1000, gain: 2, q: 0.5 }];
const general = {
  theme: "dark",
  uiLanguage: "en",
  pointCount: 5,
  enableSpectrum: true,
  enableVolumeCompensation: false,
  skipPointsResetConfirm: true,
};
const file = (settings: object) =>
  JSON.stringify({ format: "eq-toolkit-settings", version: 1, settings });
const tick = async () => {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
};
const setup = (stored: Record<string, unknown> = {}) => {
  vi.stubGlobal("HTMLElement", FakeElement);
  vi.stubGlobal("document", doc);
  vi.stubGlobal("FileReader", Reader);
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  const elements = Object.fromEntries(
    [
      "modal",
      "title",
      "groups",
      "conflicts",
      "summary",
      "status",
      "resetConfirm",
      "fileInput",
      "back",
      "next",
      "apply",
      "cancel",
      "close",
      "importButton",
      "exportButton",
    ].map((name) => [
      name,
      new FakeElement(name === "resetConfirm" || name === "fileInput" ? "INPUT" : "BUTTON"),
    ]),
  ) as unknown as Record<keyof SettingsImportElements, FakeElement>;
  elements.modal.append(
    elements.title,
    elements.groups,
    elements.conflicts,
    elements.summary,
    elements.status,
    elements.resetConfirm,
    elements.back,
    elements.next,
    elements.apply,
    elements.cancel,
    elements.close,
  );
  doc.body.replaceChildren(
    elements.importButton,
    elements.exportButton,
    elements.fileInput,
    elements.modal,
  );
  const storage = {
    get: vi.fn(async () => structuredClone(stored)),
    set: vi.fn(async (patch: object) => {
      Object.assign(stored, patch);
    }),
  };
  const actions = createSettingsTransferActions({
    localStorage: storage as unknown as chrome.storage.StorageArea,
    browserLocale: "en",
    waitForPendingChanges: async () => {},
    readTarget: async () => ({
      tabId: 1,
      title: "Music tab",
      selectionGeneration: 1,
      captured: false,
      enabled: false,
      filters: [{ type: "peaking", freq: 300, gain: 4, q: 1 }],
    }),
    getDimensions: () => ({ width: 400, height: 200, canvasWidth: 400, canvasHeight: 200 }),
  });
  const applyCommitted = vi.fn(async () => {});
  const view = createSettingsImportView({
    elements: elements as unknown as SettingsImportElements,
    actions,
    getMessage: (name) => name,
    applyCommitted,
  });
  disposers.push(view.dispose);
  const load = async (text: string, options: { defer?: boolean; error?: boolean } = {}) => {
    elements.fileInput.value = "file.json";
    elements.fileInput.files = [{ text, ...options }];
    elements.fileInput.dispatchEvent(new Event("change"));
    await tick();
  };
  const inputs = (container: FakeElement) =>
    descendants(container).filter((child) => child.tagName === "INPUT");
  const change = (input: FakeElement, checked: boolean) => {
    input.checked = checked;
    input.dispatchEvent(new Event("change"));
  };
  return { elements, actions, storage, view, load, inputs, change, applyCommitted, stored };
};

test("export controls disclose included site addresses with the existing localized text", () => {
  const markup = readFileSync("popup.html", "utf8");
  const section = markup.slice(
    markup.lastIndexOf('<div class="settings-section">', markup.indexOf('id="export-settings"')),
    markup.indexOf("<!--COMMUNITY SECTION-->"),
  );
  expect(section).toContain('data-i18n="settings_transfer_privacy"');
});

test.each([0, 2])("group selection shows validated preset and rule counts: %s", async (count) => {
  const t = setup();
  const names = Array.from({ length: count }, (_, index) => `Preset ${index}`);
  await t.load(
    file({
      presets: {
        presets: Object.fromEntries(names.map((name) => [name, filters])),
        presetNames: names,
        hideDefaultPresets: false,
      },
      autostartRules: names.map((presetName, index) => ({
        id: `${index}`,
        type: "domain",
        value: `site${index}.com`,
        presetName,
      })),
    }),
  );
  const labels = t.elements.groups.children.filter((child) => child.tagName === "LABEL");
  expect(labels.find((label) => label.children[0].value === "presets")?.textContent).toBe(
    `settings_transfer_presets: ${count}`,
  );
  expect(labels.find((label) => label.children[0].value === "autostartRules")?.textContent).toBe(
    `settings_transfer_autostartRules: ${count}`,
  );
});

test.each([false, true])(
  "result retains committed counts and missing dependency warnings (unchanged: %s)",
  async (unchanged) => {
    const t = setup();
    await t.load(
      file({
        presets: {
          presets: unchanged ? {} : { New: filters },
          presetNames: unchanged ? [] : ["New"],
          hideDefaultPresets: false,
        },
        autostartRules: [
          { id: "skip", type: "domain", value: "missing.example.com", presetName: "Missing" },
        ],
      }),
    );
    t.elements.next.click();
    t.elements.apply.click();
    await tick();
    expect(t.elements.status.textContent).toBe(
      `settings_transfer_${unchanged ? "unchanged" : "saved"}`,
    );
    expect(t.elements.summary.hidden).toBe(false);
    expect(t.elements.summary.textContent).toContain(
      `settings_transfer_added: ${unchanged ? 0 : 1}`,
    );
    expect(t.elements.summary.textContent).toContain("settings_transfer_skipped: 1");
    expect(t.elements.summary.textContent).toContain("missing.example.com");
    expect(t.elements.resetConfirm.hidden).toBe(true);
    expect(t.elements.back.hidden).toBe(true);
    expect(t.elements.groups.hidden).toBe(true);
    expect(t.elements.conflicts.hidden).toBe(true);
    expect(t.inputs(t.elements.summary)).toEqual([]);
  },
);

test("selects available groups and disables absent or invalid groups", async () => {
  const { elements: e, load, inputs, change } = setup();
  await load(JSON.stringify({ presets: { Voice: filters }, presetNames: ["Voice"] }));
  const groups = inputs(e.groups);
  expect(groups.map((input) => [input.value, input.checked, input.disabled])).toEqual([
    ["general", false, true],
    ["shortcuts", false, true],
    ["autostartRules", false, true],
    ["presets", true, false],
  ]);
  change(groups[3], false);
  expect(e.next.disabled).toBe(true);
  await load(file({ general: { theme: "broken" }, shortcuts: DEFAULT_SHORTCUTS }));
  expect(inputs(e.groups)[0].disabled).toBe(true);
  expect(e.groups.textContent).toContain("settings_transfer_invalid");
});

test("requires explicit decisions and shows both preset versions", async () => {
  const {
    elements: e,
    load,
    inputs,
    change,
  } = setup({ presets: { Voice: filters }, presetNames: ["Voice"] });
  await load(
    file({
      presets: {
        presets: { Voice: [{ ...filters[0], gain: 5 }] },
        presetNames: ["Voice"],
        hideDefaultPresets: false,
      },
    }),
  );
  e.next.click();
  expect(e.conflicts.hidden).toBe(false);
  expect(e.next.disabled).toBe(true);
  expect(inputs(e.conflicts).every((input) => !input.checked)).toBe(true);
  const tables = descendants(e.conflicts).filter((child) => child.tagName === "TABLE");
  expect(tables).toHaveLength(2);
  const rows = tables.map((table) =>
    descendants(table)
      .find((child) => child.tagName === "TBODY")
      ?.children[0].children.map((cell) => cell.textContent),
  );
  expect(rows).toEqual([
    ["1000", "2", "0.5", "peaking", "settings_transfer_yes"],
    ["1000", "5", "0.5", "peaking", "settings_transfer_yes"],
  ]);
  for (const word of [
    "1000",
    "0.5",
    "peaking",
    "settings_transfer_frequency",
    "settings_transfer_enabled",
  ])
    expect(e.conflicts.textContent).toContain(word);
  change(inputs(e.conflicts)[1], true);
  expect(e.next.disabled).toBe(false);
  expect(inputs(e.conflicts)[1].checked).toBe(true);
});

test("recomputes decisions when groups or preset choices change", async () => {
  const {
    elements: e,
    load,
    inputs,
    change,
  } = setup({ presets: { Voice: filters }, presetNames: ["Voice"] });
  await load(
    file({
      presets: { presets: { Voice: [] }, presetNames: ["Voice"], hideDefaultPresets: false },
      autostartRules: [
        { id: "domain:example.com", type: "domain", value: "example.com", presetName: "Voice" },
      ],
    }),
  );
  e.next.click();
  change(inputs(e.conflicts)[1], true);
  e.next.click();
  expect(e.summary.textContent).toContain("Voice");
  expect(e.summary.textContent).toContain("settings_transfer_missing_preset");
  e.back.click();
  e.back.click();
  change(inputs(e.groups)[3], false);
  change(inputs(e.groups)[3], true);
  e.next.click();
  expect(inputs(e.conflicts).every((input) => !input.checked)).toBe(true);
  change(inputs(e.conflicts)[0], true);
  e.next.click();
  expect(e.summary.textContent).not.toContain("settings_transfer_missing_preset");
});

test("shows skipped rules and required reset acknowledgement", async () => {
  const { elements: e, load } = setup();
  await load(
    file({
      general,
      autostartRules: [
        { id: "domain:example.com", type: "domain", value: "example.com", presetName: "Missing" },
      ],
    }),
  );
  e.next.click();
  expect(e.summary.textContent).toContain("example.com");
  expect(e.summary.textContent).toContain("Missing");
  expect(e.summary.textContent).toContain("Music tab");
  expect(e.summary.textContent).toContain("1 → 5");
  expect(e.apply.disabled).toBe(true);
  e.resetConfirm.checked = true;
  e.resetConfirm.dispatchEvent(new Event("change"));
  expect(e.apply.disabled).toBe(false);
});

test("ignores a superseded file read and disposed view", async () => {
  const { elements: e, load, view } = setup();
  await load(JSON.stringify({ presets: { First: filters }, presetNames: ["First"] }), {
    defer: true,
  });
  await load(JSON.stringify({ presets: { Second: filters }, presetNames: ["Second"] }));
  Reader.pending[0].onload?.();
  await tick();
  e.next.click();
  expect(e.summary.textContent).toContain("Second");
  expect(e.summary.textContent).not.toContain("First");
  await load(file({ general }), { defer: true });
  view.dispose();
  Reader.pending[1].onload?.();
  await tick();
  expect(e.modal.style.display).toBe("none");
});

test("renders hostile names as text", async () => {
  const name = "<img src=x onerror=alert(1)>";
  const { elements: e, load } = setup({ presets: { [name]: filters }, presetNames: [name] });
  await load(
    file({ presets: { presets: { [name]: [] }, presetNames: [name], hideDefaultPresets: false } }),
  );
  e.next.click();
  expect(e.conflicts.textContent).toContain(name);
  expect(descendants(e.modal).some((child) => child.tagName === "IMG")).toBe(false);
});

test("prevents double commit and close while saving", async () => {
  const { elements: e, load, storage } = setup();
  let finish!: () => void;
  storage.set.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  await load(JSON.stringify({ presets: { Voice: filters }, presetNames: ["Voice"] }));
  e.next.click();
  e.apply.click();
  e.apply.click();
  await tick();
  e.cancel.click();
  e.close.click();
  e.modal.click();
  doc.dispatchEvent(Object.assign(new Event("keydown", { cancelable: true }), { key: "Escape" }));
  expect(e.modal.style.display).toBe("block");
  expect(storage.set).toHaveBeenCalledTimes(1);
  finish();
  await tick();
  expect(e.status.textContent).toContain("settings_transfer_saved");
});

test.each(["saved", "refresh-error", "disposed"])(
  "keeps saving guards active until UI application finishes: %s",
  async (outcome) => {
    const { elements: e, actions, load, storage, view, applyCommitted } = setup();
    let resolveApply!: () => void;
    let rejectApply!: (error: Error) => void;
    applyCommitted.mockImplementation(
      () =>
        new Promise<void>((resolve, reject) => {
          resolveApply = resolve;
          rejectApply = reject;
        }),
    );
    const prepare = vi.spyOn(actions, "prepareImport");
    const filePicker = vi.spyOn(e.fileInput, "click");
    await load(JSON.stringify({ presets: { Voice: filters }, presetNames: ["Voice"] }));
    e.next.click();
    e.apply.click();
    await tick();
    expect(storage.set).toHaveBeenCalledTimes(1);
    expect(applyCommitted).toHaveBeenCalledTimes(1);
    expect(e.status.textContent).toBe("settings_transfer_saving");
    expect(e.modal.attributes["aria-busy"]).toBe("true");
    expect(e.close.disabled).toBe(true);
    expect(e.cancel.disabled).toBe(true);
    e.cancel.click();
    e.close.click();
    doc.dispatchEvent(Object.assign(new Event("keydown", { cancelable: true }), { key: "Escape" }));
    e.modal.click();
    expect(e.modal.style.display).toBe("block");
    view.open();
    e.importButton.click();
    expect(filePicker).not.toHaveBeenCalled();
    await load(JSON.stringify({ presets: { Second: filters }, presetNames: ["Second"] }));
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(e.status.textContent).toBe("settings_transfer_saving");
    if (outcome === "disposed") {
      view.dispose();
      expect(e.importButton.inert).toBe(false);
      expect(e.modal.style.display).toBe("none");
      rejectApply(new Error("refresh rejected after disposal"));
      await tick();
      expect(e.status.textContent).toBe("settings_transfer_saving");
      return;
    }
    if (outcome === "refresh-error") rejectApply(new Error("refresh failed"));
    else resolveApply();
    await tick();
    expect(e.status.textContent).toBe(
      outcome === "saved" ? "settings_transfer_saved" : "settings_transfer_refresh_error",
    );
    expect(e.modal.attributes["aria-busy"]).toBe("false");
    expect(e.close.disabled).toBe(false);
    expect(e.cancel.disabled).toBe(false);
    e.apply.click();
    expect(storage.set).toHaveBeenCalledTimes(1);
    e.cancel.click();
    expect(e.modal.style.display).toBe("none");
    view.open();
    expect(filePicker).toHaveBeenCalledTimes(1);
  },
);

test("keeps decisions on write rejection but clears stale approvals", async () => {
  const {
    elements: e,
    load,
    inputs,
    change,
    storage,
    stored,
  } = setup({ presets: { Voice: filters }, presetNames: ["Voice"] });
  storage.set.mockRejectedValueOnce(new Error("write failed"));
  await load(
    file({
      general,
      presets: { presets: { Voice: [] }, presetNames: ["Voice"], hideDefaultPresets: false },
    }),
  );
  e.next.click();
  change(inputs(e.conflicts)[1], true);
  e.next.click();
  change(e.resetConfirm, true);
  e.apply.click();
  await tick();
  expect(e.status.textContent).toContain("settings_transfer_write_error");
  e.back.click();
  expect(inputs(e.conflicts)[1].checked).toBe(true);
  e.next.click();
  stored.theme = "light";
  e.apply.click();
  await tick();
  expect(e.status.textContent).toContain("settings_transfer_stale");
  expect(e.resetConfirm.checked).toBe(false);
  e.next.click();
  expect(inputs(e.conflicts).every((input) => !input.checked)).toBe(true);
});

test("resets input for retry and exports JSON with expected MIME", async () => {
  const { elements: e, load } = setup();
  await load("broken", { error: true });
  expect(e.fileInput.value).toBe("");
  expect(e.status.textContent).toContain("settings_transfer_read_error");
  await load(JSON.stringify({ presets: { Voice: filters }, presetNames: ["Voice"] }));
  expect(e.fileInput.value).toBe("");
  let anchor: FakeElement | undefined;
  const original = doc.createElement;
  vi.spyOn(doc, "createElement").mockImplementation((tag) => {
    const node = original(tag);
    if (tag === "a") anchor = node;
    return node;
  });
  e.cancel.click();
  e.exportButton.click();
  await tick();
  expect(anchor?.download).toBe("eq_toolkit_settings.json");
  expect(vi.mocked(URL.createObjectURL).mock.calls[0][0]).toBeInstanceOf(Blob);
  expect((vi.mocked(URL.createObjectURL).mock.calls[0][0] as Blob).type).toBe("application/json");
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:test");
  vi.restoreAllMocks();
});

test("preserves unrelated conflict decisions when a group is removed", async () => {
  const {
    elements: e,
    load,
    inputs,
    change,
  } = setup({
    presets: { Voice: filters, Other: filters },
    presetNames: ["Voice", "Other"],
    whitelist: [{ type: "domain", value: "example.com", presetName: "Other" }],
  });
  await load(
    file({
      presets: { presets: { Voice: [{ ...filters[0], gain: 4 }] }, presetNames: ["Voice"] },
      autostartRules: [{ type: "domain", value: "example.com", presetName: "Voice" }],
    }),
  );
  e.next.click();
  change(inputs(e.conflicts)[1], true);
  change(inputs(e.conflicts)[3], true);
  e.back.click();
  change(inputs(e.groups)[2], false);
  e.next.click();
  expect(inputs(e.conflicts)[1].checked).toBe(true);
  expect(e.next.disabled).toBe(false);
});

test("dispose while saving restores inert and ignores the completed write", async () => {
  const { elements: e, load, storage, view, applyCommitted } = setup();
  let finish!: () => void;
  storage.set.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  await load(JSON.stringify({ presets: { Voice: filters }, presetNames: ["Voice"] }));
  e.next.click();
  e.apply.click();
  await tick();
  expect(e.importButton.inert).toBe(true);
  view.dispose();
  expect(e.importButton.inert).toBe(false);
  expect(e.modal.style.display).toBe("none");
  finish();
  await tick();
  expect(applyCommitted).not.toHaveBeenCalled();
  expect(e.status.textContent).toBe("settings_transfer_saving");
});

test("reports unsupported versions and distinguishes saved refresh failures", async () => {
  const { elements: e, load, applyCommitted, storage } = setup();
  await load(JSON.stringify({ format: "eq-toolkit-settings", version: 2, settings: {} }));
  expect(e.status.textContent).toBe("settings_transfer_version_error");
  expect(e.status.attributes.role).toBe("alert");
  expect(storage.set).not.toHaveBeenCalled();
  applyCommitted.mockRejectedValueOnce(new Error("render failed"));
  await load(JSON.stringify({ presets: { Voice: filters }, presetNames: ["Voice"] }));
  e.next.click();
  e.apply.click();
  await tick();
  expect(storage.set).toHaveBeenCalledTimes(1);
  expect(e.status.textContent).toBe("settings_transfer_refresh_error");
  e.apply.click();
  await tick();
  expect(storage.set).toHaveBeenCalledTimes(1);
});

test("cancel invalidates a pending read and detached controls after dispose are inert", async () => {
  const { elements: e, load, view, inputs, change } = setup();
  await load(file({ general }), { defer: true });
  e.cancel.click();
  Reader.pending[0].onload?.();
  await tick();
  expect(e.modal.style.display).toBe("none");
  await load(JSON.stringify({ presets: { Voice: filters }, presetNames: ["Voice"] }));
  const input = inputs(e.groups)[3];
  view.dispose();
  const content = e.groups.textContent;
  change(input, false);
  expect(e.groups.textContent).toBe(content);
});

test("shows no changes without writing or applying committed state", async () => {
  const {
    elements: e,
    load,
    storage,
    applyCommitted,
  } = setup({ presets: { Voice: filters }, presetNames: ["Voice"] });
  await load(JSON.stringify({ presets: { Voice: filters }, presetNames: ["Voice"] }));
  e.next.click();
  e.apply.click();
  await tick();
  expect(e.status.textContent).toBe("settings_transfer_unchanged");
  expect(storage.set).not.toHaveBeenCalled();
  expect(applyCommitted).not.toHaveBeenCalled();
});
