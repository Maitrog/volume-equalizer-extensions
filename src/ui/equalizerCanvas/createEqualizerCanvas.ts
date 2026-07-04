import type { EqualizerCanvasDimensions } from "../../domains/equalizer/equalizerState";
import { createEqualizerTooltips } from "./equalizerTooltips";
import {
  attachEqualizerGestures,
  type EqualizerGestureCleanup,
} from "./equalizerGestures";
import type { EqualizerCanvasRenderOptions } from "./types";
import { drawEqualizer, resizeEqualizerCanvas } from "./draw/drawEqualizer";

export interface CreateEqualizerCanvasOptions extends EqualizerCanvasRenderOptions {
  infoTooltip?: HTMLElement | null;
  saveCurrentFilters: () => Promise<void> | void;
  refreshToolkitCaptureFilters: () => void;
}

export interface EqualizerCanvasController {
  draw: () => void;
  resize: () => void;
  getDimensions: () => EqualizerCanvasDimensions;
  cleanup: EqualizerGestureCleanup;
}

export const createEqualizerCanvas = (
  options: CreateEqualizerCanvasOptions,
): EqualizerCanvasController => {
  const getDimensions = (): EqualizerCanvasDimensions => {
    return {
      canvasWidth: options.canvas.width,
      canvasHeight: options.canvas.height,
    };
  };
  const draw = (): void => {
    drawEqualizer(options);
  };
  const resize = (): void => {
    resizeEqualizerCanvas(options);
  };
  const tooltips = createEqualizerTooltips({
    canvas: options.canvas,
    infoTooltip: options.infoTooltip ?? null,
    state: options.state,
  });
  const cleanup = attachEqualizerGestures({
    canvas: options.canvas,
    state: options.state,
    draw: resize,
    saveCurrentFilters: options.saveCurrentFilters,
    refreshToolkitCaptureFilters: options.refreshToolkitCaptureFilters,
    tooltips,
    getDimensions,
  });

  return {
    draw,
    resize,
    getDimensions,
    cleanup,
  };
};
