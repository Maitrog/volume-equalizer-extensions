const setTextContent = (id, messageName) => {
  document.getElementById(id).textContent = chrome.i18n.getMessage(messageName);
};

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
setTextContent("points-reset-title", "points_reset_title");
setTextContent("points-reset-message", "points_reset_message");
setTextContent("skip-reset-label", "points_reset_skip");
setTextContent("points-reset-cancel", "cancel");
setTextContent("points-reset-confirm", "ok");
setTextContent("support-me", "support_me");
setTextContent("theme-label", "theme_setting_option");
setTextContent("presets-settings-title", "presets_settings_title");
setTextContent("autostart-settings-title", "autostart_settings_title");
setTextContent(
  "autostart-settings-type-domain",
  "autostart_rule_type_domain_label"
);
setTextContent("autostart-settings-type-url", "autostart_rule_type_url_label");
setTextContent("autostart-settings-add-btn", "add");
setTextContent("autostart-modal-title", "autostart_modal_title");
setTextContent(
  "autostart-modal-domain-label",
  "autostart_rule_type_domain_label"
);
setTextContent("autostart-modal-url-label", "autostart_rule_type_url_label");
setTextContent("autostart-modal-preset-label", "autostart_modal_preset_label");
setTextContent("autostart-modal-cancel", "cancel");
setTextContent("autostart-modal-confirm", "add");

document
  .getElementById("none-item")
  .setAttribute("data-value", chrome.i18n.getMessage("empty_preset_name"));

document
  .getElementById("preset-name")
  .setAttribute("placeholder", chrome.i18n.getMessage("enter_preset_name"));

const setTooltip = (id, messageName) => {
  const element = document.getElementById(id);
  const message = chrome.i18n.getMessage(messageName);

  element.setAttribute("title", message);
  element.setAttribute("alt", message);
  element.setAttribute("aria-label", message);
};

setTooltip("settings-btn", "settings_button_tooltip");
setTooltip("volume-mute", "volume_mute_button_tooltip");
setTooltip("add-to-autostart-whitelist-btn", "add_to_autostart_tooltip");
setTooltip("window-mod", "window_mode_button_tooltip");
