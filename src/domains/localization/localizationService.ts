import {
  AVAILABLE_LANGUAGE_CODES,
  CHROME_I18N_LOCALES,
  DEFAULT_LANGUAGE,
  LANGUAGE_KEY,
  getBrowserLanguage,
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

const setElementTextContent = (
  root: Document,
  id: string,
  messageName: string,
  getMessage: (messageName: string) => string,
): void => {
  const element = root.getElementById(id);
  if (element) element.textContent = getMessage(messageName);
};

const setElementPlaceholder = (
  root: Document,
  id: string,
  messageName: string,
  getMessage: (messageName: string) => string,
): void => {
  const element = root.getElementById(id);
  if (element) {
    element.setAttribute("placeholder", getMessage(messageName));
  }
};

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
    setElementTextContent(root, "global-controls-title", "global_controls_title", getMessage);
    setElementTextContent(root, "preset-controls-title", "preset_controls_title", getMessage);
    setElementTextContent(root, "master-volume-label", "gain_slider_label", getMessage);
    setElementTextContent(root, "reset", "reset_button_label", getMessage);
    setElementTextContent(root, "presets-toggle", "empty_preset_name", getMessage);
    setElementTextContent(root, "none-item", "empty_preset_name", getMessage);
    setElementTextContent(root, "save-preset", "save_preset_button_label", getMessage);
    setElementTextContent(root, "preset-save-title", "save_preset_modal_title", getMessage);
    setElementTextContent(root, "preset-name-label", "preset_name_label", getMessage);
    setElementTextContent(root, "preset-save-cancel", "cancel", getMessage);
    setElementTextContent(root, "preset-save-confirm", "save", getMessage);
    setElementTextContent(root, "import-presets", "import_presets_button_label", getMessage);
    setElementTextContent(root, "export-presets", "export_presets_button_label", getMessage);
    setElementTextContent(root, "enable-spectrum-label", "enable_spectrum_setting_option", getMessage);
    setElementTextContent(root, "settings-header", "settings_title", getMessage);
    setElementTextContent(root, "points-count-label", "points_count_setting_option", getMessage);
    setElementTextContent(root, "language-label", "language_setting_option", getMessage);
    setElementTextContent(root, "points-reset-title", "points_reset_title", getMessage);
    setElementTextContent(root, "points-reset-message", "points_reset_message", getMessage);
    setElementTextContent(root, "skip-reset-label", "points_reset_skip", getMessage);
    setElementTextContent(root, "points-reset-cancel", "cancel", getMessage);
    setElementTextContent(root, "points-reset-confirm", "ok", getMessage);
    setElementTextContent(root, "theme-label", "theme_setting_option", getMessage);
    setElementTextContent(root, "shortcuts-settings-title", "shortcuts_settings_title", getMessage);
    setElementTextContent(root, "shortcut-mute-label", "shortcut_mute_label", getMessage);
    setElementTextContent(root, "shortcut-toggle-eq-label", "shortcut_toggle_eq_label", getMessage);
    setElementTextContent(root, "presets-settings-title", "presets_settings_title", getMessage);
    setElementTextContent(root, "hide-default-presets-label", "hide_default_presets_label", getMessage);
    setElementTextContent(root, "community-settings-title", "community_settings_title", getMessage);
    setFirstTextNodeContent(root, "translators-label", "translators_label", getMessage, " ");
    setFirstTextNodeContent(root, "donation-label", "support_me", getMessage, " ");
    setFirstTextNodeContent(root, "help-with-translation-label", "help_with_translation_label", getMessage);
    setFirstTextNodeContent(root, "source-code-label", "source_code_label", getMessage);
    setElementTextContent(root, "autostart-settings-title", "autostart_settings_title", getMessage);
    setElementTextContent(root, "autostart-settings-type-domain", "autostart_rule_type_domain_label", getMessage);
    setElementTextContent(root, "autostart-settings-type-url", "autostart_rule_type_url_label", getMessage);
    setElementTextContent(root, "autostart-settings-add-btn", "add", getMessage);
    setElementTextContent(root, "autostart-modal-title", "autostart_modal_title", getMessage);
    setElementTextContent(root, "autostart-modal-domain-label", "autostart_rule_type_domain_label", getMessage);
    setElementTextContent(root, "autostart-modal-url-label", "autostart_rule_type_url_label", getMessage);
    setElementTextContent(root, "autostart-modal-preset-label", "autostart_modal_preset_label", getMessage);
    setElementTextContent(root, "autostart-modal-cancel", "cancel", getMessage);
    setElementTextContent(root, "autostart-modal-confirm", "add", getMessage);
    setElementTextContent(root, "whitelist-empty", "autostart_whitelist_empty", getMessage);

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
      option.textContent = CHROME_I18N_LOCALES.get(code) ?? code;
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
