import { getRequiredElement } from "./getRequiredElement";

class ExpectedElement {}
class ActualElement {
  tagName = "DIV";
}

const createRoot = (element: unknown | null): ParentNode =>
  ({
    querySelector: vi.fn(() => element),
  }) as unknown as ParentNode;

const expectedConstructor = ExpectedElement as unknown as {
  new (): Element;
};

describe("getRequiredElement", () => {
  test("does not require CSS.escape when looking up missing elements", () => {
    const originalCss = globalThis.CSS;

    try {
      delete (globalThis as { CSS?: typeof CSS }).CSS;

      expect(() =>
        getRequiredElement(createRoot(null), "missing.id", expectedConstructor),
      ).toThrow("Missing required element #missing.id");
    } finally {
      if (originalCss) {
        (globalThis as { CSS?: typeof CSS }).CSS = originalCss;
      }
    }
  });

  test("reports expected and actual element types", () => {
    expect(() =>
      getRequiredElement(
        createRoot(new ActualElement()),
        "settings-modal",
        expectedConstructor,
      ),
    ).toThrow(
      "Element #settings-modal has an unexpected type. Expected ExpectedElement, received ActualElement/div.",
    );
  });
});
