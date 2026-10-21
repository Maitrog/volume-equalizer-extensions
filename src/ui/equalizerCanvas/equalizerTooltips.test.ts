import { expect, test } from "vitest";
import { frequencyToX } from "../../domains/equalizer/equalizerMath";
import { createEqualizerState } from "./equalizerEditorState";
import { createEqualizerTooltips } from "./equalizerTooltips";

test("tooltip reads the stored frequency and retains Q formatting", () => {
  const state = createEqualizerState();
  const tooltips = createEqualizerTooltips({
    canvas: {} as HTMLCanvasElement,
    infoTooltip: null,
    state,
  });
  const point = { freq: 20001, x: Math.round(frequencyToX(20001, 490)), y: 100, q: 0.5 };
  const dimensions = { canvasWidth: 500, canvasHeight: 200 };
  expect(tooltips.getPointTooltipText(point, dimensions)).toBe("20001 Hz, 0.0 dB");
  state.setDragTarget({ type: "peaking", index: 0 }, "q");
  expect(tooltips.getPointTooltipText(point, dimensions)).toBe("Q 0.50");
});
