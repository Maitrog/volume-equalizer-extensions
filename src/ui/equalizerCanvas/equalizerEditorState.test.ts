import { describe, expect, test, vi } from "vitest";

import { frequencyToX, xToFrequency } from "../../domains/equalizer/equalizerMath";
import { readPersistedFilters } from "../../domains/equalizer/persistedFilters";
import { createEqualizerState } from "./equalizerEditorState";

const dimensions = {
  canvasWidth: 500,
  canvasHeight: 200,
};

describe("createEqualizerState", () => {
  test.each(
    [20001, 1000.4, 0.5].flatMap((freq) =>
      (["highpass", "peaking", "lowpass"] as const).map((type) => ({ freq, type })),
    ),
  )("retains exact $type frequency $freq through loading and Q/gain edits", ({ freq, type }) => {
    const state = createEqualizerState();
    state.setPoints([{ type, freq, gain: 6, q: 0.5 }], dimensions);
    const target = type === "peaking" ? { type, index: 0 } : { type };
    state.setDragTarget(target, "q");
    const point = state.getDraggedPoint()!;
    expect(point).toMatchObject({ freq });
    expect(state.getFilters(dimensions).find((filter) => filter.type === type)?.freq).toBe(freq);
    state.setDraggedPoint({ ...point, q: 2, y: 80 });
    point.q = 9;
    point.freq = 999;
    expect(state.getDraggedPoint()).toMatchObject({ freq, q: 2 });
    expect(state.getFilters(dimensions).find((filter) => filter.type === type)?.freq).toBe(freq);
  });

  test("projects persisted audio values for the current canvas size", () => {
    const loaded = readPersistedFilters([
      { type: "peaking", freq: 1000, gain: 6, q: 0.5, x: 10, y: 20 },
    ]);
    expect(loaded).not.toBeNull();

    const smallState = createEqualizerState();
    smallState.setPoints(loaded ?? [], dimensions);
    const wideDimensions = { canvasWidth: 1000, canvasHeight: 400 };
    const wideState = createEqualizerState();
    wideState.setPoints(loaded ?? [], wideDimensions);

    expect(wideState.getPoints()[0]).not.toEqual(smallState.getPoints()[0]);
    expect(smallState.getFilters(dimensions).find((filter) => filter.type === "peaking")).toEqual({
      type: "peaking",
      freq: expect.closeTo(1000, 10),
      gain: expect.closeTo(6, 10),
      q: 0.5,
    });
    expect(
      wideState.getFilters(wideDimensions).find((filter) => filter.type === "peaking"),
    ).toEqual({
      type: "peaking",
      freq: expect.closeTo(1000, 10),
      gain: expect.closeTo(6, 10),
      q: 0.5,
    });
  });

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
      freq: 20,
      x: frequencyToX(20, 490),
      y: 100,
      q: 0.5,
    });
    expect(state.getLowpassPoint()).toEqual({
      freq: 20000,
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
        { type: "peaking", freq: 2000, gain: -12.5, q: 10 },
        { type: "lowpass", freq: 18000, gain: 0, q: 0.5 },
      ],
      dimensions,
      { onPointCountChange },
    );

    expect(onPointCountChange).toHaveBeenCalledWith(5);
    expect(state.getHighpassPoint()).toEqual({
      freq: 40,
      x: frequencyToX(40, 490),
      y: 100,
      q: 0.1,
    });
    expect(state.getPoints()).toEqual([
      { freq: 1000, x: frequencyToX(1000, 490), y: 60, q: 2 },
      { freq: 2000, x: frequencyToX(2000, 490), y: 140, q: 10 },
    ]);
    expect(state.getLowpassPoint()).toEqual({
      freq: 18000,
      x: frequencyToX(18000, 490),
      y: 100,
      q: 0.5,
    });
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
      enabled: false,
      freq: expect.closeTo(20, 10),
      gain: 0,
      q: 0.5,
    });
    expect(filters[1]).toEqual({
      type: "peaking",
      freq: expect.closeTo(1000, 10),
      gain: 0,
      q: 1,
    });
    expect(filters[2]).toEqual({
      type: "lowpass",
      enabled: false,
      freq: expect.closeTo(20000, 10),
      gain: 0,
      q: 0.5,
    });
  });

  test("enables a crossover after a position drag and disables it on reset", () => {
    const state = createEqualizerState();

    state.initPoints(5, dimensions);
    state.setDragTarget({ type: "highpass" }, "q");
    state.setDraggedPoint({
      ...(state.getDraggedPoint() as NonNullable<ReturnType<typeof state.getDraggedPoint>>),
      q: 2,
    });
    expect(state.getFilters(dimensions)[0].enabled).toBe(false);

    state.setDragTarget({ type: "highpass" }, "point");
    state.setDraggedPoint({
      ...(state.getDraggedPoint() as NonNullable<ReturnType<typeof state.getDraggedPoint>>),
      freq: xToFrequency(100, 490),
      x: 100,
    });
    expect(state.getFilters(dimensions)[0].enabled).toBe(true);

    state.resetPoint({ type: "highpass" }, dimensions);
    expect(state.getFilters(dimensions)[0].enabled).toBe(false);
    expect(state.getFilters(dimensions)[0].freq).toBe(20);
  });

  test("tracks drag target, drag mode, and reset behavior", () => {
    const state = createEqualizerState();

    state.initPoints(5, dimensions);
    const target = state.getPointIndexAtPosition(500 / 6, 100);

    expect(target).toEqual({ type: "peaking", index: 0 });

    state.setDragTarget(target, "q");
    expect(state.getDragMode()).toBe("q");
    expect(state.getDraggedPoint()).toEqual({
      freq: xToFrequency(500 / 6, 490),
      x: 500 / 6,
      y: 100,
      q: 0.5,
    });

    state.setDraggedPoint({ freq: 1234.5, x: frequencyToX(1234.5, 490), y: 44, q: 3 });
    expect(state.getDraggedPoint()).toEqual({
      freq: 1234.5,
      x: frequencyToX(1234.5, 490),
      y: 44,
      q: 3,
    });

    state.resetPoint(target, dimensions);
    expect(state.getDraggedPoint()).toEqual({
      freq: xToFrequency(500 / 6, 490),
      x: 500 / 6,
      y: 100,
      q: 0.5,
    });

    state.clearDrag();
    expect(state.getDragMode()).toBeNull();
    expect(state.getDraggedPoint()).toBeNull();
  });

  test.each(["highpass", "peaking", "lowpass"] as const)(
    "reset restores the default %s frequency and crossover flag",
    (type) => {
      const state = createEqualizerState();
      state.initPoints(5, dimensions);
      const target = type === "peaking" ? { type, index: 0 } : { type };
      state.setDragTarget(target, "point");
      const initial = state.getDraggedPoint()!;
      state.setDraggedPoint({
        ...initial,
        freq: 1234.5,
        x: frequencyToX(1234.5, 490),
        q: 2,
        y: 80,
      });
      state.resetPoint(target, dimensions);
      expect(state.getDraggedPoint()).toEqual(initial);
      const filter = state.getFilters(dimensions).find((filter) => filter.type === type)!;
      expect(filter.freq).toBe(initial.freq);
      if (type !== "peaking") expect(filter.enabled).toBe(false);
    },
  );

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

test.each(["highpass", "peaking", "lowpass"] as const)(
  "resize reprojects %s without changing audio or drag state",
  (type) => {
    const state = createEqualizerState();
    const small = { canvasWidth: 600, canvasHeight: 300 };
    const wide = { canvasWidth: 900, canvasHeight: 300 };
    state.setPoints([{ type, freq: 20001, gain: 6, q: 2, enabled: false }], small);
    state.setDragTarget(type === "peaking" ? { type, index: 0 } : { type }, "q");
    const before = state.getDraggedPoint()!;
    const filters = state.getFilters(small);
    state.syncFrequencyPositions(wide);
    expect(state.getDraggedPoint()).toEqual({ ...before, x: frequencyToX(20001, 890) });
    expect(state.getDragMode()).toBe("q");
    expect(state.getFilters(wide)).toEqual(filters);
    state.setDraggedPoint({ ...state.getDraggedPoint()!, x: 123 });
    state.syncFrequencyPositions(wide);
    expect(state.getDraggedPoint()?.x).toBe(123);
  },
);

test("same-width synchronization preserves initialization and reset positions", () => {
  const state = createEqualizerState();
  state.syncFrequencyPositions(dimensions);
  state.initPoints(5, dimensions);
  const initial = state.getPoints();
  state.syncFrequencyPositions(dimensions);
  expect(state.getPoints()).toEqual(initial);
  state.resetPoint({ type: "peaking", index: 0 }, dimensions);
  state.syncFrequencyPositions(dimensions);
  expect(state.getPoints()).toEqual(initial);
});
