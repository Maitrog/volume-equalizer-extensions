import {
  DEFAULT_FILTER_Q,
  ensureQFactor,
  frequencyToX,
  xToFrequency,
} from "../../domains/equalizer/equalizerMath";
import type {
  EqualizerCanvasDimensions,
  EqualizerCanvasPoint,
  EqualizerDragTarget,
  EqualizerState,
} from "./equalizerEditorState";
import type { EqualizerTooltipHelpers } from "./equalizerTooltips";

export interface EqualizerGestureOptions {
  canvas: HTMLCanvasElement;
  state: EqualizerState;
  draw: () => void;
  saveCurrentFilters: () => Promise<void> | void;
  flushCurrentFilters?: () => Promise<void> | void;
  tooltips: Pick<EqualizerTooltipHelpers, "updateInfoTooltip" | "hideInfoTooltip">;
  getDimensions?: () => EqualizerCanvasDimensions;
  onKeyboardSelection?: (target: EqualizerDragTarget | null, index: number) => void;
}

export type EqualizerGestureCleanup = () => void;

const getCanvasDimensions = (canvas: HTMLCanvasElement): EqualizerCanvasDimensions => {
  return {
    canvasWidth: canvas.clientWidth,
    canvasHeight: canvas.clientHeight,
  };
};

const getMousePosition = (
  canvas: HTMLCanvasElement,
  event: MouseEvent,
): { x: number; y: number } => {
  const rect = canvas.getBoundingClientRect();

  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
};

export const attachEqualizerGestures = ({
  canvas,
  state,
  draw,
  saveCurrentFilters,
  flushCurrentFilters = saveCurrentFilters,
  tooltips,
  onKeyboardSelection = () => {},
  getDimensions = () => getCanvasDimensions(canvas),
}: EqualizerGestureOptions): EqualizerGestureCleanup => {
  let qDragStartValue = DEFAULT_FILTER_Q;
  let qDragStartY = 0;
  let activeDragTarget: EqualizerDragTarget | null = null;
  let keyboardIndex: number | null = null;
  let visualFrame: number | null = null;
  const getKeyboardTargets = (): EqualizerDragTarget[] => [
    ...(state.getHighpassPoint() ? [{ type: "highpass" as const }] : []),
    ...state.getPoints().map((_point, index) => ({ type: "peaking" as const, index })),
    ...(state.getLowpassPoint() ? [{ type: "lowpass" as const }] : []),
  ];

  const scheduleVisualUpdate = (): void => {
    if (visualFrame != null) return;
    visualFrame = window.requestAnimationFrame(() => {
      visualFrame = null;
      draw();
    });
  };

  const persistAndRedraw = (): void => {
    scheduleVisualUpdate();
    void saveCurrentFilters();
  };

  const handleMouseDown = (event: MouseEvent): void => {
    keyboardIndex = null;
    onKeyboardSelection(null, 0);
    const { x, y } = getMousePosition(canvas, event);
    const dragTarget = state.getPointIndexAtPosition(x, y);

    if (!dragTarget) {
      return;
    }

    state.setDragTarget(dragTarget, event.shiftKey ? "q" : "point");
    activeDragTarget = dragTarget;
    qDragStartY = y;

    const draggedPoint = state.getDraggedPoint();

    if (!draggedPoint) {
      return;
    }

    qDragStartValue = ensureQFactor(draggedPoint.q);
    tooltips.updateInfoTooltip(draggedPoint, getDimensions());
  };

  const handleMouseUp = (): void => {
    const shouldFlush = activeDragTarget != null;
    activeDragTarget = null;
    state.clearDrag();
    tooltips.hideInfoTooltip();
    if (shouldFlush) void flushCurrentFilters();
  };

  const handleMouseMove = (event: MouseEvent): void => {
    if (state.getDragMode() === null) {
      return;
    }

    const { x, y } = getMousePosition(canvas, event);
    let mx = x;
    let my = y;
    const currentPoint = state.getDraggedPoint();

    if (!currentPoint) {
      return;
    }

    const dimensions = getDimensions();
    let nextPoint: EqualizerCanvasPoint | null = null;

    if (state.getDragMode() === "q") {
      const dy = qDragStartY - my;
      const nextQ = qDragStartValue * Math.pow(2, dy / 40);
      nextPoint = { ...currentPoint, q: ensureQFactor(nextQ) };
    } else if (mx > 0) {
      mx = Math.max(0, Math.min(canvas.clientWidth, mx));
      my = Math.max(0, Math.min(canvas.clientHeight, my));
      nextPoint = {
        ...currentPoint,
        x: mx,
        y: activeDragTarget?.type === "peaking" ? my : dimensions.canvasHeight / 2,
      };
    }

    if (!nextPoint) {
      return;
    }

    state.setDraggedPoint(nextPoint);
    tooltips.updateInfoTooltip(nextPoint, dimensions);
    persistAndRedraw();
  };

  const handleDoubleClick = (event: MouseEvent): void => {
    const { x, y } = getMousePosition(canvas, event);
    const pointTarget = state.getPointIndexAtPosition(x, y);

    if (!pointTarget) {
      return;
    }

    state.resetPoint(pointTarget, getDimensions());
    scheduleVisualUpdate();
    void saveCurrentFilters();
    void flushCurrentFilters();
  };

  const handleKeyDown = (event: KeyboardEvent): void => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const keys = [
      "Home",
      "End",
      "PageUp",
      "PageDown",
      "ArrowUp",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
      "Enter",
    ];
    if (!keys.includes(event.key)) return;
    const targets = getKeyboardTargets();
    if (!targets.length) return;
    event.preventDefault();
    handleMouseUp();
    keyboardIndex = Math.min(keyboardIndex ?? 0, targets.length - 1);
    if (event.key === "Home") keyboardIndex = 0;
    if (event.key === "End") keyboardIndex = targets.length - 1;
    if (event.key === "PageUp") keyboardIndex = Math.max(0, keyboardIndex - 1);
    if (event.key === "PageDown") keyboardIndex = Math.min(targets.length - 1, keyboardIndex + 1);
    const target = targets[keyboardIndex];
    const dimensions = getDimensions();
    let changed = false;
    if (event.key === "Enter") {
      state.resetPoint(target, dimensions);
      changed = true;
    } else if (event.key.startsWith("Arrow")) {
      const horizontal = event.key === "ArrowLeft" || event.key === "ArrowRight";
      const qEdit = event.shiftKey && !horizontal;
      const direction = event.key === "ArrowUp" || event.key === "ArrowRight" ? 1 : -1;
      state.setDragTarget(target, qEdit ? "q" : "point");
      const point = state.getDraggedPoint();
      if (point && (horizontal || qEdit || target.type === "peaking")) {
        if (qEdit) point.q = ensureQFactor(point.q * 2 ** (direction / 12));
        else if (horizontal) {
          const width = dimensions.canvasWidth - 10;
          const freq = Math.max(
            1,
            Math.min(24000, xToFrequency(point.x, width) * 2 ** (direction / 12)),
          );
          point.x = frequencyToX(freq, width);
        } else {
          const step = (0.5 / 25) * (dimensions.canvasHeight / 2 - 20);
          point.y = Math.max(0, Math.min(dimensions.canvasHeight, point.y - direction * step));
        }
        state.setDraggedPoint(point);
        changed = true;
      }
      state.clearDrag();
    }
    onKeyboardSelection(target, keyboardIndex);
    if (changed) {
      persistAndRedraw();
      void flushCurrentFilters();
    } else draw();
  };

  const handleFocus = (): void => {
    keyboardIndex = 0;
    onKeyboardSelection(getKeyboardTargets()[0] ?? null, 0);
    draw();
  };
  const handleBlur = (): void => {
    handleMouseUp();
    void flushCurrentFilters();
    keyboardIndex = null;
    onKeyboardSelection(null, 0);
    draw();
  };

  canvas.addEventListener("mousedown", handleMouseDown);
  canvas.addEventListener("mousemove", handleMouseMove);
  canvas.addEventListener("dblclick", handleDoubleClick);
  canvas.addEventListener("keydown", handleKeyDown);
  canvas.addEventListener("focus", handleFocus);
  canvas.addEventListener("blur", handleBlur);
  window.addEventListener("mouseup", handleMouseUp);

  return () => {
    if (visualFrame != null) window.cancelAnimationFrame(visualFrame);
    canvas.removeEventListener("mousedown", handleMouseDown);
    canvas.removeEventListener("mousemove", handleMouseMove);
    canvas.removeEventListener("dblclick", handleDoubleClick);
    canvas.removeEventListener("keydown", handleKeyDown);
    canvas.removeEventListener("focus", handleFocus);
    canvas.removeEventListener("blur", handleBlur);
    handleBlur();
    window.removeEventListener("mouseup", handleMouseUp);
  };
};
