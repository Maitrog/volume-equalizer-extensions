import {
  DEFAULT_FILTER_Q,
  ensureQFactor,
} from "../../domains/equalizer/equalizerMath";
import type {
  EqualizerCanvasDimensions,
  EqualizerCanvasPoint,
  EqualizerDragTarget,
  EqualizerState,
} from "../../domains/equalizer/equalizerState";
import type { EqualizerTooltipHelpers } from "./equalizerTooltips";

export interface EqualizerGestureOptions {
  canvas: HTMLCanvasElement;
  state: EqualizerState;
  draw: () => void;
  saveCurrentFilters: () => Promise<void> | void;
  refreshToolkitCaptureFilters: () => void;
  tooltips: Pick<EqualizerTooltipHelpers, "updateInfoTooltip" | "hideInfoTooltip">;
  getDimensions?: () => EqualizerCanvasDimensions;
}

export type EqualizerGestureCleanup = () => void;

const getCanvasDimensions = (
  canvas: HTMLCanvasElement,
): EqualizerCanvasDimensions => {
  return {
    canvasWidth: canvas.width,
    canvasHeight: canvas.height,
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
  refreshToolkitCaptureFilters,
  tooltips,
  getDimensions = () => getCanvasDimensions(canvas),
}: EqualizerGestureOptions): EqualizerGestureCleanup => {
  let qDragStartValue = DEFAULT_FILTER_Q;
  let qDragStartY = 0;
  let activeDragTarget: EqualizerDragTarget | null = null;

  const persistAndRedraw = async (): Promise<void> => {
    draw();
    refreshToolkitCaptureFilters();
    await saveCurrentFilters();
  };

  const handleMouseDown = (event: MouseEvent): void => {
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
    activeDragTarget = null;
    state.clearDrag();
    tooltips.hideInfoTooltip();
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
      mx = Math.max(0, Math.min(canvas.width, mx));
      my = Math.max(0, Math.min(canvas.height, my));
      nextPoint = {
        ...currentPoint,
        x: mx,
        y: activeDragTarget?.type === "peaking"
          ? my
          : dimensions.canvasHeight / 2,
      };
    }

    if (!nextPoint) {
      return;
    }

    state.setDraggedPoint(nextPoint);
    tooltips.updateInfoTooltip(nextPoint, dimensions);
    void persistAndRedraw();
  };

  const handleDoubleClick = (event: MouseEvent): void => {
    const { x, y } = getMousePosition(canvas, event);
    const pointTarget = state.getPointIndexAtPosition(x, y);

    if (!pointTarget) {
      return;
    }

    state.resetPoint(pointTarget, getDimensions());
    draw();
    refreshToolkitCaptureFilters();
    void saveCurrentFilters();
  };

  canvas.addEventListener("mousedown", handleMouseDown);
  canvas.addEventListener("mousemove", handleMouseMove);
  canvas.addEventListener("dblclick", handleDoubleClick);
  window.addEventListener("mouseup", handleMouseUp);

  return () => {
    canvas.removeEventListener("mousedown", handleMouseDown);
    canvas.removeEventListener("mousemove", handleMouseMove);
    canvas.removeEventListener("dblclick", handleDoubleClick);
    window.removeEventListener("mouseup", handleMouseUp);
  };
};
