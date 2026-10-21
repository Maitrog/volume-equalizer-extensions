import { expect, test, vi } from "vitest";
import { createEqualizerState } from "../equalizerEditorState";
import { drawBiquadFilter } from "./drawBiquadFilter";
import { drawFilter } from "./drawFilters";

vi.mock("./drawBiquadFilter", () => ({ drawBiquadFilter: vi.fn() }));

test("all filter curves read stored frequencies independently of X", () => {
  const state = createEqualizerState();
  const dimensions = { canvasWidth: 500, canvasHeight: 200 };
  state.setPoints(
    (["highpass", "peaking", "lowpass"] as const).map((type) => ({
      type,
      freq: 20001,
      gain: 0,
      q: 0.5,
    })),
    dimensions,
  );
  for (const type of ["highpass", "peaking", "lowpass"] as const) {
    state.setDragTarget(type === "peaking" ? { type, index: 0 } : { type }, "q");
    state.setDraggedPoint({ ...state.getDraggedPoint()!, x: 123 });
  }
  const ctx = {
    beginPath() {},
    arc() {},
    fill() {},
    stroke() {},
    createLinearGradient: () => ({ addColorStop() {} }),
  } as unknown as CanvasRenderingContext2D;
  drawFilter({
    canvas: { clientWidth: 500, clientHeight: 200 } as HTMLCanvasElement,
    ctx,
    state,
    audioContext: {} as BaseAudioContext,
    getColors: () => ({
      accentStart: "",
      accentMid: "",
      accentEnd: "",
      highpassFilterColor: "",
      lowpassFilterColor: "",
      panelBg: "",
      axis: "",
    }),
  });
  expect(drawBiquadFilter).toHaveBeenCalledTimes(3);
  for (const type of ["highpass", "peaking", "lowpass"]) {
    expect(drawBiquadFilter).toHaveBeenCalledWith(expect.objectContaining({ type, freq: 20001 }));
  }
});
