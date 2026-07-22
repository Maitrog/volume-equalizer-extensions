import {
  ensureQFactor,
  xToFrequency,
  yToDb,
} from "../../../domains/equalizer/equalizerMath";
import {
  POINT_RADIUS,
  type EqualizerCanvasPoint,
} from "../../../domains/equalizer/equalizerState";
import type { ThemeColors } from "../../../domains/theme/themeColors";
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
  getColors,
}: EqualizerCanvasRenderOptions): void => {
  const colors = getColors();

  drawPoints({ ctx, state, colors });

  const canvasWidth = canvas.width - 10;
  const highpassPoint = state.getHighpassPoint();

  if (highpassPoint) {
    drawBiquadFilter({
      canvas,
      ctx,
      audioContext,
      type: "highpass",
      freq: xToFrequency(highpassPoint.x, canvasWidth),
      q: ensureQFactor(highpassPoint.q),
      minDb: -80,
      strokeStyle: colors.highpassFilterColor,
    });
  }

  state.getPoints().forEach((point) => {
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
    gradient.addColorStop(0, colors.accentStart);
    gradient.addColorStop(0.5, colors.accentMid);
    gradient.addColorStop(1, colors.accentEnd);

    drawBiquadFilter({
      canvas,
      ctx,
      audioContext,
      type: "peaking",
      freq: xToFrequency(point.x, canvasWidth),
      q: ensureQFactor(point.q),
      gain: yToDb(point.y, canvas.height),
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
      freq: xToFrequency(lowpassPoint.x, canvasWidth),
      q: ensureQFactor(lowpassPoint.q),
      minDb: -80,
      strokeStyle: colors.lowpassFilterColor,
    });
  }
};
