let g_currentLanguage = DEFAULT_LANGUAGE;
let g_currentMessages = {};
let g_defaultMessages = {};

function getLocalizedMessage(messageName) {
  return (
    g_currentMessages[messageName]?.message ||
    g_defaultMessages[messageName]?.message ||
    chrome.i18n.getMessage(messageName) ||
    messageName
  );
}

const setTextContent = (id, messageName) => {
  const element = document.getElementById(id);
  if (element) element.textContent = getLocalizedMessage(messageName);
};

const setPlaceholder = (id, messageName) => {
  const element = document.getElementById(id);
  if (element) {
    element.setAttribute("placeholder", getLocalizedMessage(messageName));
  }
};

const setTooltip = (id, messageName) => {
  const element = document.getElementById(id);
  if (!element) return;

  const message = getLocalizedMessage(messageName);
  element.setAttribute("title", message);
  element.setAttribute("alt", message);
  element.setAttribute("aria-label", message);
};

async function loadLocaleMessages(locale) {
  const response = await fetch(
    chrome.runtime.getURL(`_locales/${locale}/messages.json`)
  );
  if (!response.ok) return {};
  return response.json();
}

function populateLanguageSelect() {
  const select = document.getElementById("language-select");
  if (!select) return;

  select.textContent = "";
  AVAILABLE_LANGUAGE_CODES.forEach((code) => {
    const option = document.createElement("option");
    option.value = code;
    option.textContent = CHROME_I18N_LOCALES.get(code) ?? code;
    select.appendChild(option);
  });
  select.value = g_currentLanguage;
}

async function refreshLocalizedDynamicContent() {
  await refreshAutostartSettingsPresetValueSelects();
  await renderWhitelist();
  const tabId = await getCurrentTabId();
  const result = await chrome.storage.local.get(["enabled." + tabId]);
  setEnableBtnText(result["enabled." + tabId] ?? false);
}

function applyLocalization() {
  setTextContent("master-volume-label", "gain_slider_label");
  setTextContent("reset", "reset_button_label");
  setTextContent("change-eq", "enable_eq_button_label");
  setTextContent("presets-toggle", "empty_preset_name");
  setTextContent("none-item", "empty_preset_name");
  setTextContent("save-preset", "save_preset_button_label");
  setTextContent("import-presets", "import_presets_button_label");
  setTextContent("export-presets", "export_presets_button_label");
  setTextContent("enable-spectrum-label", "enable_spectrum_setting_option");
  setTextContent("settings-header", "settings_title");
  setTextContent("points-count-label", "points_count_setting_option");
  setTextContent("language-label", "language_setting_option");
  setTextContent("points-reset-title", "points_reset_title");
  setTextContent("points-reset-message", "points_reset_message");
  setTextContent("skip-reset-label", "points_reset_skip");
  setTextContent("points-reset-cancel", "cancel");
  setTextContent("points-reset-confirm", "ok");
  setTextContent("support-me", "support_me");
  setTextContent("theme-label", "theme_setting_option");
  setTextContent("shortcuts-settings-title", "shortcuts_settings_title");
  setTextContent("shortcut-mute-label", "shortcut_mute_label");
  setTextContent("shortcut-toggle-eq-label", "shortcut_toggle_eq_label");
  setTextContent("presets-settings-title", "presets_settings_title");
  setTextContent("community-settings-title", "community_settings_title");
  setTextContent("autostart-settings-title", "autostart_settings_title");
  setTextContent(
    "autostart-settings-type-domain",
    "autostart_rule_type_domain_label"
  );
  setTextContent(
    "autostart-settings-type-url",
    "autostart_rule_type_url_label"
  );
  setTextContent("autostart-settings-add-btn", "add");
  setTextContent("autostart-modal-title", "autostart_modal_title");
  setTextContent(
    "autostart-modal-domain-label",
    "autostart_rule_type_domain_label"
  );
  setTextContent("autostart-modal-url-label", "autostart_rule_type_url_label");
  setTextContent(
    "autostart-modal-preset-label",
    "autostart_modal_preset_label"
  );
  setTextContent("autostart-modal-cancel", "cancel");
  setTextContent("autostart-modal-confirm", "add");
  setTextContent("whitelist-empty", "autostart_whitelist_empty");

  setPlaceholder("preset-name", "enter_preset_name");

  setTooltip("settings-btn", "settings_button_tooltip");
  setTooltip("volume-mute", "volume_mute_button_tooltip");
  setTooltip("add-to-autostart-whitelist-btn", "add_to_autostart_tooltip");
  setTooltip("window-mod", "window_mode_button_tooltip");
}

async function setLanguage(language, options = {}) {
  g_currentLanguage = language;
  g_currentMessages = await loadLocaleMessages(g_currentLanguage);
  document.documentElement.lang = g_currentLanguage.replace("_", "-");

  applyLocalization();

  populateLanguageSelect();

  if (options.save) {
    await chrome.storage.local.set({ [LANGUAGE_KEY]: g_currentLanguage });
    await refreshLocalizedDynamicContent();
  }
}

async function initLocalization() {
  g_defaultMessages = await loadLocaleMessages(DEFAULT_LANGUAGE);
  const stored = await chrome.storage.local.get([LANGUAGE_KEY]);
  const language = stored[LANGUAGE_KEY] ?? getBrowserLanguage();
  await setLanguage(language);
}

const g_localizationReady = initLocalization();
