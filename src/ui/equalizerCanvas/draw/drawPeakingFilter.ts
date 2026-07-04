import { xToFrequency } from "../../../domains/equalizer/equalizerMath";
import type { EqualizerFilterRenderOptions } from "../types";

export interface PeakingFilterRenderOptions extends EqualizerFilterRenderOptions {
  gainDb?: number;
}

export const drawPeakingFilter = ({
  canvas,
  ctx,
  audioContext,
  freq,
  q = 1,
  gainDb = 0,
  colors,
}: PeakingFilterRenderOptions): void => {
  const gainMargin = 20;
  const width = canvas.width;
  const height = canvas.height;
  const canvasWidth = width - 10;

  const filter = audioContext.createBiquadFilter();
  filter.type = "peaking";
  filter.frequency.value = freq;
  filter.Q.value = q;
  filter.gain.value = gainDb;

  const numPoints = width;
  const frequencies = new Float32Array(numPoints);
  const magResponse = new Float32Array(numPoints);
  const phaseResponse = new Float32Array(numPoints);
  const maxResponseFrequency = audioContext.sampleRate / 2;

  for (let i = 0; i < numPoints; i++) {
    frequencies[i] = Math.min(xToFrequency(i, canvasWidth), maxResponseFrequency);
  }

  filter.getFrequencyResponse(frequencies, magResponse, phaseResponse);

  const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
  gradient.addColorStop(0, colors.accentStart);
  gradient.addColorStop(0.5, colors.accentMid);
  gradient.addColorStop(1, colors.accentEnd);
  ctx.strokeStyle = gradient;
  ctx.lineWidth = 1;
  ctx.beginPath();

  for (let i = 0; i < numPoints; i++) {
    const db = 25 * Math.log10(magResponse[i]);
    const y = height / 2 - (db / 25) * (height / 2 - gainMargin * 2);
    const x = i;

    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }

  ctx.stroke();
};
