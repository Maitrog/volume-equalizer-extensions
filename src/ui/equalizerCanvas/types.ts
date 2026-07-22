import type { EqualizerState } from "../../domains/equalizer/equalizerState";
import type { ThemeColors } from "../../domains/theme/themeColors";

export interface EqualizerCanvasRenderOptions {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  audioContext: BaseAudioContext;
  state: EqualizerState;
  getColors: () => ThemeColors;
}

export interface EqualizerCanvasPaintOptions {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  getColors: () => ThemeColors;
}
