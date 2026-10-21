import {
  DEFAULT_LANGUAGE,
  LANGUAGE_KEY,
  resolveLanguageCode,
  resolveInitialLanguage,
  type AvailableLanguageCode,
} from "../../domains/localization/languages";
import {
  loadLocaleMessages,
  type LocaleMessages,
} from "../../infrastructure/localization/localeLoader";
import {
  applyLocalization as applyPopupLocalization,
  populateLanguageSelect as populatePopupLanguageSelect,
} from "../../ui/popup/applyLocalization";

export interface LocalizationService {
  ready: Promise<void>;
  waitForPendingChanges(): Promise<void>;
  applySavedLanguage(language: AvailableLanguageCode, isCurrent?: () => boolean): Promise<boolean>;
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

export const createLocalizationService = (): LocalizationService => {
  let currentLanguage = DEFAULT_LANGUAGE;
  let currentMessages: LocaleMessages = {};
  let defaultMessages: LocaleMessages = {};
  let languageGeneration = 0;
  let languageSaveQueue = Promise.resolve();
  const pendingChanges = new Set<Promise<void>>();

  const getMessage = (messageName: string): string =>
    currentMessages[messageName]?.message ||
    defaultMessages[messageName]?.message ||
    chrome.i18n.getMessage(messageName) ||
    messageName;

  const applyLocalization = (root: Document = document): void => {
    applyPopupLocalization(root, getMessage);
  };

  const populateLanguageSelect = (root: Document = document): void => {
    populatePopupLanguageSelect(root, currentLanguage);
  };

  const applyCurrentLanguage = (): void => {
    if (!globalThis.document) return;
    document.documentElement.lang = currentLanguage.replace("_", "-");
    applyLocalization(document);
    populateLanguageSelect(document);
  };

  const changeLanguage = async (
    resolvedLanguage: AvailableLanguageCode,
    generation: number,
    save: boolean,
    isCurrent: () => boolean = () => true,
  ): Promise<boolean> => {
    let messages: LocaleMessages;
    try {
      messages = await loadLocaleMessages(resolvedLanguage);
    } catch (error) {
      if (generation === languageGeneration && isCurrent()) {
        console.error("Failed to load locale", { language: resolvedLanguage, error });
        applyCurrentLanguage();
      }
      return false;
    }
    if (generation !== languageGeneration || !isCurrent()) return false;
    if (Object.keys(messages).length === 0) {
      console.error("Failed to load locale", {
        language: resolvedLanguage,
        error: "Empty locale",
      });
      applyCurrentLanguage();
      return false;
    }

    currentLanguage = resolvedLanguage;
    currentMessages = messages;
    applyCurrentLanguage();
    if (save) {
      let savedLatest = false;
      const saving = languageSaveQueue.then(async () => {
        if (generation !== languageGeneration) return;
        await chrome.storage.local.set({ [LANGUAGE_KEY]: resolvedLanguage });
        savedLatest = generation === languageGeneration;
      });
      languageSaveQueue = saving.catch(() => undefined);
      await saving;
      if (!savedLatest) return false;
    }
    return true;
  };

  const setLanguage: LocalizationService["setLanguage"] = async (language, options = {}) => {
    const generation = ++languageGeneration;
    const change = changeLanguage(resolveLanguageCode(language), generation, options.save === true);
    const pending = change.then((applied) => {
      if (!applied && generation === languageGeneration)
        throw new Error("Failed to apply language");
    });
    pendingChanges.add(pending);
    void pending.then(
      () => pendingChanges.delete(pending),
      () => pendingChanges.delete(pending),
    );
    const applied = await change;
    if (applied && options.save) await options.refreshDynamicContent?.();
  };

  const applySavedLanguage = async (
    language: AvailableLanguageCode,
    isCurrent?: () => boolean,
  ): Promise<boolean> => {
    try {
      return await changeLanguage(language, ++languageGeneration, false, isCurrent);
    } catch (error) {
      console.error("Failed to apply saved locale", { language, error });
      return false;
    }
  };

  const initLocalization = async (): Promise<void> => {
    try {
      defaultMessages = await loadLocaleMessages(DEFAULT_LANGUAGE);
    } catch (error) {
      console.error("Failed to load default locale", {
        language: DEFAULT_LANGUAGE,
        error,
      });
    }
    const stored = await chrome.storage.local.get([LANGUAGE_KEY]);
    const browserLocale = chrome.i18n.getMessage("@@ui_locale") || navigator.language;
    const language = resolveInitialLanguage(stored[LANGUAGE_KEY], browserLocale);
    await setLanguage(language);
  };

  return {
    ready: initLocalization(),
    getMessage,
    applyLocalization,
    populateLanguageSelect,
    setLanguage,
    applySavedLanguage,
    waitForPendingChanges: async () => {
      await Promise.all(pendingChanges);
    },
  };
};
