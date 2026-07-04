import { xToFrequency } from "../../../domains/equalizer/equalizerMath";
import type { EqualizerFilterRenderOptions } from "../types";

export const drawLowpassFilter = ({
  canvas,
  ctx,
  audioContext,
  freq,
  q = 0.5,
  colors,
}: EqualizerFilterRenderOptions): void => {
  const gainMargin = 20;
  const width = canvas.width;
  const height = canvas.height;
  const canvasWidth = width - 10;

  const filter = audioContext.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = freq;
  filter.Q.value = q;

  const numPoints = width;
  const frequencies = new Float32Array(numPoints);
  const magResponse = new Float32Array(numPoints);
  const phaseResponse = new Float32Array(numPoints);
  const maxResponseFrequency = audioContext.sampleRate / 2;

  for (let i = 0; i < numPoints; i++) {
    frequencies[i] = Math.min(xToFrequency(i, canvasWidth), maxResponseFrequency);
  }

  filter.getFrequencyResponse(frequencies, magResponse, phaseResponse);

  ctx.strokeStyle = colors.lowpassFilterColor;
  ctx.lineWidth = 1;
  ctx.beginPath();

  for (let i = 0; i < numPoints; i++) {
    const db = Math.max(-80, 25 * Math.log10(magResponse[i] || Number.EPSILON));
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
