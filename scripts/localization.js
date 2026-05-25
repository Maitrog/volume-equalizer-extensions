document.getElementById("master-volume-label").textContent =
  chrome.i18n.getMessage("gain_slider_label");

document.getElementById("reset").textContent =
  chrome.i18n.getMessage("reset_button_label");

document.getElementById("change-eq").textContent = chrome.i18n.getMessage(
  "enable_eq_button_label"
);

document.getElementById("presets-toggle").textContent =
  chrome.i18n.getMessage("empty_preset_name");

document.getElementById("none-item").textContent =
  chrome.i18n.getMessage("empty_preset_name");

document
  .getElementById("none-item")
  .setAttribute("data-value", chrome.i18n.getMessage("empty_preset_name"));

document.getElementById("save-preset").textContent = chrome.i18n.getMessage(
  "save_preset_button_label"
);

document
  .getElementById("preset-name")
  .setAttribute("placeholder", chrome.i18n.getMessage("enter_preset_name"));

document.getElementById("import-presets").textContent = chrome.i18n.getMessage(
  "import_presets_button_label"
);

document.getElementById("export-presets").textContent = chrome.i18n.getMessage(
  "export_presets_button_label"
);

document.getElementById("enable-spectrum-label").textContent =
  chrome.i18n.getMessage("enable_spectrum_setting_option");

document.getElementById("settings-header").textContent =
  chrome.i18n.getMessage("settings_title");

document.getElementById("points-count-label").textContent =
  chrome.i18n.getMessage("points_count_setting_option");

document.getElementById("points-reset-title").textContent =
  chrome.i18n.getMessage("points_reset_title");

document.getElementById("points-reset-message").textContent =
  chrome.i18n.getMessage("points_reset_message");

document.getElementById("skip-reset-label").textContent =
  chrome.i18n.getMessage("points_reset_skip");

document.getElementById("points-reset-cancel").textContent =
  chrome.i18n.getMessage("cancel");

document.getElementById("points-reset-confirm").textContent =
  chrome.i18n.getMessage("ok");

document.getElementById("theme-label").textContent = chrome.i18n.getMessage(
  "theme_setting_option"
);

document.getElementById("support-me").textContent =
  chrome.i18n.getMessage("support_me");
