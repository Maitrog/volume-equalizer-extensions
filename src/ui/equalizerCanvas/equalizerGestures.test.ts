import { afterEach, expect, test, vi } from "vitest";
import { frequencyToX, xToFrequency } from "../../domains/equalizer/equalizerMath";
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
  const tooltips = { updateInfoTooltip: vi.fn(), hideInfoTooltip: vi.fn() };
  const mouse = (type: string, clientX: number, clientY: number, modifiers = {}) =>
    canvas.dispatchEvent(
      Object.assign(new Event(type), {
        clientX,
        clientY,
        ctrlKey: false,
        shiftKey: false,
        ...modifiers,
      }),
    );
  const cleanup = attachEqualizerGestures({
    canvas: canvas as HTMLCanvasElement,
    state,
    draw,
    saveCurrentFilters: save,
    flushCurrentFilters: flush,
    tooltips,
  });
  const key = (key: string, modifiers = {}) => {
    const event = Object.assign(new Event("keydown", { cancelable: true }), { key, ...modifiers });
    canvas.dispatchEvent(event);
    return event;
  };
  return {
    canvas,
    mouse,
    tooltips,
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

test("ordinary movement keeps the clamped pointer X and derives its frequency", () => {
  const { canvas, state, cleanup } = setup();
  const point = state.getPoints()[0];
  canvas.dispatchEvent(
    Object.assign(new Event("mousedown"), { clientX: point.x, clientY: point.y }),
  );
  canvas.dispatchEvent(Object.assign(new Event("mousemove"), { clientX: 650, clientY: 80 }));
  expect(state.getPoints()[0]).toMatchObject({ x: 600, y: 80, freq: xToFrequency(600, 590) });
  cleanup();
});

test.each([0.5, 1000.4])("gain and Q gestures preserve loaded frequency %s", (freq) => {
  const { canvas, state, key, cleanup } = setup();
  state.setPoints([{ type: "peaking", freq, gain: 0, q: 0.5 }], dimensions);
  key("Home");
  key("PageDown");
  key("ArrowUp");
  key("ArrowUp", { shiftKey: true });
  const point = state.getPoints()[0];
  canvas.dispatchEvent(
    Object.assign(new Event("mousedown"), { clientX: point.x, clientY: point.y }),
  );
  canvas.dispatchEvent(Object.assign(new Event("mousemove"), { clientX: point.x, clientY: 80 }));
  expect(state.getFilters(dimensions)[1].freq).toBe(freq);
  window.dispatchEvent(new Event("mouseup"));
  canvas.dispatchEvent(
    Object.assign(new Event("mousedown"), { clientX: point.x, clientY: 80, shiftKey: true }),
  );
  canvas.dispatchEvent(
    Object.assign(new Event("mousemove"), { clientX: point.x + 20, clientY: 70 }),
  );
  expect(state.getFilters(dimensions)[1].freq).toBe(freq);
  cleanup();
});

test("horizontal keys advance the exact loaded frequency and update X", () => {
  const { state, key, cleanup } = setup();
  state.setPoints([{ type: "peaking", freq: 1000.4, gain: 0, q: 0.5 }], dimensions);
  key("Home");
  key("PageDown");
  key("ArrowRight");
  const expectedFrequency = 1000.4 * 2 ** (1 / 12);
  expect(state.getPoints()[0].freq).toBe(expectedFrequency);
  expect(state.getFilters(dimensions)[1].freq).toBe(expectedFrequency);
  cleanup();
});

test.each([1, 2])("Ctrl uses CSS pixels at DPR %s and keeps gain fixed", (dpr) => {
  vi.stubGlobal("devicePixelRatio", dpr);
  const { state, mouse, save, tooltips, cleanup } = setup();
  state.setPoints([{ type: "peaking", freq: 1000.4, gain: 5, q: 0.5 }], dimensions);
  const point = { ...state.getPoints()[0] };
  mouse("mousedown", point.x, point.y, { ctrlKey: true });
  mouse("mousemove", point.x, point.y + 60, { ctrlKey: true });
  mouse("mousemove", point.x + 0.4, point.y + 60, { ctrlKey: true });
  expect(state.getPoints()[0]).toEqual(point);
  expect(save).not.toHaveBeenCalled();
  mouse("mousemove", point.x + 0.8, point.y + 60, { ctrlKey: true });
  mouse("mousemove", point.x + 1.2, point.y + 60, { ctrlKey: true });
  expect(state.getPoints()[0]).toEqual({ ...point, freq: 1001, x: frequencyToX(1001, 590) });
  mouse("mousemove", point.x + 9.2, point.y - 60, { ctrlKey: true });
  expect(state.getPoints()[0].freq).toBe(1009);
  expect(state.getPoints()[0].y).toBe(point.y);
  expect(tooltips.updateInfoTooltip).toHaveBeenLastCalledWith(state.getPoints()[0], dimensions);
  cleanup();
});

test("Ctrl accumulates signed fractions and cancels movement when direction reverses", () => {
  const { state, mouse, cleanup } = setup();
  state.setPoints([{ type: "peaking", freq: 1000, gain: 0, q: 0.5 }], dimensions);
  const { x, y } = state.getPoints()[0];
  mouse("mousedown", x, y, { ctrlKey: true });
  for (const dx of [0.6, 0.2, -0.4, -0.8]) mouse("mousemove", x + dx, y, { ctrlKey: true });
  expect(state.getPoints()[0].freq).toBe(1000);
  mouse("mousemove", x - 1.2, y, { ctrlKey: true });
  expect(state.getPoints()[0].freq).toBe(999);
  cleanup();
});

test.each([
  [1, -1, 2],
  [24000, 1, 23999],
])("Ctrl discards outward movement at %s Hz", (freq, direction, expected) => {
  const { state, mouse, cleanup } = setup();
  state.setPoints([{ type: "peaking", freq, gain: 0, q: 0.5 }], dimensions);
  const { x, y } = state.getPoints()[0];
  mouse("mousedown", x, y, { ctrlKey: true });
  for (const dx of [2, 5, 8.5]) mouse("mousemove", x + direction * dx, y, { ctrlKey: true });
  mouse("mousemove", x + direction * 7.5, y, { ctrlKey: true });
  expect(state.getPoints()[0].freq).toBe(expected);
  cleanup();
});

test("Ctrl transitions preserve position and resume ordinary motion without a jump or lasting offset", () => {
  const { state, mouse, save, cleanup } = setup();
  const { x, y } = state.getPoints()[0];
  mouse("mousedown", x, y);
  mouse("mousemove", x + 5, y - 5);
  const before = { ...state.getPoints()[0] };
  save.mockClear();
  mouse("mousemove", x + 80, y + 100, { ctrlKey: true });
  expect(state.getPoints()[0]).toEqual(before);
  mouse("mousemove", x + 81, y + 100, { ctrlKey: true });
  const precise = { ...state.getPoints()[0] };
  mouse("mousemove", x + 100, y + 120);
  expect(state.getPoints()[0]).toEqual(precise);
  expect(save).toHaveBeenCalledOnce();
  mouse("mousemove", x + 100, y + 125);
  expect(state.getPoints()[0].y).toBe(precise.y + 5);
  const resumed = { ...state.getPoints()[0] };
  mouse("mousemove", x + 110, y + 140, { ctrlKey: true });
  mouse("mousemove", x + 111, y + 180, { ctrlKey: true });
  expect(state.getPoints()[0].y).toBe(resumed.y);
  window.dispatchEvent(new Event("mouseup"));
  const next = { ...state.getPoints()[0] };
  mouse("mousedown", next.x, next.y);
  mouse("mousemove", next.x + 2, next.y + 3);
  expect(state.getPoints()[0].y).toBe(next.y + 3);
  expect(state.getPoints()[0].x).toBe(next.x + 2);
  cleanup();
});

test("Shift takes precedence over Ctrl and precise vertical crossover motion does not enable it", () => {
  const { state, mouse, save, cleanup } = setup();
  const point = { ...state.getPoints()[0] };
  mouse("mousedown", point.x, point.y, { ctrlKey: true, shiftKey: true });
  mouse("mousemove", point.x + 8, point.y - 40, { ctrlKey: true });
  expect(state.getPoints()[0]).toEqual({ ...point, q: point.q * 2 });
  window.dispatchEvent(new Event("mouseup"));
  const crossover = { ...state.getHighpassPoint()! };
  const filters = state.getFilters(dimensions);
  save.mockClear();
  mouse("mousedown", crossover.x, crossover.y, { ctrlKey: true });
  mouse("mousemove", crossover.x, crossover.y + 80, { ctrlKey: true });
  expect(state.getFilters(dimensions)).toEqual(filters);
  expect(save).not.toHaveBeenCalled();
  cleanup();
});

test.each(["mouseup", "blur", "cleanup"])(
  "%s ends Ctrl editing and flushes the last step",
  (ending) => {
    const { state, mouse, canvas, flush, cleanup } = setup();
    const point = { ...state.getPoints()[0] };
    mouse("mousedown", point.x, point.y, { ctrlKey: true });
    mouse("mousemove", point.x + 1, point.y, { ctrlKey: true });
    const edited = { ...state.getPoints()[0] };
    if (ending === "cleanup") cleanup();
    else (ending === "mouseup" ? window : canvas).dispatchEvent(new Event(ending));
    expect(flush).toHaveBeenCalled();
    mouse("mousemove", point.x + 10, point.y, { ctrlKey: true });
    expect(state.getPoints()[0]).toEqual(edited);
    if (ending !== "cleanup") cleanup();
  },
);

test.each([
  [1, -1, 2],
  [24000, 1, 23999],
])("Ctrl discards incomplete outward steps at %s Hz", (freq, direction, expected) => {
  const { state, mouse, cleanup } = setup();
  state.setPoints([{ type: "peaking", freq, gain: 0, q: 0.5 }], dimensions);
  const { x, y } = state.getPoints()[0];
  mouse("mousedown", x, y, { ctrlKey: true });
  mouse("mousemove", x + direction * 0.4, y, { ctrlKey: true });
  mouse("mousemove", x - direction * 0.6, y, { ctrlKey: true });
  expect(state.getPoints()[0].freq).toBe(expected);
  cleanup();
});

const preciseMovementCases = [
  {
    name: "individual signed steps",
    moves: [
      [1, 1001],
      [2, 1002],
      [-1, 999],
    ],
  },
  { name: "batched steps", moves: [[8, 1008]] },
  {
    name: "positive fractional steps",
    moves: [
      [0.4, 1000],
      [0.8, 1000],
      [1.2, 1001],
    ],
  },
  {
    name: "negative fractional steps",
    moves: [
      [-0.4, 1000],
      [-0.8, 1000],
      [-1.2, 999],
    ],
  },
  {
    name: "fractional direction reversal",
    moves: [
      [0.6, 1000],
      [0.2, 1000],
      [-0.4, 1000],
      [-0.8, 1000],
      [-1.2, 999],
    ],
  },
];

test.each(
  (["peaking", "highpass", "lowpass"] as const).flatMap((type) =>
    preciseMovementCases.map((scenario) => ({ type, ...scenario })),
  ),
)("Ctrl edits $type with $name", ({ type, moves }) => {
  const { state, mouse, filters, cleanup } = setup();
  const gain = type === "peaking" ? 5 : 0;
  state.setPoints([{ type, freq: 1000, gain, q: 0.5, enabled: false }], dimensions);
  const getPoint = () =>
    type === "peaking"
      ? state.getPoints()[0]
      : type === "highpass"
        ? state.getHighpassPoint()!
        : state.getLowpassPoint()!;
  const { x, y } = getPoint();
  mouse("mousedown", x, y, { ctrlKey: true });
  let edited = false;
  for (const [dx, expected] of moves) {
    mouse("mousemove", x + dx, y + 60, { ctrlKey: true });
    expect(getPoint().freq).toBe(expected);
    expect(getPoint().x).toBe(frequencyToX(expected, 590));
    expect(getPoint().y).toBe(type === "peaking" ? y : 150);
    expect(getPoint().q).toBe(0.5);
    const filter = filters().find((filter) => filter.type === type)!;
    expect(filter.freq).toBe(expected);
    expect(filter.gain).toBe(gain);
    edited ||= expected !== 1000;
    if (type !== "peaking") expect(filter.enabled).toBe(edited);
  }
  cleanup();
});

test.each([1, 2])(
  "resize before a frame preserves Ctrl hit testing and CSS steps at DPR %s",
  (dpr) => {
    const { canvas, state, mouse, cleanup } = setup();
    Object.assign(window, { devicePixelRatio: dpr });
    state.setPoints([{ type: "peaking", freq: 20001, gain: 6, q: 2 }], dimensions);
    const y = state.getPoints()[0].y;
    canvas.clientWidth = 900;
    const x = frequencyToX(20001, 890);
    mouse("mousedown", x, y, { ctrlKey: true });
    expect(state.getDraggedPoint()?.freq).toBe(20001);
    mouse("mousemove", x + 1, y + 50, { ctrlKey: true });
    expect(state.getPoints()[0]).toMatchObject({ freq: 20002, y, x: frequencyToX(20002, 890) });
    canvas.clientWidth = 700;
    mouse("mousemove", x + 2, y + 80, { ctrlKey: true });
    expect(state.getPoints()[0]).toMatchObject({ freq: 20003, y, x: frequencyToX(20003, 690) });
    cleanup();
  },
);

test("double click and keyboard gain edits use resized positions before drawing", () => {
  const { canvas, state, mouse, key, cleanup } = setup();
  state.setPoints([{ type: "peaking", freq: 20001, gain: 6, q: 2 }], dimensions);
  canvas.clientWidth = 900;
  key("Home");
  key("PageDown");
  key("ArrowUp");
  expect(state.getPoints()[0]).toMatchObject({ freq: 20001, x: frequencyToX(20001, 890) });
  canvas.clientWidth = 700;
  mouse("dblclick", frequencyToX(20001, 690), state.getPoints()[0].y);
  expect(state.getPoints()[0].q).toBe(0.5);
  cleanup();
});

test("resize during Q dragging preserves the new frequency projection", () => {
  const { canvas, state, mouse, cleanup } = setup();
  state.setPoints([{ type: "peaking", freq: 20001, gain: 6, q: 2 }], dimensions);
  const point = state.getPoints()[0];
  mouse("mousedown", point.x, point.y, { shiftKey: true });
  canvas.clientWidth = 900;
  mouse("mousemove", point.x, point.y - 40, { shiftKey: true });
  expect(state.getPoints()[0]).toEqual({ ...point, x: frequencyToX(20001, 890), q: 4 });
  cleanup();
});
