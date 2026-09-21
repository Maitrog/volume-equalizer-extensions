import {
  createOnboardingGuideView,
  getNextFocusIndex,
  getSpotlightPanels,
} from "./onboardingGuideView";

class FakeElement extends EventTarget {
  children: FakeElement[] = [];
  classList = { toggle: vi.fn() };
  className = "";
  hidden = false;
  inert = false;
  parts = new Map<string, FakeElement>();
  style: Record<string, string> = {};
  textContent = "";
  value = "";

  append(...children: FakeElement[]): void {
    this.children.push(...children);
  }

  cloneNode(): FakeElement {
    const clone = new FakeElement();
    clone.value = this.value;
    return clone;
  }

  focus(): void {}

  getBoundingClientRect(): DOMRect {
    return { left: 20, top: 20, right: 120, bottom: 120, width: 100, height: 100 } as DOMRect;
  }

  querySelectorAll(): FakeElement[] {
    return [];
  }

  querySelector(selector: string): FakeElement | null {
    return this.parts.get(selector) ?? null;
  }

  removeAttribute(): void {}

  replaceChildren(): void {
    this.children = [];
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
});

test("renders every equalizer hint and keeps them intact when the popup resizes", async () => {
  const root = new FakeElement();
  const content = new FakeElement();
  const nextButton = new FakeElement();
  [
    "#guide-title",
    ".guide-card",
    ".guide-spotlight",
    "[data-guide-action='back']",
    "[data-guide-action='skip']",
    "[data-guide-panel='top']",
    "[data-guide-panel='left']",
    "[data-guide-panel='right']",
    "[data-guide-panel='bottom']",
  ].forEach((selector) => root.parts.set(selector, new FakeElement()));
  root.parts.set(".guide-content", content);
  root.parts.set("[data-guide-action='next']", nextButton);

  const fakeWindow = Object.assign(new EventTarget(), {
    innerWidth: 640,
    innerHeight: 600,
  });
  vi.stubGlobal("window", fakeWindow);
  vi.stubGlobal("document", {
    activeElement: null,
    createElement: () => new FakeElement(),
  });

  const target = new FakeElement();
  const view = createOnboardingGuideView({
    root: root as unknown as HTMLElement,
    inertElements: [],
    targets: {
      volumeMute: target,
      changeEq: target,
      settings: target,
      autostart: target,
      tabCapture: target,
      equalizer: target,
      volume: target,
      presets: target,
    } as unknown as Parameters<typeof createOnboardingGuideView>[0]["targets"],
    sourceLanguageSelect: new FakeElement() as unknown as HTMLSelectElement,
    sourceThemeSelect: new FakeElement() as unknown as HTMLSelectElement,
    sourcePointCountSelect: new FakeElement() as unknown as HTMLSelectElement,
    getMessage: (name) => name,
    setLanguage: async () => undefined,
    setTheme: async () => undefined,
    setPointCount: async () => undefined,
    onComplete: async () => undefined,
  });

  vi.stubGlobal("HTMLElement", FakeElement);
  await view.start();
  for (let index = 0; index < 8; index += 1) {
    nextButton.dispatchEvent(new Event("click"));
  }
  const firstMessage = content.children[0];

  expect(content.children.map(({ textContent }) => textContent)).toEqual([
    "guide_canvas_hint",
    "q_factor_shift_hint",
    "point_double_click_hint",
    "guide_spectrum_visualization_hint",
  ]);

  fakeWindow.dispatchEvent(new Event("resize"));

  expect(content.children[0]).toBe(firstMessage);
});

test("moves backward from the dialog title to the last control", () => {
  expect(getNextFocusIndex(-1, 3, true)).toBe(2);
  expect(getNextFocusIndex(2, 3, false)).toBe(0);
});

test("splits the viewport into four panels around the target", () => {
  expect(getSpotlightPanels({ left: 10, top: 20, right: 40, bottom: 60 }, 100, 90)).toEqual({
    top: { left: 0, top: 0, width: 100, height: 20 },
    left: { left: 0, top: 20, width: 10, height: 40 },
    right: { left: 40, top: 20, width: 60, height: 40 },
    bottom: { left: 0, top: 60, width: 100, height: 30 },
  });
});
