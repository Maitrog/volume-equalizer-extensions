import { getRequiredElement } from "./getRequiredElement";

export interface PopupElements {
  settingsButton: HTMLImageElement;
  volumeMuteButton: HTMLImageElement;
  addToAutostartWhitelistButton: HTMLImageElement;
  windowModeButton: HTMLImageElement;
  captureError: HTMLDivElement;
  capturedTabs: HTMLDivElement;
  infoButton: HTMLImageElement;
  equalizerCurveContainer: HTMLDivElement;
  eqCanvas: HTMLCanvasElement;
  spectrumCanvas: HTMLCanvasElement;
  infoTooltip: HTMLDivElement;
  masterVolumeLabel: HTMLLabelElement;
  masterVolume: HTMLInputElement;
  masterVolumeValue: HTMLOutputElement;
  resetButton: HTMLButtonElement;
  changeEqButton: HTMLImageElement;
  presets: HTMLDivElement;
  presetsToggle: HTMLDivElement;
  presetsMenu: HTMLDivElement;
  noneItem: HTMLDivElement;
  savePresetButton: HTMLButtonElement;
  presetControlsCard: HTMLElement;
  presetSaveModal: HTMLDivElement;
  presetSaveClose: HTMLSpanElement;
  presetSaveForm: HTMLFormElement;
  presetName: HTMLInputElement;
  presetSaveError: HTMLDivElement;
  presetSaveCancel: HTMLButtonElement;
  presetSaveConfirm: HTMLButtonElement;
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
  onboardingGuide: HTMLDivElement;
  volumeControlCard: HTMLElement;
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
  captureError: getRequiredElement(document, "capture-error", HTMLDivElement),
  capturedTabs: getRequiredElement(document, "captured-tabs", HTMLDivElement),
  infoButton: getRequiredElement(document, "info-btn", HTMLImageElement),
  equalizerCurveContainer: getRequiredElement(
    document,
    "equalizer-curve-container",
    HTMLDivElement,
  ),
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
  masterVolumeValue: getRequiredElement(
    document,
    "master-volume-value",
    HTMLOutputElement,
  ),
  resetButton: getRequiredElement(document, "reset", HTMLButtonElement),
  changeEqButton: getRequiredElement(
    document,
    "change-eq",
    HTMLImageElement,
  ),
  presets: getRequiredElement(document, "presets", HTMLDivElement),
  presetsToggle: getRequiredElement(document, "presets-toggle", HTMLDivElement),
  presetsMenu: getRequiredElement(document, "presets-menu", HTMLDivElement),
  noneItem: getRequiredElement(document, "none-item", HTMLDivElement),
  savePresetButton: getRequiredElement(document, "save-preset", HTMLButtonElement),
  presetControlsCard: getRequiredElement(
    document,
    "preset-controls-card",
    HTMLElement,
  ),
  presetSaveModal: getRequiredElement(document, "preset-save-modal", HTMLDivElement),
  presetSaveClose: getRequiredElement(document, "preset-save-close", HTMLSpanElement),
  presetSaveForm: getRequiredElement(document, "preset-save-form", HTMLFormElement),
  presetName: getRequiredElement(document, "preset-name", HTMLInputElement),
  presetSaveError: getRequiredElement(document, "preset-save-error", HTMLDivElement),
  presetSaveCancel: getRequiredElement(document, "preset-save-cancel", HTMLButtonElement),
  presetSaveConfirm: getRequiredElement(document, "preset-save-confirm", HTMLButtonElement),
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
  onboardingGuide: getRequiredElement(
    document,
    "onboarding-guide",
    HTMLDivElement,
  ),
  volumeControlCard: getRequiredElement(
    document,
    "volume-control-card",
    HTMLElement
  )
});
