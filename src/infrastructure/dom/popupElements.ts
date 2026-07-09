import { getRequiredElement } from "./getRequiredElement";

export interface PopupElements {
  settingsButton: HTMLImageElement;
  volumeMuteButton: HTMLImageElement;
  addToAutostartWhitelistButton: HTMLImageElement;
  windowModeButton: HTMLImageElement;
  supportMe: HTMLSpanElement;
  captureError: HTMLDivElement;
  capturedTabs: HTMLDivElement;
  infoButton: HTMLImageElement;
  eqCanvas: HTMLCanvasElement;
  spectrumCanvas: HTMLCanvasElement;
  infoTooltip: HTMLDivElement;
  masterVolumeLabel: HTMLLabelElement;
  masterVolume: HTMLInputElement;
  resetButton: HTMLButtonElement;
  changeEqButton: HTMLButtonElement;
  presets: HTMLDivElement;
  presetsToggle: HTMLDivElement;
  presetsMenu: HTMLDivElement;
  noneItem: HTMLDivElement;
  presetName: HTMLInputElement;
  savePresetButton: HTMLButtonElement;
  settingsModal: HTMLDivElement;
  closeSettingsButton: HTMLSpanElement;
  settingsHeader: HTMLHeadingElement;
  enableSpectrumLabel: HTMLElement;
  enableSpectrum: HTMLInputElement;
  pointsCountLabel: HTMLSpanElement;
  pointsCount: HTMLSelectElement;
  themeLabel: HTMLSpanElement;
  themeSelect: HTMLSelectElement;
  themeDarkOption: HTMLOptionElement;
  themeLightOption: HTMLOptionElement;
  themeNyOption: HTMLOptionElement;
  languageLabel: HTMLSpanElement;
  languageSelect: HTMLSelectElement;
  shortcutsSettingsTitle: HTMLHeadingElement;
  shortcutMuteLabel: HTMLSpanElement;
  shortcutMute: HTMLInputElement;
  shortcutToggleEqLabel: HTMLSpanElement;
  shortcutToggleEq: HTMLInputElement;
  shortcutsSettingsError: HTMLDivElement;
  autostartSettingsTitle: HTMLHeadingElement;
  autostartSettingsList: HTMLDivElement;
  autostartSettingsType: HTMLSelectElement;
  autostartSettingsTypeDomain: HTMLOptionElement;
  autostartSettingsTypeUrl: HTMLOptionElement;
  autostartSettingsAddValue: HTMLInputElement;
  autostartSettingsAddPreset: HTMLSelectElement;
  autostartSettingsAddButton: HTMLButtonElement;
  autostartSettingsError: HTMLDivElement;
  presetsSettingsTitle: HTMLHeadingElement;
  hideDefaultPresetsLabel: HTMLElement;
  hideDefaultPresets: HTMLInputElement;
  importInput: HTMLInputElement;
  importPresetsButton: HTMLButtonElement;
  exportPresetsButton: HTMLButtonElement;
  communitySettingsTitle: HTMLHeadingElement;
  helpWithTranslationLabel: HTMLDivElement;
  sourceCodeLabel: HTMLDivElement;
  autostartModal: HTMLDivElement;
  autostartModalClose: HTMLSpanElement;
  autostartModalTitle: HTMLHeadingElement;
  autostartModalDomainLabel: HTMLSpanElement;
  autostartModalDomainValue: HTMLElement;
  autostartModalUrlLabel: HTMLSpanElement;
  autostartModalUrlValue: HTMLElement;
  autostartModalPresetLabel: HTMLSpanElement;
  autostartModalPreset: HTMLSelectElement;
  autostartModalError: HTMLDivElement;
  autostartModalCancel: HTMLButtonElement;
  autostartModalConfirm: HTMLButtonElement;
  pointsResetModal: HTMLDivElement;
  pointsResetTitle: HTMLHeadingElement;
  pointsResetMessage: HTMLParagraphElement;
  skipResetConfirm: HTMLInputElement;
  skipResetLabel: HTMLSpanElement;
  pointsResetCancel: HTMLButtonElement;
  pointsResetConfirm: HTMLButtonElement;
  installUpdateNoticeModal: HTMLDivElement;
  installUpdateNoticeClose: HTMLButtonElement;
  infoModal: HTMLDivElement;
  closeInfoModal: HTMLSpanElement;
  infoModalMessage: HTMLParagraphElement;
}

export const getPopupElements = (document: Document): PopupElements => ({
  settingsButton: getRequiredElement(document, "settings-btn", HTMLImageElement),
  volumeMuteButton: getRequiredElement(document, "volume-mute", HTMLImageElement),
  addToAutostartWhitelistButton: getRequiredElement(
    document,
    "add-to-autostart-whitelist-btn",
    HTMLImageElement,
  ),
  windowModeButton: getRequiredElement(document, "window-mod", HTMLImageElement),
  supportMe: getRequiredElement(document, "support-me", HTMLSpanElement),
  captureError: getRequiredElement(document, "capture-error", HTMLDivElement),
  capturedTabs: getRequiredElement(document, "captured-tabs", HTMLDivElement),
  infoButton: getRequiredElement(document, "info-btn", HTMLImageElement),
  eqCanvas: getRequiredElement(document, "eq-canvas", HTMLCanvasElement),
  spectrumCanvas: getRequiredElement(
    document,
    "spectrum-canvas",
    HTMLCanvasElement,
  ),
  infoTooltip: getRequiredElement(document, "info-tooltip", HTMLDivElement),
  masterVolumeLabel: getRequiredElement(
    document,
    "master-volume-label",
    HTMLLabelElement,
  ),
  masterVolume: getRequiredElement(document, "master-volume", HTMLInputElement),
  resetButton: getRequiredElement(document, "reset", HTMLButtonElement),
  changeEqButton: getRequiredElement(
    document,
    "change-eq",
    HTMLButtonElement,
  ),
  presets: getRequiredElement(document, "presets", HTMLDivElement),
  presetsToggle: getRequiredElement(document, "presets-toggle", HTMLDivElement),
  presetsMenu: getRequiredElement(document, "presets-menu", HTMLDivElement),
  noneItem: getRequiredElement(document, "none-item", HTMLDivElement),
  presetName: getRequiredElement(document, "preset-name", HTMLInputElement),
  savePresetButton: getRequiredElement(document, "save-preset", HTMLButtonElement),
  settingsModal: getRequiredElement(document, "settings-modal", HTMLDivElement),
  closeSettingsButton: getRequiredElement(
    document,
    "close-settings",
    HTMLSpanElement,
  ),
  settingsHeader: getRequiredElement(document, "settings-header", HTMLHeadingElement),
  enableSpectrumLabel: getRequiredElement(
    document,
    "enable-spectrum-label",
    HTMLElement,
  ),
  enableSpectrum: getRequiredElement(document, "enable-spectrum", HTMLInputElement),
  pointsCountLabel: getRequiredElement(document, "points-count-label", HTMLSpanElement),
  pointsCount: getRequiredElement(document, "points-count", HTMLSelectElement),
  themeLabel: getRequiredElement(document, "theme-label", HTMLSpanElement),
  themeSelect: getRequiredElement(document, "theme-select", HTMLSelectElement),
  themeDarkOption: getRequiredElement(document, "theme-dark-option", HTMLOptionElement),
  themeLightOption: getRequiredElement(document, "theme-light-option", HTMLOptionElement),
  themeNyOption: getRequiredElement(document, "theme-ny-option", HTMLOptionElement),
  languageLabel: getRequiredElement(document, "language-label", HTMLSpanElement),
  languageSelect: getRequiredElement(document, "language-select", HTMLSelectElement),
  shortcutsSettingsTitle: getRequiredElement(
    document,
    "shortcuts-settings-title",
    HTMLHeadingElement,
  ),
  shortcutMuteLabel: getRequiredElement(document, "shortcut-mute-label", HTMLSpanElement),
  shortcutMute: getRequiredElement(document, "shortcut-mute", HTMLInputElement),
  shortcutToggleEqLabel: getRequiredElement(
    document,
    "shortcut-toggle-eq-label",
    HTMLSpanElement,
  ),
  shortcutToggleEq: getRequiredElement(document, "shortcut-toggle-eq", HTMLInputElement),
  shortcutsSettingsError: getRequiredElement(
    document,
    "shortcuts-settings-error",
    HTMLDivElement,
  ),
  autostartSettingsTitle: getRequiredElement(
    document,
    "autostart-settings-title",
    HTMLHeadingElement,
  ),
  autostartSettingsList: getRequiredElement(
    document,
    "autostart-settings-list",
    HTMLDivElement,
  ),
  autostartSettingsType: getRequiredElement(
    document,
    "autostart-settings-type",
    HTMLSelectElement,
  ),
  autostartSettingsTypeDomain: getRequiredElement(
    document,
    "autostart-settings-type-domain",
    HTMLOptionElement,
  ),
  autostartSettingsTypeUrl: getRequiredElement(
    document,
    "autostart-settings-type-url",
    HTMLOptionElement,
  ),
  autostartSettingsAddValue: getRequiredElement(
    document,
    "autostart-settings-add-value",
    HTMLInputElement,
  ),
  autostartSettingsAddPreset: getRequiredElement(
    document,
    "autostart-settings-add-preset",
    HTMLSelectElement,
  ),
  autostartSettingsAddButton: getRequiredElement(
    document,
    "autostart-settings-add-btn",
    HTMLButtonElement,
  ),
  autostartSettingsError: getRequiredElement(
    document,
    "autostart-settings-error",
    HTMLDivElement,
  ),
  presetsSettingsTitle: getRequiredElement(
    document,
    "presets-settings-title",
    HTMLHeadingElement,
  ),
  hideDefaultPresetsLabel: getRequiredElement(
    document,
    "hide-default-presets-label",
    HTMLElement,
  ),
  hideDefaultPresets: getRequiredElement(
    document,
    "hide-default-presets",
    HTMLInputElement,
  ),
  importInput: getRequiredElement(document, "import-input", HTMLInputElement),
  importPresetsButton: getRequiredElement(
    document,
    "import-presets",
    HTMLButtonElement,
  ),
  exportPresetsButton: getRequiredElement(
    document,
    "export-presets",
    HTMLButtonElement,
  ),
  communitySettingsTitle: getRequiredElement(
    document,
    "community-settings-title",
    HTMLHeadingElement,
  ),
  helpWithTranslationLabel: getRequiredElement(
    document,
    "help-with-translation-label",
    HTMLDivElement,
  ),
  sourceCodeLabel: getRequiredElement(document, "source-code-label", HTMLDivElement),
  autostartModal: getRequiredElement(document, "autostart-modal", HTMLDivElement),
  autostartModalClose: getRequiredElement(
    document,
    "autostart-modal-close",
    HTMLSpanElement,
  ),
  autostartModalTitle: getRequiredElement(
    document,
    "autostart-modal-title",
    HTMLHeadingElement,
  ),
  autostartModalDomainLabel: getRequiredElement(
    document,
    "autostart-modal-domain-label",
    HTMLSpanElement,
  ),
  autostartModalDomainValue: getRequiredElement(
    document,
    "autostart-modal-domain-value",
    HTMLElement,
  ),
  autostartModalUrlLabel: getRequiredElement(
    document,
    "autostart-modal-url-label",
    HTMLSpanElement,
  ),
  autostartModalUrlValue: getRequiredElement(
    document,
    "autostart-modal-url-value",
    HTMLElement,
  ),
  autostartModalPresetLabel: getRequiredElement(
    document,
    "autostart-modal-preset-label",
    HTMLSpanElement,
  ),
  autostartModalPreset: getRequiredElement(
    document,
    "autostart-modal-preset",
    HTMLSelectElement,
  ),
  autostartModalError: getRequiredElement(
    document,
    "autostart-modal-error",
    HTMLDivElement,
  ),
  autostartModalCancel: getRequiredElement(
    document,
    "autostart-modal-cancel",
    HTMLButtonElement,
  ),
  autostartModalConfirm: getRequiredElement(
    document,
    "autostart-modal-confirm",
    HTMLButtonElement,
  ),
  pointsResetModal: getRequiredElement(document, "points-reset-modal", HTMLDivElement),
  pointsResetTitle: getRequiredElement(
    document,
    "points-reset-title",
    HTMLHeadingElement,
  ),
  pointsResetMessage: getRequiredElement(
    document,
    "points-reset-message",
    HTMLParagraphElement,
  ),
  skipResetConfirm: getRequiredElement(
    document,
    "skip-reset-confirm",
    HTMLInputElement,
  ),
  skipResetLabel: getRequiredElement(document, "skip-reset-label", HTMLSpanElement),
  pointsResetCancel: getRequiredElement(
    document,
    "points-reset-cancel",
    HTMLButtonElement,
  ),
  pointsResetConfirm: getRequiredElement(
    document,
    "points-reset-confirm",
    HTMLButtonElement,
  ),
  installUpdateNoticeModal: getRequiredElement(
    document,
    "install-update-notice-modal",
    HTMLDivElement,
  ),
  installUpdateNoticeClose: getRequiredElement(
    document,
    "install-update-notice-close",
    HTMLButtonElement,
  ),
  infoModal: getRequiredElement(document, "info-modal", HTMLDivElement),
  closeInfoModal: getRequiredElement(document, "close-info-modal", HTMLSpanElement),
  infoModalMessage: getRequiredElement(
    document,
    "info-modal-message",
    HTMLParagraphElement,
  ),
});
