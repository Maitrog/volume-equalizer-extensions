import type { EqualizerFilter, EqualizerFilterType } from "./types";

import {
  clampPointCount,
  DEFAULT_FILTER_Q,
  ensureQFactor,
  frequencyToX,
  xToFrequency,
  yToDb,
} from "./equalizerMath";

export interface EqualizerCanvasDimensions {
  canvasWidth: number;
  canvasHeight: number;
}

export interface EqualizerCanvasPoint {
  x: number;
  y: number;
  q: number;
}

export type EqualizerDragMode = "point" | "q";

export type EqualizerDragTarget =
  | { type: "peaking"; index: number }
  | { type: "highpass" }
  | { type: "lowpass" };

export type EqualizerPersistedFilter = Partial<
  Omit<EqualizerFilter, "type" | "freq" | "gain" | "q">
> & {
  type?: EqualizerFilterType;
  freq?: unknown;
  gain?: unknown;
  q?: unknown;
  x?: unknown;
  y?: unknown;
};

export type EqualizerCanvasFilter = EqualizerFilter & {
  x: number;
  y: number;
};

export interface SetEqualizerPointsOptions {
  onPointCountChange?: (pointCount: number) => void;
}

export interface EqualizerState {
  getPoints: () => EqualizerCanvasPoint[];
  getHighpassPoint: () => EqualizerCanvasPoint | null;
  getLowpassPoint: () => EqualizerCanvasPoint | null;
  initPoints: (count: number, dimensions: EqualizerCanvasDimensions) => void;
  setPoints: (
    filters: EqualizerPersistedFilter[],
    dimensions: EqualizerCanvasDimensions,
    options?: SetEqualizerPointsOptions,
  ) => void;
  getFilters: (dimensions: EqualizerCanvasDimensions) => EqualizerCanvasFilter[];
  hasCrossoverFilters: (filters: EqualizerPersistedFilter[]) => boolean;
  getPointIndexAtPosition: (x: number, y: number) => EqualizerDragTarget | null;
  getDraggedPoint: () => EqualizerCanvasPoint | null;
  setDraggedPoint: (point: EqualizerCanvasPoint) => void;
  setDragTarget: (
    target: EqualizerDragTarget | null,
    mode: EqualizerDragMode | null,
  ) => void;
  clearDrag: () => void;
  getDragMode: () => EqualizerDragMode | null;
  resetPoint: (
    target: EqualizerDragTarget | null,
    dimensions: EqualizerCanvasDimensions,
  ) => void;
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

const finiteNumberOrNull = (value: unknown): number | null => {
  const numberValue = Number(value);

  return Number.isFinite(numberValue) ? numberValue : null;
};

const createPeakingFilterPoint = (
  index: number,
  count: number,
  dimensions: EqualizerCanvasDimensions,
): EqualizerCanvasPoint => {
  const centerY = dimensions.canvasHeight / 2;
  const pointStep = dimensions.canvasWidth / (count + 1);

  return {
    x: pointStep * (index + 1),
    y: centerY,
    q: DEFAULT_FILTER_Q,
  };
};

const createCrossoverPoint = (
  freq: number,
  dimensions: EqualizerCanvasDimensions,
  filter: EqualizerPersistedFilter = {},
): EqualizerCanvasPoint => {
  const x = finiteNumberOrNull(filter.x);
  const filterFreq = finiteNumberOrNull(filter.freq ?? freq);

  return {
    x: x ?? frequencyToX(filterFreq ?? freq, getFrequencyCanvasWidth(dimensions)),
    y: dimensions.canvasHeight / 2,
    q: ensureQFactor(filter.q),
  };
};

const createDefaultHighpassPoint = (
  dimensions: EqualizerCanvasDimensions,
  filter: EqualizerPersistedFilter = {},
): EqualizerCanvasPoint => {
  return createCrossoverPoint(DEFAULT_HIGHPASS_FREQ, dimensions, filter);
};

const createDefaultLowpassPoint = (
  dimensions: EqualizerCanvasDimensions,
  filter: EqualizerPersistedFilter = {},
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

const pointMatchesPosition = (
  point: EqualizerCanvasPoint,
  x: number,
  y: number,
): boolean => {
  return Math.hypot(point.x - x, point.y - y) < POINT_RADIUS + 2;
};

export const createEqualizerState = (): EqualizerState => {
  let points: EqualizerCanvasPoint[] = [];
  let highpassPoint: EqualizerCanvasPoint | null = null;
  let lowpassPoint: EqualizerCanvasPoint | null = null;
  let dragTarget: EqualizerDragTarget | null = null;
  let dragMode: EqualizerDragMode | null = null;

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
      const pointCount = clampPointCount(count);
      points = createPeakingFilterPoints(pointCount, dimensions);
      highpassPoint = createDefaultHighpassPoint(dimensions);
      lowpassPoint = createDefaultLowpassPoint(dimensions);
    },

    setPoints: (filters, dimensions, options = {}) => {
      const peakingFilters = filters.filter((filter) => {
        return (filter.type ?? "peaking") === "peaking";
      });
      const highpassFilter = filters.find((filter) => filter.type === "highpass");
      const lowpassFilter = filters.find((filter) => filter.type === "lowpass");

      const pointCount = clampPointCount(peakingFilters.length);
      options.onPointCountChange?.(pointCount);
      highpassPoint = createDefaultHighpassPoint(dimensions, highpassFilter);
      lowpassPoint = createDefaultLowpassPoint(dimensions, lowpassFilter);
      points = peakingFilters.map((filter, index) => {
        const centeredPoint = createPeakingFilterPoint(index, pointCount, dimensions);
        const freq = finiteNumberOrNull(filter.freq);
        const gain = finiteNumberOrNull(filter.gain);
        const x = finiteNumberOrNull(filter.x);
        const y = finiteNumberOrNull(filter.y);

        return {
          x: x ?? (freq == null ? centeredPoint.x : frequencyToX(freq, getFrequencyCanvasWidth(dimensions))),
          y: y ?? (gain == null
            ? centeredPoint.y
            : dimensions.canvasHeight / 2 -
              (gain / 25) * (dimensions.canvasHeight / 2 - 20)),
          q: ensureQFactor(filter.q),
        };
      });
    },

    getFilters: (dimensions) => {
      const filters: EqualizerCanvasFilter[] = [];
      const canvasWidth = getFrequencyCanvasWidth(dimensions);

      if (highpassPoint) {
        filters.push({
          type: "highpass",
          freq: xToFrequency(highpassPoint.x, canvasWidth),
          gain: 0,
          q: ensureQFactor(highpassPoint.q),
          x: highpassPoint.x,
          y: highpassPoint.y,
        });
      }

      points.forEach((point) => {
        filters.push({
          type: "peaking",
          freq: xToFrequency(point.x, canvasWidth),
          gain: yToDb(point.y, dimensions.canvasHeight),
          q: ensureQFactor(point.q),
          x: point.x,
          y: point.y,
        });
      });

      if (lowpassPoint) {
        filters.push({
          type: "lowpass",
          freq: xToFrequency(lowpassPoint.x, canvasWidth),
          gain: 0,
          q: ensureQFactor(lowpassPoint.q),
          x: lowpassPoint.x,
          y: lowpassPoint.y,
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
        return;
      }

      if (dragTarget.type === "lowpass") {
        lowpassPoint = clonePoint(point);
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
        return;
      }

      if (target.type === "lowpass") {
        lowpassPoint = createDefaultLowpassPoint(dimensions);
        return;
      }

      points[target.index] = createPeakingFilterPoint(
        target.index,
        points.length,
        dimensions,
      );
    },
  };
};
