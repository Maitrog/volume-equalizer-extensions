import type { EqualizerState } from "../../domains/equalizer/equalizerState";
import type { ThemeColors } from "../../domains/theme/themeColors";

export interface EqualizerCanvasRenderOptions {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  audioContext: BaseAudioContext;
  state: EqualizerState;
  colors: ThemeColors;
}

export interface EqualizerCanvasPaintOptions {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  colors: ThemeColors;
}

export interface EqualizerFilterRenderOptions {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  audioContext: BaseAudioContext;
  freq: number;
  q?: number;
  colors: ThemeColors;
}
