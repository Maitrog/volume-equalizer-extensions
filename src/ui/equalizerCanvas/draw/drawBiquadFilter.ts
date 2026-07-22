import { xToFrequency } from "../../../domains/equalizer/equalizerMath";
import type { EqualizerFilterType } from "../../../domains/equalizer/types";

export const drawBiquadFilter = ({
  canvas,
  ctx,
  audioContext,
  type,
  freq,
  q,
  gain = 0,
  minDb,
  strokeStyle,
}: {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  audioContext: BaseAudioContext;
  type: EqualizerFilterType;
  freq: number;
  q: number;
  gain?: number;
  minDb?: number;
  strokeStyle: string | CanvasGradient | CanvasPattern;
}): void => {
  const filter = audioContext.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = freq;
  filter.Q.value = q;
  filter.gain.value = gain;

  const frequencies = new Float32Array(canvas.width);
  const magnitudes = new Float32Array(canvas.width);
  const phases = new Float32Array(canvas.width);
  const maxFrequency = audioContext.sampleRate / 2;

  for (let i = 0; i < canvas.width; i++) {
    frequencies[i] = Math.min(
      xToFrequency(i, canvas.width - 10),
      maxFrequency,
    );
  }

  filter.getFrequencyResponse(frequencies, magnitudes, phases);
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = 1;
  ctx.beginPath();

  for (let i = 0; i < canvas.width; i++) {
    const magnitude =
      minDb == null ? magnitudes[i] : magnitudes[i] || Number.EPSILON;
    const response = 25 * Math.log10(magnitude);
    const db = minDb == null ? response : Math.max(minDb, response);
    const y = canvas.height / 2 - (db / 25) * (canvas.height / 2 - 40);

    if (i === 0) {
      ctx.moveTo(i, y);
    } else {
      ctx.lineTo(i, y);
    }
  }

  ctx.stroke();
};
