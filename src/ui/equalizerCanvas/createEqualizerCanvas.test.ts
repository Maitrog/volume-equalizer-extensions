import { afterEach, expect, test, vi } from "vitest";
import { frequencyToX } from "../../domains/equalizer/equalizerMath";
import { createEqualizerState } from "./equalizerEditorState";
import { createEqualizerCanvas } from "./createEqualizerCanvas";
import { drawEqualizer, resizeEqualizerCanvas } from "./draw/drawEqualizer";

vi.mock("./draw/drawEqualizer", () => ({
  drawEqualizer: vi.fn(),
  resizeEqualizerCanvas: vi.fn(),
}));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

test.each(["draw", "resize"] as const)(
  "%s projects frequency before painting without saving",
  (method) => {
    vi.stubGlobal("window", new EventTarget());
    const canvas = Object.assign(new EventTarget(), { clientWidth: 600, clientHeight: 300 });
    const state = createEqualizerState();
    state.setPoints([{ type: "peaking", freq: 20001, gain: 6, q: 2 }], {
      canvasWidth: 600,
      canvasHeight: 300,
    });
    const save = vi.fn();
    const painter = method === "draw" ? drawEqualizer : resizeEqualizerCanvas;
    let paintedX: number | undefined;
    vi.mocked(painter).mockImplementation(({ state }) => {
      paintedX = state.getPoints()[0].x;
    });
    const editor = createEqualizerCanvas({
      canvas: canvas as HTMLCanvasElement,
      ctx: {} as CanvasRenderingContext2D,
      audioContext: {} as BaseAudioContext,
      state,
      getColors: vi.fn(),
      saveCurrentFilters: save,
      flushCurrentFilters: vi.fn(),
      keyboardStatus: { textContent: "" } as HTMLElement,
    });
    canvas.clientWidth = 900;
    editor[method]();
    expect(paintedX).toBe(frequencyToX(20001, 890));
    expect(state.getPoints()[0].freq).toBe(20001);
    expect(save).not.toHaveBeenCalled();
    editor.cleanup();
  },
);
