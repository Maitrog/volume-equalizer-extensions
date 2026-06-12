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

const g_setTextContent = (id, messageName) => {
  const element = document.getElementById(id);
  if (element) element.textContent = getLocalizedMessage(messageName);
};

const g_setPlaceholder = (id, messageName) => {
  const element = document.getElementById(id);
  if (element) {
    element.setAttribute("placeholder", getLocalizedMessage(messageName));
  }
};

const g_setTooltip = (id, messageName) => {
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
  if (typeof refreshAutostartSettingsPresetValueSelects === "function") {
    await refreshAutostartSettingsPresetValueSelects();
  }
  if (typeof renderWhitelist === "function") {
    await renderWhitelist();
  }
  if (
    typeof getCurrentTabId === "function" &&
    typeof setEnableBtnText === "function"
  ) {
    const tabId = await getCurrentTabId();
    const result = await chrome.storage.local.get(["enabled." + tabId]);
    setEnableBtnText(result["enabled." + tabId] ?? false);
  }
}

function applyLocalization() {
  g_setTextContent("master-volume-label", "gain_slider_label");
  g_setTextContent("reset", "reset_button_label");
  g_setTextContent("change-eq", "enable_eq_button_label");
  g_setTextContent("presets-toggle", "empty_preset_name");
  g_setTextContent("none-item", "empty_preset_name");
  g_setTextContent("save-preset", "save_preset_button_label");
  g_setTextContent("import-presets", "import_presets_button_label");
  g_setTextContent("export-presets", "export_presets_button_label");
  g_setTextContent("enable-spectrum-label", "enable_spectrum_setting_option");
  g_setTextContent("settings-header", "settings_title");
  g_setTextContent("points-count-label", "points_count_setting_option");
  g_setTextContent("language-label", "language_setting_option");
  g_setTextContent("points-reset-title", "points_reset_title");
  g_setTextContent("points-reset-message", "points_reset_message");
  g_setTextContent("skip-reset-label", "points_reset_skip");
  g_setTextContent("points-reset-cancel", "cancel");
  g_setTextContent("points-reset-confirm", "ok");
  g_setTextContent("support-me", "support_me");
  g_setTextContent("theme-label", "theme_setting_option");
  g_setTextContent("presets-settings-title", "presets_settings_title");
  g_setTextContent("autostart-settings-title", "autostart_settings_title");
  g_setTextContent(
    "autostart-settings-type-domain",
    "autostart_rule_type_domain_label"
  );
  g_setTextContent(
    "autostart-settings-type-url",
    "autostart_rule_type_url_label"
  );
  g_setTextContent("autostart-settings-add-btn", "add");
  g_setTextContent("autostart-modal-title", "autostart_modal_title");
  g_setTextContent(
    "autostart-modal-domain-label",
    "autostart_rule_type_domain_label"
  );
  g_setTextContent(
    "autostart-modal-url-label",
    "autostart_rule_type_url_label"
  );
  g_setTextContent(
    "autostart-modal-preset-label",
    "autostart_modal_preset_label"
  );
  g_setTextContent("autostart-modal-cancel", "cancel");
  g_setTextContent("autostart-modal-confirm", "add");

  g_setPlaceholder("preset-name", "enter_preset_name");

  g_setTooltip("settings-btn", "settings_button_tooltip");
  g_setTooltip("volume-mute", "volume_mute_button_tooltip");
  g_setTooltip("add-to-autostart-whitelist-btn", "add_to_autostart_tooltip");
  g_setTooltip("window-mod", "window_mode_button_tooltip");
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
