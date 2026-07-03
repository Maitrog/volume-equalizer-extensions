import { getRequiredElement } from "./getRequiredElement";

export interface PopupElements {
  eqCanvas: HTMLCanvasElement;
  spectrumCanvas: HTMLCanvasElement;
  masterVolume: HTMLInputElement;
  resetButton: HTMLButtonElement;
  changeEqButton: HTMLButtonElement;
  settingsButton: HTMLImageElement;
  settingsModal: HTMLDivElement;
  closeSettingsButton: HTMLSpanElement;
  captureError: HTMLDivElement;
  capturedTabs: HTMLDivElement;
}

export const getPopupElements = (document: Document): PopupElements => ({
  eqCanvas: getRequiredElement(document, "eq-canvas", HTMLCanvasElement),
  spectrumCanvas: getRequiredElement(
    document,
    "spectrum-canvas",
    HTMLCanvasElement,
  ),
  masterVolume: getRequiredElement(document, "master-volume", HTMLInputElement),
  resetButton: getRequiredElement(document, "reset", HTMLButtonElement),
  changeEqButton: getRequiredElement(
    document,
    "change-eq",
    HTMLButtonElement,
  ),
  settingsButton: getRequiredElement(document, "settings-btn", HTMLImageElement),
  settingsModal: getRequiredElement(document, "settings-modal", HTMLDivElement),
  closeSettingsButton: getRequiredElement(
    document,
    "close-settings",
    HTMLSpanElement,
  ),
  captureError: getRequiredElement(document, "capture-error", HTMLDivElement),
  capturedTabs: getRequiredElement(document, "captured-tabs", HTMLDivElement),
});
