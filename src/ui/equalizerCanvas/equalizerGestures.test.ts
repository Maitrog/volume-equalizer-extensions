import { afterEach, expect, test, vi } from "vitest";
import { createEqualizerState } from "./equalizerEditorState";
import { attachEqualizerGestures } from "./equalizerGestures";

const dimensions = { canvasWidth: 600, canvasHeight: 300 };
const setup = () => {
  let frame: FrameRequestCallback | null = null;
  vi.stubGlobal(
    "window",
    Object.assign(new EventTarget(), {
      requestAnimationFrame: (callback: FrameRequestCallback) => {
        frame = callback;
        return 1;
      },
      cancelAnimationFrame: vi.fn(),
    }),
  );
  const canvas = Object.assign(new EventTarget(), {
    width: 600,
    height: 300,
    clientWidth: 600,
    clientHeight: 300,
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
  });
  const state = createEqualizerState();
  state.initPoints(5, dimensions);
  const save = vi.fn();
  const flush = vi.fn();
  const draw = vi.fn();
  const cleanup = attachEqualizerGestures({
    canvas: canvas as HTMLCanvasElement,
    state,
    draw,
    saveCurrentFilters: save,
    flushCurrentFilters: flush,
    tooltips: { updateInfoTooltip: vi.fn(), hideInfoTooltip: vi.fn() },
  });
  const key = (key: string, modifiers = {}) => {
    const event = Object.assign(new Event("keydown", { cancelable: true }), { key, ...modifiers });
    canvas.dispatchEvent(event);
    return event;
  };
  return {
    canvas,
    state,
    save,
    flush,
    draw,
    runFrame: () => {
      const callback = frame;
      frame = null;
      callback?.(0);
    },
    key,
    cleanup,
    filters: () => state.getFilters(dimensions),
  };
};
afterEach(() => vi.unstubAllGlobals());

test("Home/End/Page keys select bands, arrows edit gain/frequency, Shift arrows edit Q and Enter resets", () => {
  const { key, filters, save, cleanup } = setup();
  key("Home");
  const highpass = filters()[0];
  key("ArrowRight");
  expect(filters()[0].freq).toBeCloseTo(highpass.freq * 2 ** (1 / 12));
  key("ArrowUp");
  expect(filters()[0].gain).toBe(0);
  key("PageDown");
  key("ArrowUp");
  expect(filters()[1].gain).toBeCloseTo(0.5);
  key("ArrowUp", { shiftKey: true });
  expect(filters()[1].q).toBeCloseTo(0.5 * 2 ** (1 / 12));
  key("Enter");
  expect(filters()[1].gain).toBeCloseTo(0);
  expect(filters()[1].q).toBe(0.5);
  key("End");
  key("ArrowLeft");
  expect(filters().at(-1)?.freq).toBeCloseTo(20000 / 2 ** (1 / 12));
  key("PageUp");
  key("ArrowDown");
  expect(filters().at(-2)?.gain).toBeCloseTo(-0.5);
  expect(save).toHaveBeenCalled();
  cleanup();
});

test("coalesces a drag to one visual update and flushes persistence on mouseup", () => {
  const { canvas, state, draw, save, flush, runFrame, cleanup } = setup();
  const point = state.getPoints()[0];
  canvas.dispatchEvent(
    Object.assign(new Event("mousedown"), { clientX: point.x, clientY: point.y, shiftKey: false }),
  );
  for (let index = 0; index < 100; index++) {
    canvas.dispatchEvent(
      Object.assign(new Event("mousemove"), { clientX: point.x + index, clientY: point.y - index }),
    );
  }
  expect(draw).not.toHaveBeenCalled();
  runFrame();
  expect(draw).toHaveBeenCalledOnce();
  expect(save).toHaveBeenCalledTimes(100);
  window.dispatchEvent(new Event("mouseup"));
  expect(flush).toHaveBeenCalledOnce();
  cleanup();
});

test("keyboard edits clamp frequency/Q and leave Tab and global shortcuts alone", () => {
  const { key, filters, cleanup, state, canvas } = setup();
  key("Home");
  for (let i = 0; i < 240; i++) key("ArrowLeft");
  expect(filters()[0].freq).toBeCloseTo(1);
  for (let i = 0; i < 240; i++) key("ArrowRight");
  expect(filters()[0].freq).toBeCloseTo(24000);
  for (let i = 0; i < 100; i++) key("ArrowDown", { shiftKey: true });
  expect(filters()[0].q).toBe(0.1);
  for (let i = 0; i < 100; i++) key("ArrowUp", { shiftKey: true });
  expect(filters()[0].q).toBe(10);
  expect(key("Tab").defaultPrevented).toBe(false);
  expect(key("m", { altKey: true }).defaultPrevented).toBe(false);
  expect(key("ArrowUp", { ctrlKey: true }).defaultPrevented).toBe(false);
  expect(state.getDragMode()).toBeNull();
  state.setDragTarget({ type: "peaking", index: 0 }, "point");
  canvas.dispatchEvent(new Event("blur"));
  expect(state.getDragMode()).toBeNull();
  cleanup();
});
