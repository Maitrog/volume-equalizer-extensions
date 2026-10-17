import {
  AVAILABLE_LANGUAGE_CODES,
  DEFAULT_LANGUAGE,
  getLanguageName,
  resolveLanguageCode,
  resolveInitialLanguage,
} from "./languages";

describe("resolveLanguageCode", () => {
  test("uses exact supported locale matches", () => {
    expect(resolveLanguageCode("pt_PT")).toBe("pt_PT");
  });

  test("does not use partial language matches", () => {
    expect(AVAILABLE_LANGUAGE_CODES).not.toContain("pt");
    expect(resolveLanguageCode("pt")).toBe(DEFAULT_LANGUAGE);
  });
});

test("uses the native display name for Chrome locale codes", () => {
  const expected = new Intl.DisplayNames(["en"], { type: "language" }).of("pt-PT");

  expect(getLanguageName("pt_PT")).toBe(expected);
});

test("initial language preserves stored-string resolution and browser fallback", () => {
  expect(resolveInitialLanguage(undefined, "ru")).toBe("ru");
  expect(resolveInitialLanguage(null, "de")).toBe("de");
  expect(resolveInitialLanguage("invalid", "ru")).toBe("en");
  expect(resolveInitialLanguage("de", "ru")).toBe("de");
});
