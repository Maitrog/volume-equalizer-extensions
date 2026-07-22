import {
  AVAILABLE_LANGUAGE_CODES,
  DEFAULT_LANGUAGE,
  getBrowserLanguage,
  getLanguageName,
} from "./languages";

const setNavigatorLanguage = (language: string): void => {
  Object.defineProperty(globalThis.navigator, "language", {
    configurable: true,
    value: language,
  });
};

describe("getBrowserLanguage", () => {
  beforeEach(() => {
    vi.stubGlobal("chrome", {
      i18n: {
        getMessage: vi.fn(() => ""),
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("uses exact Chrome UI locale matches", () => {
    vi.mocked(chrome.i18n.getMessage).mockReturnValue("pt_PT");
    setNavigatorLanguage("en");

    expect(getBrowserLanguage()).toBe("pt_PT");
  });

  test("does not use partial language matches", () => {
    vi.mocked(chrome.i18n.getMessage).mockReturnValue("pt");
    setNavigatorLanguage("en-US");

    expect(AVAILABLE_LANGUAGE_CODES).not.toContain("pt");
    expect(getBrowserLanguage()).toBe(DEFAULT_LANGUAGE);
  });
});

test("uses the native display name for Chrome locale codes", () => {
  const expected = new Intl.DisplayNames(["en"], { type: "language" }).of(
    "pt-PT",
  );

  expect(getLanguageName("pt_PT")).toBe(expected);
});
