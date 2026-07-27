import {
  AVAILABLE_LANGUAGE_CODES,
  DEFAULT_LANGUAGE,
  LANGUAGE_KEY,
  getBrowserLanguage,
  getLanguageName,
} from "./languages";

type LocaleMessages = Record<string, { message?: string }>;

export interface LocalizationService {
  ready: Promise<void>;
  getMessage(messageName: string): string;
  applyLocalization(root?: Document): void;
  populateLanguageSelect(root?: Document): void;
  setLanguage(
    language: string,
    options?: {
      save?: boolean;
      refreshDynamicContent?: () => Promise<void>;
    },
  ): Promise<void>;
}

const setElementTooltip = (
  root: Document,
  id: string,
  messageName: string,
  getMessage: (messageName: string) => string,
): void => {
  const element = root.getElementById(id);
  if (!element) return;

  const message = getMessage(messageName);
  element.setAttribute("title", message);
  element.setAttribute("alt", message);
  element.setAttribute("aria-label", message);
};

const setFirstTextNodeContent = (
  root: Document,
  id: string,
  messageName: string,
  getMessage: (messageName: string) => string,
  suffix = "",
): void => {
  const element = root.getElementById(id);
  if (!element) return;

  const textNode = Array.from(element.childNodes).find(
    (node) => node.nodeType === 3,
  );
  if (textNode) textNode.textContent = `${getMessage(messageName)}${suffix}`;
};

const loadLocaleMessages = async (locale: string): Promise<LocaleMessages> => {
  const response = await fetch(
    chrome.runtime.getURL(`_locales/${locale}/messages.json`),
  );
  if (!response.ok) return {};
  return response.json() as Promise<LocaleMessages>;
};

export const createLocalizationService = (): LocalizationService => {
  let currentLanguage = DEFAULT_LANGUAGE;
  let currentMessages: LocaleMessages = {};
  let defaultMessages: LocaleMessages = {};

  const getMessage = (messageName: string): string =>
    currentMessages[messageName]?.message ||
    defaultMessages[messageName]?.message ||
    chrome.i18n.getMessage(messageName) ||
    messageName;

  const applyLocalization = (root: Document = document): void => {
    root.querySelectorAll<HTMLElement>("[data-i18n]").forEach((element) => {
      const messageName = element.dataset.i18n;
      if (messageName) element.textContent = getMessage(messageName);
    });

    setFirstTextNodeContent(root, "translators-label", "translators_label", getMessage, " ");
    setFirstTextNodeContent(root, "donation-label", "support_me", getMessage, " ");
    setFirstTextNodeContent(root, "help-with-translation-label", "help_with_translation_label", getMessage);
    setFirstTextNodeContent(root, "source-code-label", "source_code_label", getMessage);

    const whitelistEmpty = root.getElementById("whitelist-empty");
    if (whitelistEmpty) {
      whitelistEmpty.textContent = getMessage("autostart_whitelist_empty");
    }

    setElementTooltip(root, "settings-btn", "settings_button_tooltip", getMessage);
    setElementTooltip(root, "volume-mute", "volume_mute_button_tooltip", getMessage);
    setElementTooltip(root, "add-to-autostart-whitelist-btn", "add_to_autostart_tooltip", getMessage);
    setElementTooltip(root, "window-mod", "window_mode_button_tooltip", getMessage);
  };

  const populateLanguageSelect = (root: Document = document): void => {
    const select = root.getElementById("language-select");
    if (!(select instanceof HTMLSelectElement)) return;

    select.textContent = "";
    AVAILABLE_LANGUAGE_CODES.forEach((code) => {
      const option = root.createElement("option");
      option.value = code;
      option.textContent = getLanguageName(code);
      select.appendChild(option);
    });
    select.value = currentLanguage;
  };

  const setLanguage = async (
    language: string,
    options: {
      save?: boolean;
      refreshDynamicContent?: () => Promise<void>;
    } = {},
  ): Promise<void> => {
    currentLanguage = language;
    currentMessages = await loadLocaleMessages(currentLanguage);

    if (globalThis.document) {
      document.documentElement.lang = currentLanguage.replace("_", "-");
      applyLocalization(document);
      populateLanguageSelect(document);
    }

    if (options.save) {
      await chrome.storage.local.set({ [LANGUAGE_KEY]: currentLanguage });
      await options.refreshDynamicContent?.();
    }
  };

  const initLocalization = async (): Promise<void> => {
    defaultMessages = await loadLocaleMessages(DEFAULT_LANGUAGE);
    const stored = await chrome.storage.local.get([LANGUAGE_KEY]);
    const language =
      typeof stored[LANGUAGE_KEY] === "string"
        ? stored[LANGUAGE_KEY]
        : getBrowserLanguage();
    await setLanguage(language);
  };

  return {
    ready: initLocalization(),
    getMessage,
    applyLocalization,
    populateLanguageSelect,
    setLanguage,
  };
};
