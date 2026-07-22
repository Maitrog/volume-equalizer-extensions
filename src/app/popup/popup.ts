import { createEqualizerState } from "../../domains/equalizer/equalizerState";
import { createLocalizationService } from "../../domains/localization/localizationService";
import { readThemeColors } from "../../domains/theme/themeColors";
import { getPopupElements } from "../../infrastructure/dom/popupElements";
import { createPopupApp } from "./createPopupApp";

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

window.addEventListener("load", () => {
  const elements = getPopupElements(document);
  const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextConstructor) {
    throw new Error("AudioContext is unavailable");
  }

  const app = createPopupApp({
    elements,
    audioContext: new AudioContextConstructor(),
    equalizerState: createEqualizerState(),
    localization: createLocalizationService(),
    readThemeColors,
  });

  window.addEventListener("resize", app.resize);
  void app.start();
});
