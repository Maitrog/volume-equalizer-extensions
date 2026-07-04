import { LOG_MAX, LOG_MIN } from "../../../domains/equalizer/equalizerMath";
import type { EqualizerCanvasPaintOptions } from "../types";

export const drawAxis = ({
  canvas,
  ctx,
  colors,
}: EqualizerCanvasPaintOptions): void => {
  const freqMargin = 10;
  const margin = 10;
  const yPos = canvas.height;

  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  const freqs = [5, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
  const canvasWidth = canvas.width - 10;

  ctx.strokeStyle = colors.axis;
  ctx.fillStyle = colors.axis;

  freqs.forEach((freq) => {
    const x =
      Math.pow((Math.log10(freq) - LOG_MIN) / (LOG_MAX - LOG_MIN), 2) *
      canvasWidth;
    ctx.beginPath();
    ctx.moveTo(x, yPos - 10);
    ctx.lineTo(x, yPos);
    ctx.stroke();
    ctx.fillText(freq.toString(), x, yPos - margin - freqMargin);

    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 10);
    ctx.stroke();
  });

  const gainMargin = 10;
  const gainMin = -25;
  const gainMax = 25;
  const step = 5;
  const gainLabels = Array.from(
    { length: (gainMax - gainMin) / step + 1 },
    (_, index) => index * step - gainMax,
  );
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";

  gainLabels.forEach((gain) => {
    const y =
      gainMargin +
      ((gainMax - gain) / (gainMax - gainMin)) *
        (canvas.height - gainMargin * 2);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(10, y);
    ctx.stroke();
    ctx.fillText(gain.toString(), 12, y);
  });

  const zeroY =
    gainMargin +
    ((gainMax - 0) / (gainMax - gainMin)) * (canvas.height - gainMargin * 2);
  ctx.textBaseline = "bottom";
  ctx.textAlign = "center";

  freqs.forEach((freq) => {
    const x =
      Math.pow((Math.log10(freq) - LOG_MIN) / (LOG_MAX - LOG_MIN), 2) *
      canvasWidth;
    ctx.beginPath();
    ctx.moveTo(x, zeroY - 5);
    ctx.lineTo(x, zeroY + 5);
    ctx.stroke();
  });
};
