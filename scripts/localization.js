document.getElementById("master-volume-label").textContent =
  chrome.i18n.getMessage("gain");

document.getElementById("reset").textContent = chrome.i18n.getMessage("reset");

document.getElementById("change-eq").textContent =
  chrome.i18n.getMessage("enable_eq");

document.getElementById("presets-toggle").textContent =
  chrome.i18n.getMessage("none");

document.getElementById("none-item").textContent =
  chrome.i18n.getMessage("none");

document
  .getElementById("none-item")
  .setAttribute("data-value", chrome.i18n.getMessage("none"));

document.getElementById("save-preset").textContent =
  chrome.i18n.getMessage("save");

document
  .getElementById("preset-name")
  .setAttribute("placeholder", chrome.i18n.getMessage("enter_preset_name"));

document.getElementById("import-presets").textContent =
  chrome.i18n.getMessage("import_presets");

document.getElementById("export-presets").textContent =
  chrome.i18n.getMessage("export_presets");

document.getElementById("enable-spectrum-label").textContent =
  chrome.i18n.getMessage("enable_spectrum");

document.getElementById("settings-header").textContent =
  chrome.i18n.getMessage("settings");
