import {
  ensureQFactor,
  xToFrequency,
  yToDb,
} from "../../domains/equalizer/equalizerMath";
import type {
  EqualizerCanvasDimensions,
  EqualizerCanvasPoint,
  EqualizerState,
} from "../../domains/equalizer/equalizerState";

export interface EqualizerTooltipOptions {
  canvas: HTMLCanvasElement;
  infoTooltip: HTMLElement | null;
  state: EqualizerState;
}

export interface EqualizerTooltipHelpers {
  getPointTooltipText: (
    point: EqualizerCanvasPoint,
    dimensions: EqualizerCanvasDimensions,
  ) => string;
  updateInfoTooltip: (
    point: EqualizerCanvasPoint | null,
    dimensions: EqualizerCanvasDimensions,
  ) => void;
  hideInfoTooltip: () => void;
}

const formatDb = (db: number): string => {
  const fixed = Math.abs(db).toFixed(1);

  if (db > 0) {
    return `+${fixed} dB`;
  }

  if (db < 0) {
    return `-${fixed} dB`;
  }

  return "0.0 dB";
};

export const createEqualizerTooltips = ({
  canvas,
  infoTooltip,
  state,
}: EqualizerTooltipOptions): EqualizerTooltipHelpers => {
  const getPointTooltipText = (
    point: EqualizerCanvasPoint,
    dimensions: EqualizerCanvasDimensions,
  ): string => {
    if (state.getDragMode() === "q") {
      return `Q ${ensureQFactor(point.q).toFixed(2)}`;
    }

    const freq = Math.round(xToFrequency(point.x, dimensions.canvasWidth - 10));
    const db = yToDb(point.y, dimensions.canvasHeight);

    return `${freq} Hz, ${formatDb(db)}`;
  };

  const updateInfoTooltip = (
    point: EqualizerCanvasPoint | null,
    dimensions: EqualizerCanvasDimensions,
  ): void => {
    if (!infoTooltip || !point) {
      return;
    }

    infoTooltip.textContent = getPointTooltipText(point, dimensions);
    infoTooltip.style.display = "block";

    const tooltipWidth = infoTooltip.offsetWidth;
    const tooltipHeight = infoTooltip.offsetHeight;
    const margin = 6;
    const offset = 12;
    const maxLeft = canvas.clientWidth - tooltipWidth - margin;
    const maxTop = canvas.clientHeight - tooltipHeight - margin;
    const left = Math.max(margin, Math.min(maxLeft, point.x + offset));
    const top = Math.max(
      margin,
      Math.min(maxTop, point.y - tooltipHeight - offset),
    );

    infoTooltip.style.transform = `translate(${left}px, ${top}px)`;
  };

  return {
    getPointTooltipText,
    updateInfoTooltip,
    hideInfoTooltip: () => {
      if (!infoTooltip) {
        return;
      }

      infoTooltip.style.display = "none";
    },
  };
};
