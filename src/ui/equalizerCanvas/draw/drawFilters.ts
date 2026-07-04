import {
  ensureQFactor,
  xToFrequency,
  yToDb,
} from "../../../domains/equalizer/equalizerMath";
import {
  POINT_RADIUS,
  type EqualizerCanvasPoint,
} from "../../../domains/equalizer/equalizerState";
import type { EqualizerCanvasRenderOptions } from "../types";
import { drawHighpassFilter } from "./drawHighpassFilter";
import { drawLowpassFilter } from "./drawLowpassFilter";
import { drawPeakingFilter } from "./drawPeakingFilter";

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

export const drawPoints = ({
  ctx,
  state,
  colors,
}: Pick<EqualizerCanvasRenderOptions, "ctx" | "state" | "colors">): void => {
  state.getPoints().forEach((point) => {
    ctx.beginPath();
    ctx.arc(point.x, point.y, POINT_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = colors.panelBg;
    ctx.fill();
    ctx.strokeStyle = colors.accentMid;
    ctx.lineWidth = 2;
    ctx.stroke();
  });

  drawTypedPoint(
    ctx,
    state.getHighpassPoint(),
    colors.highpassFilterColor,
    colors.panelBg,
  );
  drawTypedPoint(
    ctx,
    state.getLowpassPoint(),
    colors.lowpassFilterColor,
    colors.panelBg,
  );
};

export const drawFilter = ({
  canvas,
  ctx,
  audioContext,
  state,
  colors,
}: EqualizerCanvasRenderOptions): void => {
  drawPoints({ ctx, state, colors });

  const canvasWidth = canvas.width - 10;
  const highpassPoint = state.getHighpassPoint();

  if (highpassPoint) {
    drawHighpassFilter({
      canvas,
      ctx,
      audioContext,
      freq: xToFrequency(highpassPoint.x, canvasWidth),
      q: ensureQFactor(highpassPoint.q),
      colors,
    });
  }

  state.getPoints().forEach((point) => {
    drawPeakingFilter({
      canvas,
      ctx,
      audioContext,
      freq: xToFrequency(point.x, canvasWidth),
      q: ensureQFactor(point.q),
      gainDb: yToDb(point.y, canvas.height),
      colors,
    });
  });

  const lowpassPoint = state.getLowpassPoint();

  if (lowpassPoint) {
    drawLowpassFilter({
      canvas,
      ctx,
      audioContext,
      freq: xToFrequency(lowpassPoint.x, canvasWidth),
      q: ensureQFactor(lowpassPoint.q),
      colors,
    });
  }
};
