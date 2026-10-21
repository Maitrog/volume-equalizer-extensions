import { afterEach, expect, test, vi } from "vitest";
import { attachModalFocus } from "./modalFocus";

class TestElement extends EventTarget {
  style = { display: "none" };
  inert = false;
  tabIndex = 0;
  parentElement: TestElement | null = null;
  children: TestElement[] = [];
  controls: TestElement[] = [];
  setAttribute = vi.fn();
  matches = () => false;
  getClientRects = () => [{}];
  closest = () => (this.inert || this.parentElement?.inert ? this : null);
  querySelectorAll = () => this.controls;
  contains = (element: unknown): boolean =>
    element === this || this.children.includes(element as TestElement);
  focus = () => {
    testDocument.activeElement = this;
  };
}

const testDocument = Object.assign(new EventTarget(), {
  activeElement: null as TestElement | null,
  body: new TestElement(),
});
const disposers: Array<() => void> = [];
const attach = (
  dialog: TestElement,
  trigger: TestElement,
  options?: { canClose?: () => boolean },
) => {
  const view = attachModalFocus(
    dialog as unknown as HTMLElement,
    trigger as unknown as HTMLElement,
    options,
  );
  disposers.unshift(view.dispose);
  return view;
};

test("busy dialogs guard close and Escape but dispose restores focus and inert", () => {
  vi.stubGlobal("HTMLElement", TestElement);
  vi.stubGlobal("document", testDocument);
  const dialog = new TestElement();
  const trigger = new TestElement();
  testDocument.body.children = [trigger, dialog];
  trigger.parentElement = dialog.parentElement = testDocument.body;
  const view = attach(dialog, trigger, { canClose: () => false });
  view.open();
  view.close();
  key("Escape");
  expect(dialog.style.display).toBe("block");
  expect(trigger.inert).toBe(true);
  view.dispose();
  expect(dialog.style.display).toBe("none");
  expect(trigger.inert).toBe(false);
  expect(testDocument.activeElement).toBe(trigger);
});
const key = (value: string, shiftKey = false) => {
  const event = Object.assign(new Event("keydown", { cancelable: true }), { key: value, shiftKey });
  testDocument.dispatchEvent(event);
  return event;
};

afterEach(() => {
  disposers.splice(0).forEach((dispose) => dispose());
  vi.unstubAllGlobals();
});

test("nested dialogs restore original inert states and focus one level at a time", () => {
  vi.stubGlobal("HTMLElement", TestElement);
  vi.stubGlobal("document", testDocument);
  const trigger = new TestElement();
  const settings = new TestElement();
  const confirmation = new TestElement();
  const alreadyInert = new TestElement();
  alreadyInert.inert = true;
  const pointSelect = new TestElement();
  settings.controls = settings.children = [pointSelect];
  pointSelect.parentElement = settings;
  testDocument.body.children = [trigger, settings, confirmation, alreadyInert];
  testDocument.body.children.forEach((element) => {
    element.parentElement = testDocument.body;
  });
  trigger.focus();
  const parent = attach(settings, trigger);
  const child = attach(confirmation, pointSelect);
  parent.open();
  expect(testDocument.activeElement).toBe(pointSelect);
  expect(trigger.inert).toBe(true);
  child.open();
  expect(settings.inert).toBe(true);
  expect(confirmation.inert).toBe(false);
  expect(key("Escape").defaultPrevented).toBe(true);
  expect(settings.style.display).toBe("block");
  expect(testDocument.activeElement).toBe(pointSelect);
  expect(settings.inert).toBe(false);
  key("Escape");
  expect(testDocument.activeElement).toBe(trigger);
  expect(trigger.inert).toBe(false);
  expect(alreadyInert.inert).toBe(true);
  expect(confirmation.inert).toBe(false);
});

test("Tab wraps in both directions and an empty dialog keeps focus", () => {
  vi.stubGlobal("HTMLElement", TestElement);
  vi.stubGlobal("document", testDocument);
  const dialog = new TestElement();
  const first = new TestElement();
  const last = new TestElement();
  dialog.controls = dialog.children = [first, last];
  const view = attach(dialog, first);
  view.open();
  key("Tab", true);
  expect(testDocument.activeElement).toBe(last);
  key("Tab");
  expect(testDocument.activeElement).toBe(first);
  dialog.controls = [];
  expect(key("Tab").defaultPrevented).toBe(true);
  expect(testDocument.activeElement).toBe(dialog);
});
