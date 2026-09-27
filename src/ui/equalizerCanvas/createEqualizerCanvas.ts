import type { EqualizerCanvasDimensions, EqualizerDragTarget } from "./equalizerEditorState";
import { ensureQFactor } from "../../domains/equalizer/equalizerMath";
import { createEqualizerTooltips } from "./equalizerTooltips";
import { attachEqualizerGestures } from "./equalizerGestures";
import type { EqualizerCanvasRenderOptions } from "./types";
import { drawEqualizer, resizeEqualizerCanvas } from "./draw/drawEqualizer";

export interface CreateEqualizerCanvasOptions extends EqualizerCanvasRenderOptions {
  infoTooltip?: HTMLElement | null;
  saveCurrentFilters: () => Promise<void> | void;
  flushCurrentFilters: () => Promise<void> | void;
  keyboardStatus: HTMLElement;
}

export const createEqualizerCanvas = (options: CreateEqualizerCanvasOptions) => {
  let selectedTarget: EqualizerDragTarget | null = null;
  const getDimensions = (): EqualizerCanvasDimensions => {
    return {
      canvasWidth: options.canvas.clientWidth,
      canvasHeight: options.canvas.clientHeight,
    };
  };
  const draw = (): void => {
    drawEqualizer({ ...options, selectedTarget });
  };
  const resize = (): void => {
    resizeEqualizerCanvas({ ...options, selectedTarget });
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
    flushCurrentFilters: options.flushCurrentFilters,
    tooltips,
    getDimensions,
    onKeyboardSelection: (target, index) => {
      selectedTarget = target;
      if (!target) {
        options.keyboardStatus.textContent = "";
        return;
      }
      const point =
        target.type === "highpass"
          ? options.state.getHighpassPoint()
          : target.type === "lowpass"
            ? options.state.getLowpassPoint()
            : options.state.getPoints()[target.index];
      if (!point) return;
      const value = tooltips.getPointTooltipText(point, getDimensions());
      options.keyboardStatus.textContent = `${index + 1}. ${value}, Q ${ensureQFactor(point.q).toFixed(2)}`;
    },
  });

  return {
    draw,
    resize,
    getDimensions,
    cleanup,
  };
};
