import type { EqualizerCanvasRenderOptions } from "../types";
import { drawFilter } from "./drawFilters";
import { drawAxis } from "./drawFrequencyAxis";

export const drawEqualizer = (options: EqualizerCanvasRenderOptions): void => {
  const { canvas, ctx } = options;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawAxis(options);
  drawFilter(options);
};

export const resizeEqualizerCanvas = (
  options: EqualizerCanvasRenderOptions,
): void => {
  const { canvas } = options;

  canvas.width = canvas.clientWidth;
  canvas.height = canvas.clientHeight;
  drawEqualizer(options);
};
