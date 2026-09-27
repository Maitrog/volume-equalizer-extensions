import { AVAILABLE_LANGUAGE_CODES, getLanguageName } from "../../domains/localization/languages";

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
  const textNode = Array.from(element.childNodes).find((node) => node.nodeType === 3);
  if (textNode) textNode.textContent = `${getMessage(messageName)}${suffix}`;
};

export const applyLocalization = (
  root: Document,
  getMessage: (messageName: string) => string,
): void => {
  root.querySelectorAll<HTMLElement>("[data-i18n]").forEach((element) => {
    const messageName = element.dataset.i18n;
    if (messageName) element.textContent = getMessage(messageName);
  });
  root.querySelectorAll<HTMLElement>("[data-i18n-label]").forEach((element) => {
    const messageName = element.dataset.i18nLabel;
    if (messageName) element.setAttribute("aria-label", getMessage(messageName));
  });

  setFirstTextNodeContent(root, "translators-label", "translators_label", getMessage, " ");
  setFirstTextNodeContent(root, "donation-label", "support_me", getMessage, " ");
  setFirstTextNodeContent(
    root,
    "help-with-translation-label",
    "help_with_translation_label",
    getMessage,
  );
  setFirstTextNodeContent(root, "source-code-label", "source_code_label", getMessage);
  const whitelistEmpty = root.getElementById("whitelist-empty");
  if (whitelistEmpty) whitelistEmpty.textContent = getMessage("autostart_whitelist_empty");

  setElementTooltip(root, "settings-btn", "settings_button_tooltip", getMessage);
  setElementTooltip(root, "volume-mute", "volume_mute_button_tooltip", getMessage);
  setElementTooltip(root, "add-to-autostart-whitelist-btn", "add_to_autostart_tooltip", getMessage);
  setElementTooltip(root, "tab-capture", "tab_capture_button_tooltip", getMessage);
  setElementTooltip(root, "change-eq", "shortcut_toggle_eq_label", getMessage);
  setElementTooltip(root, "info-btn", "help_label", getMessage);
};

export const populateLanguageSelect = (root: Document, currentLanguage: string): void => {
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
