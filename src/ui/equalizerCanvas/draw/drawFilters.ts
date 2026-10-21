import { ensureQFactor, yToDb } from "../../../domains/equalizer/equalizerMath";
import { POINT_RADIUS, type EqualizerCanvasPoint } from "../equalizerEditorState";
import type { ThemeColors } from "../../theme/themeColors";
import type { EqualizerCanvasRenderOptions } from "../types";
import { drawBiquadFilter } from "./drawBiquadFilter";

const drawTypedPoint = (
  ctx: CanvasRenderingContext2D,
  point: EqualizerCanvasPoint | null,
  color: string,
  panelBg: string,
): void => {
  if (!point) {
    return;
  }

  ctx.beginPath();
  ctx.arc(point.x, point.y, POINT_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = panelBg;
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.stroke();
};

const getTargetPoint = (
  state: EqualizerCanvasRenderOptions["state"],
  target: EqualizerCanvasRenderOptions["selectedTarget"],
): EqualizerCanvasPoint | null => {
  if (!target) return null;
  if (target.type === "highpass") return state.getHighpassPoint();
  if (target.type === "lowpass") return state.getLowpassPoint();
  return state.getPoints()[target.index] ?? null;
};

export const drawPoints = ({
  ctx,
  state,
  colors,
}: {
  ctx: CanvasRenderingContext2D;
  state: EqualizerCanvasRenderOptions["state"];
  colors: ThemeColors;
}): void => {
  state.getPoints().forEach((point) => {
    ctx.beginPath();
    ctx.arc(point.x, point.y, POINT_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = colors.panelBg;
    ctx.fill();
    ctx.strokeStyle = colors.accentMid;
    ctx.lineWidth = 2;
    ctx.stroke();
  });

  drawTypedPoint(ctx, state.getHighpassPoint(), colors.highpassFilterColor, colors.panelBg);
  drawTypedPoint(ctx, state.getLowpassPoint(), colors.lowpassFilterColor, colors.panelBg);
};

export const drawFilter = ({
  canvas,
  ctx,
  audioContext,
  state,
  getColors,
  selectedTarget,
}: EqualizerCanvasRenderOptions): void => {
  const colors = getColors();

  drawPoints({ ctx, state, colors });
  const selectedPoint = getTargetPoint(state, selectedTarget);
  if (selectedPoint) {
    ctx.beginPath();
    ctx.arc(selectedPoint.x, selectedPoint.y, POINT_RADIUS + 5, 0, Math.PI * 2);
    ctx.strokeStyle = colors.axis;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  const highpassPoint = state.getHighpassPoint();

  if (highpassPoint) {
    drawBiquadFilter({
      canvas,
      ctx,
      audioContext,
      type: "highpass",
      freq: highpassPoint.freq,
      q: ensureQFactor(highpassPoint.q),
      minDb: -80,
      strokeStyle: colors.highpassFilterColor,
    });
  }

  state.getPoints().forEach((point) => {
    const gradient = ctx.createLinearGradient(0, 0, canvas.clientWidth, 0);
    gradient.addColorStop(0, colors.accentStart);
    gradient.addColorStop(0.5, colors.accentMid);
    gradient.addColorStop(1, colors.accentEnd);

    drawBiquadFilter({
      canvas,
      ctx,
      audioContext,
      type: "peaking",
      freq: point.freq,
      q: ensureQFactor(point.q),
      gain: yToDb(point.y, canvas.clientHeight),
      strokeStyle: gradient,
    });
  });

  const lowpassPoint = state.getLowpassPoint();

  if (lowpassPoint) {
    drawBiquadFilter({
      canvas,
      ctx,
      audioContext,
      type: "lowpass",
      freq: lowpassPoint.freq,
      q: ensureQFactor(lowpassPoint.q),
      minDb: -80,
      strokeStyle: colors.lowpassFilterColor,
    });
  }
};
