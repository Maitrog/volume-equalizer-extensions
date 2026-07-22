export const LANGUAGE_KEY = "uiLanguage";
export const DEFAULT_LANGUAGE = "en";

export const AVAILABLE_LANGUAGE_CODES = [
  "bn",
  "de",
  "en",
  "es",
  "fr",
  "hi",
  "id",
  "it",
  "ja",
  "ko",
  "lo",
  "nl",
  "pt_PT",
  "ru",
  "ta",
  "th",
  "tr",
  "vi",
  "zh_CN",
] as const;

export type AvailableLanguageCode = (typeof AVAILABLE_LANGUAGE_CODES)[number];

const LANGUAGE_NAMES = new Intl.DisplayNames(["en"], { type: "language" });

export const getLanguageName = (code: AvailableLanguageCode): string =>
  LANGUAGE_NAMES.of(code.replace("_", "-")) ?? code;

export const getBrowserLanguage = (): AvailableLanguageCode => {
  const locale = chrome.i18n.getMessage("@@ui_locale") || navigator.language;
  const exactMatch = AVAILABLE_LANGUAGE_CODES.find((code) => code === locale);
  if (exactMatch) return exactMatch;

  return DEFAULT_LANGUAGE;
};
