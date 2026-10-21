import type { EqualizerFilter } from "../../domains/equalizer/types";

import {
  clampPointCount,
  DEFAULT_FILTER_Q,
  ensureQFactor,
  frequencyToX,
  xToFrequency,
  yToDb,
} from "../../domains/equalizer/equalizerMath";
import { isEqualizerFilterEnabled } from "../../domains/equalizer/defaultFilters";

export interface EqualizerCanvasDimensions {
  canvasWidth: number;
  canvasHeight: number;
}

export interface EqualizerCanvasPoint {
  x: number;
  freq: number;
  y: number;
  q: number;
}

export type EqualizerDragMode = "point" | "q";

export type EqualizerDragTarget =
  { type: "peaking"; index: number } | { type: "highpass" } | { type: "lowpass" };

export interface SetEqualizerPointsOptions {
  onPointCountChange?: (pointCount: number) => void;
}

export interface EqualizerState {
  getPoints: () => EqualizerCanvasPoint[];
  getHighpassPoint: () => EqualizerCanvasPoint | null;
  getLowpassPoint: () => EqualizerCanvasPoint | null;
  initPoints: (count: number, dimensions: EqualizerCanvasDimensions) => void;
  setPoints: (
    filters: EqualizerFilter[],
    dimensions: EqualizerCanvasDimensions,
    options?: SetEqualizerPointsOptions,
  ) => void;
  syncFrequencyPositions: (dimensions: EqualizerCanvasDimensions) => void;
  getFilters: (dimensions: EqualizerCanvasDimensions) => EqualizerFilter[];
  hasCrossoverFilters: (filters: EqualizerFilter[]) => boolean;
  getPointIndexAtPosition: (x: number, y: number) => EqualizerDragTarget | null;
  getDraggedPoint: () => EqualizerCanvasPoint | null;
  setDraggedPoint: (point: EqualizerCanvasPoint) => void;
  setDragTarget: (target: EqualizerDragTarget | null, mode: EqualizerDragMode | null) => void;
  clearDrag: () => void;
  getDragMode: () => EqualizerDragMode | null;
  resetPoint: (target: EqualizerDragTarget | null, dimensions: EqualizerCanvasDimensions) => void;
}

export const POINT_RADIUS = 3;

const DEFAULT_HIGHPASS_FREQ = 20;
const DEFAULT_LOWPASS_FREQ = 20000;

const clonePoint = (point: EqualizerCanvasPoint): EqualizerCanvasPoint => {
  return { ...point };
};

const getFrequencyCanvasWidth = (dimensions: EqualizerCanvasDimensions): number => {
  return dimensions.canvasWidth - 10;
};

const createPeakingFilterPoint = (
  index: number,
  count: number,
  dimensions: EqualizerCanvasDimensions,
): EqualizerCanvasPoint => {
  const centerY = dimensions.canvasHeight / 2;
  const pointStep = dimensions.canvasWidth / (count + 1);

  const x = pointStep * (index + 1);

  return {
    x,
    freq: xToFrequency(x, getFrequencyCanvasWidth(dimensions)),
    y: centerY,
    q: DEFAULT_FILTER_Q,
  };
};

const createCrossoverPoint = (
  freq: number,
  dimensions: EqualizerCanvasDimensions,
  filter?: EqualizerFilter,
): EqualizerCanvasPoint => {
  return {
    x: frequencyToX(filter?.freq ?? freq, getFrequencyCanvasWidth(dimensions)),
    freq: filter?.freq ?? freq,
    y: dimensions.canvasHeight / 2,
    q: ensureQFactor(filter?.q),
  };
};

const createDefaultHighpassPoint = (
  dimensions: EqualizerCanvasDimensions,
  filter?: EqualizerFilter,
): EqualizerCanvasPoint => {
  return createCrossoverPoint(DEFAULT_HIGHPASS_FREQ, dimensions, filter);
};

const createDefaultLowpassPoint = (
  dimensions: EqualizerCanvasDimensions,
  filter?: EqualizerFilter,
): EqualizerCanvasPoint => {
  return createCrossoverPoint(DEFAULT_LOWPASS_FREQ, dimensions, filter);
};

const createPeakingFilterPoints = (
  count: number,
  dimensions: EqualizerCanvasDimensions,
): EqualizerCanvasPoint[] => {
  return Array.from({ length: count }, (_, index) => {
    return createPeakingFilterPoint(index, count, dimensions);
  });
};

const pointMatchesPosition = (point: EqualizerCanvasPoint, x: number, y: number): boolean => {
  return Math.hypot(point.x - x, point.y - y) < POINT_RADIUS + 2;
};

export const createEqualizerState = (): EqualizerState => {
  let points: EqualizerCanvasPoint[] = [];
  let highpassPoint: EqualizerCanvasPoint | null = null;
  let lowpassPoint: EqualizerCanvasPoint | null = null;
  let highpassEnabled = false;
  let lowpassEnabled = false;
  let dragTarget: EqualizerDragTarget | null = null;
  let dragMode: EqualizerDragMode | null = null;
  let canvasWidth: number | null = null;

  const getDraggedPoint = (): EqualizerCanvasPoint | null => {
    if (!dragTarget) {
      return null;
    }

    if (dragTarget.type === "highpass") {
      return highpassPoint ? clonePoint(highpassPoint) : null;
    }

    if (dragTarget.type === "lowpass") {
      return lowpassPoint ? clonePoint(lowpassPoint) : null;
    }

    const point = points[dragTarget.index];

    return point ? clonePoint(point) : null;
  };

  return {
    getPoints: () => {
      return points.map(clonePoint);
    },

    getHighpassPoint: () => {
      return highpassPoint ? clonePoint(highpassPoint) : null;
    },

    getLowpassPoint: () => {
      return lowpassPoint ? clonePoint(lowpassPoint) : null;
    },

    initPoints: (count, dimensions) => {
      canvasWidth = dimensions.canvasWidth;
      const pointCount = clampPointCount(count);
      points = createPeakingFilterPoints(pointCount, dimensions);
      highpassPoint = createDefaultHighpassPoint(dimensions);
      lowpassPoint = createDefaultLowpassPoint(dimensions);
      highpassEnabled = false;
      lowpassEnabled = false;
    },

    setPoints: (filters, dimensions, options = {}) => {
      canvasWidth = dimensions.canvasWidth;
      const peakingFilters = filters.filter((filter) => {
        return (filter.type ?? "peaking") === "peaking";
      });
      const highpassFilter = filters.find((filter) => filter.type === "highpass");
      const lowpassFilter = filters.find((filter) => filter.type === "lowpass");

      const pointCount = clampPointCount(peakingFilters.length);
      options.onPointCountChange?.(pointCount);
      highpassPoint = createDefaultHighpassPoint(dimensions, highpassFilter);
      lowpassPoint = createDefaultLowpassPoint(dimensions, lowpassFilter);
      highpassEnabled = highpassFilter ? isEqualizerFilterEnabled(highpassFilter) : false;
      lowpassEnabled = lowpassFilter ? isEqualizerFilterEnabled(lowpassFilter) : false;
      points = peakingFilters.map((filter) => {
        return {
          x: frequencyToX(filter.freq, getFrequencyCanvasWidth(dimensions)),
          freq: filter.freq,
          y: dimensions.canvasHeight / 2 - (filter.gain / 25) * (dimensions.canvasHeight / 2 - 20),
          q: ensureQFactor(filter.q),
        };
      });
    },

    syncFrequencyPositions: (dimensions) => {
      if (canvasWidth === dimensions.canvasWidth) return;
      canvasWidth = dimensions.canvasWidth;
      for (const point of [...points, highpassPoint, lowpassPoint]) {
        if (point) point.x = frequencyToX(point.freq, getFrequencyCanvasWidth(dimensions));
      }
    },

    getFilters: (dimensions) => {
      const filters: EqualizerFilter[] = [];

      if (highpassPoint) {
        filters.push({
          type: "highpass",
          enabled: highpassEnabled,
          freq: highpassPoint.freq,
          gain: 0,
          q: ensureQFactor(highpassPoint.q),
        });
      }

      points.forEach((point) => {
        filters.push({
          type: "peaking",
          freq: point.freq,
          gain: yToDb(point.y, dimensions.canvasHeight),
          q: ensureQFactor(point.q),
        });
      });

      if (lowpassPoint) {
        filters.push({
          type: "lowpass",
          enabled: lowpassEnabled,
          freq: lowpassPoint.freq,
          gain: 0,
          q: ensureQFactor(lowpassPoint.q),
        });
      }

      return filters;
    },

    hasCrossoverFilters: (filters) => {
      return (
        filters.some((filter) => filter.type === "highpass") &&
        filters.some((filter) => filter.type === "lowpass")
      );
    },

    getPointIndexAtPosition: (x, y) => {
      const peakingIndex = points.findIndex((point) => {
        return pointMatchesPosition(point, x, y);
      });

      if (peakingIndex !== -1) {
        return {
          type: "peaking",
          index: peakingIndex,
        };
      }

      if (highpassPoint && pointMatchesPosition(highpassPoint, x, y)) {
        return { type: "highpass" };
      }

      if (lowpassPoint && pointMatchesPosition(lowpassPoint, x, y)) {
        return { type: "lowpass" };
      }

      return null;
    },

    getDraggedPoint,

    setDraggedPoint: (point) => {
      if (!dragTarget) {
        return;
      }

      if (dragTarget.type === "highpass") {
        highpassPoint = clonePoint(point);
        if (dragMode === "point") highpassEnabled = true;
        return;
      }

      if (dragTarget.type === "lowpass") {
        lowpassPoint = clonePoint(point);
        if (dragMode === "point") lowpassEnabled = true;
        return;
      }

      points[dragTarget.index] = clonePoint(point);
    },

    setDragTarget: (target, mode) => {
      dragTarget = target;
      dragMode = target ? mode : null;
    },

    clearDrag: () => {
      dragTarget = null;
      dragMode = null;
    },

    getDragMode: () => {
      return dragMode;
    },

    resetPoint: (target, dimensions) => {
      if (!target) {
        return;
      }

      if (target.type === "highpass") {
        highpassPoint = createDefaultHighpassPoint(dimensions);
        highpassEnabled = false;
        return;
      }

      if (target.type === "lowpass") {
        lowpassPoint = createDefaultLowpassPoint(dimensions);
        lowpassEnabled = false;
        return;
      }

      points[target.index] = createPeakingFilterPoint(target.index, points.length, dimensions);
    },
  };
};
