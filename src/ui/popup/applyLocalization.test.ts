import { afterEach, describe, expect, test, vi } from "vitest";

import { AVAILABLE_LANGUAGE_CODES } from "../../domains/localization/languages";
import { applyLocalization, populateLanguageSelect } from "./applyLocalization";

class FakeElement {
  dataset: Record<string, string> = {};
  textContent = "";
  childNodes: Array<{ nodeType: number; textContent: string }> = [];
  attributes = new Map<string, string>();
  value = "";
  options: FakeElement[] = [];

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  appendChild(element: FakeElement): void {
    this.options.push(element);
  }
}

afterEach(() => vi.unstubAllGlobals());

describe("popup localization DOM", () => {
  test("applies data text, labels, fixed text and tooltips", () => {
    const text = new FakeElement();
    text.dataset.i18n = "reset";
    const labelled = new FakeElement();
    labelled.dataset.i18nLabel = "close";
    const translators = new FakeElement();
    translators.childNodes = [{ nodeType: 3, textContent: "old" }];
    const settings = new FakeElement();
    const byId = new Map<string, FakeElement>([
      ["translators-label", translators],
      ["settings-btn", settings],
    ]);
    const root = {
      querySelectorAll: vi.fn((selector: string) =>
        selector === "[data-i18n]" ? [text] : [labelled],
      ),
      getElementById: vi.fn((id: string) => byId.get(id) ?? null),
    } as unknown as Document;
    const getMessage = (key: string) => `localized:${key}`;

    applyLocalization(root, getMessage);

    expect(text.textContent).toBe("localized:reset");
    expect(labelled.attributes.get("aria-label")).toBe("localized:close");
    expect(translators.childNodes[0].textContent).toBe("localized:translators_label ");
    expect(settings.attributes.get("title")).toBe("localized:settings_button_tooltip");
  });

  test("populates the supplied language select", () => {
    class FakeSelect extends FakeElement {}
    vi.stubGlobal("HTMLSelectElement", FakeSelect);
    const select = new FakeSelect();
    const root = {
      getElementById: vi.fn(() => select),
      createElement: vi.fn(() => new FakeElement()),
    } as unknown as Document;

    populateLanguageSelect(root, "ru");

    expect(select.options.map(({ value }) => value)).toEqual(AVAILABLE_LANGUAGE_CODES);
    expect(select.options.find(({ value }) => value === "ru")?.textContent).toBe("Russian");
    expect(select.value).toBe("ru");
  });
});
