import { afterEach, expect, test, vi } from "vitest";

import type { AutostartWhitelistEntry } from "../../domains/autostart/autostartRules";
import { createAutostartView } from "./autostartView";

class FakeElement extends EventTarget {
  style = { display: "" };
  value = "";
  checked = false;
  id = "";
  className = "";
  type = "";
  children: FakeElement[] = [];
  private content = "";

  get textContent(): string {
    return this.content;
  }

  set textContent(value: string) {
    this.content = value;
    if (value === "") this.children = [];
  }

  append(...children: FakeElement[]): void {
    this.children.push(...children);
  }

  appendChild(child: FakeElement): FakeElement {
    this.children.push(child);
    return child;
  }

  setAttribute(): void {}
  focus(): void {}
  contains(): boolean {
    return false;
  }
  querySelector(): FakeElement | null {
    return null;
  }
}

const entry: AutostartWhitelistEntry = {
  id: "domain:example.com",
  type: "domain",
  value: "example.com",
  presetName: "Mine",
};

const setup = (options: { rejectAdd?: boolean } = {}) => {
  const settingsAddButton = new FakeElement();
  const settingsAddValue = new FakeElement();
  settingsAddValue.value = "example.com";
  const settingsList = new FakeElement();
  const modalPreset = new FakeElement();
  const settingsAddPreset = new FakeElement();
  const loadPresetNames = vi.fn(async () => ["Mine"]);
  const addRule = options.rejectAdd
    ? vi.fn(async () => {
        throw new Error("write failed");
      })
    : vi.fn(async () => ({ ok: true as const, entries: [entry] }));
  const removeRule = vi.fn(async () => [] as AutostartWhitelistEntry[]);
  const document = { createElement: () => new FakeElement() };
  vi.stubGlobal("document", document);
  vi.spyOn(console, "error").mockImplementation(() => undefined);

  const view = createAutostartView({
    addToWhitelistButton: new FakeElement() as unknown as HTMLElement,
    modal: new FakeElement() as unknown as HTMLElement,
    closeButton: new FakeElement() as unknown as HTMLElement,
    cancelButton: new FakeElement() as unknown as HTMLButtonElement,
    confirmButton: new FakeElement() as unknown as HTMLButtonElement,
    modalPreset: modalPreset as unknown as HTMLSelectElement,
    modalError: new FakeElement() as unknown as HTMLElement,
    modalDomainValue: new FakeElement() as unknown as HTMLElement,
    modalUrlValue: new FakeElement() as unknown as HTMLElement,
    settingsList: settingsList as unknown as HTMLElement,
    settingsType: Object.assign(new FakeElement(), {
      value: "domain",
    }) as unknown as HTMLSelectElement,
    settingsAddValue: settingsAddValue as unknown as HTMLInputElement,
    settingsAddPreset: settingsAddPreset as unknown as HTMLSelectElement,
    settingsAddButton: settingsAddButton as unknown as HTMLButtonElement,
    settingsError: new FakeElement() as unknown as HTMLElement,
    getMessage: (name) => name,
    getActiveTab: vi.fn(
      async () =>
        ({
          id: 7,
          url: "https://example.com/page",
        }) as chrome.tabs.Tab,
    ),
    loadRules: vi.fn(async () => []),
    loadPresetNames,
    addRule,
    removeRule,
  });
  return {
    addRule,
    loadPresetNames,
    modalPreset,
    removeRule,
    settingsAddButton,
    settingsAddPreset,
    settingsAddValue,
    settingsList,
    view,
  };
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test("successful add and remove render the list and refresh both preset selects", async () => {
  const setupResult = setup();
  setupResult.settingsAddButton.dispatchEvent(new Event("click"));
  await vi.waitFor(() => expect(setupResult.addRule).toHaveBeenCalled());
  await vi.waitFor(() => expect(setupResult.loadPresetNames).toHaveBeenCalledOnce());
  expect(setupResult.settingsAddValue.value).toBe("");
  expect(setupResult.settingsList.children).toHaveLength(1);
  expect(setupResult.modalPreset.children).toHaveLength(2);
  expect(setupResult.settingsAddPreset.children).toHaveLength(2);

  const deleteButton = setupResult.settingsList.children[0].children[1];
  deleteButton.dispatchEvent(new Event("click"));
  await vi.waitFor(() => expect(setupResult.removeRule).toHaveBeenCalledWith(entry.id));
  await vi.waitFor(() => expect(setupResult.loadPresetNames).toHaveBeenCalledTimes(2));
  expect(setupResult.settingsList.children[0].id).toBe("whitelist-empty");
});

test("a rejected add keeps the input and rendered list unchanged", async () => {
  const setupResult = setup({ rejectAdd: true });
  const original = new FakeElement();
  setupResult.settingsList.appendChild(original);

  setupResult.settingsAddButton.dispatchEvent(new Event("click"));
  await vi.waitFor(() => expect(setupResult.addRule).toHaveBeenCalled());
  await vi.waitFor(() => expect(console.error).toHaveBeenCalled());

  expect(setupResult.settingsAddValue.value).toBe("example.com");
  expect(setupResult.settingsList.children).toEqual([original]);
  expect(setupResult.loadPresetNames).not.toHaveBeenCalled();
});

vi.mock("./modalFocus", () => ({
  attachModalFocus: () => ({ open: vi.fn(), close: vi.fn() }),
}));
