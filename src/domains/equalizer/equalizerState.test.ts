import { describe, expect, test, vi } from "vitest";

import { frequencyToX } from "./equalizerMath";
import { createEqualizerState } from "./equalizerState";

const dimensions = {
  canvasWidth: 500,
  canvasHeight: 200,
};

describe("createEqualizerState", () => {
  test("initializes legacy peaking and crossover points", () => {
    const state = createEqualizerState();

    state.initPoints(3, dimensions);

    const points = state.getPoints();
    expect(points).toHaveLength(5);
    points.forEach((point, index) => {
      expect(point.x).toBeCloseTo((500 / 6) * (index + 1), 10);
      expect(point.y).toBe(100);
      expect(point.q).toBe(0.5);
    });
    expect(state.getHighpassPoint()).toEqual({
      x: frequencyToX(20, 490),
      y: 100,
      q: 0.5,
    });
    expect(state.getLowpassPoint()).toEqual({
      x: frequencyToX(20000, 490),
      y: 100,
      q: 0.5,
    });
  });

  test("sets points from persisted filters and reports clamped point count", () => {
    const state = createEqualizerState();
    const onPointCountChange = vi.fn();

    state.setPoints(
      [
        { type: "highpass", freq: 40, gain: 0, q: 0.05 },
        { type: "peaking", freq: 1000, gain: 12.5, q: 2 },
        { type: "peaking", x: 123, y: 45, q: 20 },
        { type: "lowpass", x: 456, q: "bad" },
      ],
      dimensions,
      { onPointCountChange },
    );

    expect(onPointCountChange).toHaveBeenCalledWith(5);
    expect(state.getHighpassPoint()).toEqual({
      x: frequencyToX(40, 490),
      y: 100,
      q: 0.1,
    });
    expect(state.getPoints()).toEqual([
      { x: frequencyToX(1000, 490), y: 60, q: 2 },
      { x: 123, y: 45, q: 10 },
    ]);
    expect(state.getLowpassPoint()).toEqual({ x: 456, y: 100, q: 0.5 });
  });

  test("serializes points back to filters in legacy order", () => {
    const state = createEqualizerState();

    state.setPoints(
      [
        { type: "highpass", freq: 20, gain: 0, q: 0.5 },
        { type: "peaking", freq: 1000, gain: 0, q: 1 },
        { type: "lowpass", freq: 20000, gain: 0, q: 0.5 },
      ],
      dimensions,
    );

    const filters = state.getFilters(dimensions);
    expect(filters).toHaveLength(3);
    expect(filters[0]).toEqual({
      type: "highpass",
      freq: expect.closeTo(20, 10),
      gain: 0,
      q: 0.5,
      x: frequencyToX(20, 490),
      y: 100,
    });
    expect(filters[1]).toEqual({
      type: "peaking",
      freq: expect.closeTo(1000, 10),
      gain: 0,
      q: 1,
      x: frequencyToX(1000, 490),
      y: 100,
    });
    expect(filters[2]).toEqual({
      type: "lowpass",
      freq: expect.closeTo(20000, 10),
      gain: 0,
      q: 0.5,
      x: frequencyToX(20000, 490),
      y: 100,
    });
  });

  test("tracks drag target, drag mode, and reset behavior", () => {
    const state = createEqualizerState();

    state.initPoints(5, dimensions);
    const target = state.getPointIndexAtPosition(500 / 6, 100);

    expect(target).toEqual({ type: "peaking", index: 0 });

    state.setDragTarget(target, "q");
    expect(state.getDragMode()).toBe("q");
    expect(state.getDraggedPoint()).toEqual({ x: 500 / 6, y: 100, q: 0.5 });

    state.setDraggedPoint({ x: 111, y: 44, q: 3 });
    expect(state.getDraggedPoint()).toEqual({ x: 111, y: 44, q: 3 });

    state.resetPoint(target, dimensions);
    expect(state.getDraggedPoint()).toEqual({ x: 500 / 6, y: 100, q: 0.5 });

    state.clearDrag();
    expect(state.getDragMode()).toBeNull();
    expect(state.getDraggedPoint()).toBeNull();
  });

  test("detects crossover filters only when both crossover types exist", () => {
    const state = createEqualizerState();

    expect(
      state.hasCrossoverFilters([
        { type: "highpass", freq: 20, gain: 0, q: 0.5 },
        { type: "peaking", freq: 100, gain: 0, q: 0.5 },
      ]),
    ).toBe(false);
    expect(
      state.hasCrossoverFilters([
        { type: "highpass", freq: 20, gain: 0, q: 0.5 },
        { type: "lowpass", freq: 20000, gain: 0, q: 0.5 },
      ]),
    ).toBe(true);
  });
});
