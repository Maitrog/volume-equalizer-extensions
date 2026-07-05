import { frequencyToX } from "../../../domains/equalizer/equalizerMath";
import type { ThemeColors } from "../../../domains/theme/themeColors";

export interface SpectrumMeta {
  sampleRate: number;
  fftSize: number;
  minDb: number;
  maxDb: number;
  frequencyBinCount: number;
}

export type SpectrumBuffer = ArrayLike<number> | Record<string, number>;

export interface SpectrumRendererOptions {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  getColors: () => ThemeColors;
  requestAnimationFrame?: (callback: FrameRequestCallback) => number;
}

export interface SpectrumRenderer {
  setMeta: (nextMeta: Partial<SpectrumMeta>) => void;
  drawSpectrum: (buffer: SpectrumBuffer | null | undefined) => void;
  scheduleDraw: (buffer: SpectrumBuffer | null | undefined) => void;
}

const DEFAULT_META: SpectrumMeta = {
  sampleRate: 48000,
  fftSize: 2048,
  minDb: -100,
  maxDb: -30,
  frequencyBinCount: 2048,
};

const getSpectrumValues = (
  buffer: SpectrumBuffer | null | undefined,
): ArrayLike<number> | number[] => {
  if (!buffer) {
    return [];
  }

  const maybeLength = (buffer as { length?: unknown }).length;

  if (typeof maybeLength === "number") {
    return buffer as ArrayLike<number>;
  }

  const keyedBuffer = buffer as Record<string, number>;

  return Object.keys(keyedBuffer)
    .filter((key) => !Number.isNaN(Number(key)))
    .sort((a, b) => Number(a) - Number(b))
    .map((key) => keyedBuffer[key]);
};

const dbToSpectrumY = (db: number, height: number, meta: SpectrumMeta): number => {
  const minDb = Number.isFinite(meta.minDb) ? meta.minDb : -100;
  const maxDb = Number.isFinite(meta.maxDb) ? meta.maxDb : -30;
  const range = maxDb - minDb || 1;
  const normalized = (Math.max(minDb, Math.min(maxDb, db)) - minDb) / range;

  return height - normalized * height;
};

const syncSpectrumCanvasSize = (canvas: HTMLCanvasElement): void => {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;

  if (canvas.width !== width) {
    canvas.width = width;
  }

  if (canvas.height !== height) {
    canvas.height = height;
  }
};

const spectrumBinToFrequency = (
  index: number,
  binCount: number,
  meta: SpectrumMeta,
): number => {
  const sampleRate = meta.sampleRate || 48000;
  const nyquist = sampleRate / 2;

  return (index * nyquist) / binCount;
};

export const createSpectrumRenderer = ({
  canvas,
  ctx,
  getColors,
  requestAnimationFrame: requestFrame = window.requestAnimationFrame.bind(window),
}: SpectrumRendererOptions): SpectrumRenderer => {
  let meta = { ...DEFAULT_META };
  let lastBuffer: SpectrumBuffer | null | undefined = null;
  let rafScheduled = false;

  const drawSpectrum = (buffer: SpectrumBuffer | null | undefined): void => {
    syncSpectrumCanvasSize(canvas);

    const values = getSpectrumValues(buffer);
    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    if (!values.length || width <= 0 || height <= 0) {
      return;
    }

    const sampleRate = meta.sampleRate || 48000;
    const maxFrequency = Math.min(24000, sampleRate / 2);
    const colors = getColors();
    const fill = ctx.createLinearGradient(0, 0, 0, height);
    fill.addColorStop(0, colors.accentStart);
    fill.addColorStop(1, colors.accentEnd);

    ctx.beginPath();
    ctx.moveTo(0, height);

    let hasPoint = false;

    for (let i = 0; i < values.length; i++) {
      const frequency = spectrumBinToFrequency(i, values.length, meta);

      if (frequency > maxFrequency) {
        break;
      }

      const db = values[i];

      if (!Number.isFinite(db)) {
        continue;
      }

      const x = frequencyToX(frequency, width - 10);
      const y = dbToSpectrumY(db, height, meta);

      ctx.lineTo(x, y);
      hasPoint = true;
    }

    if (!hasPoint) {
      return;
    }

    ctx.lineTo(width, height);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.globalAlpha = 0.18;
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.beginPath();
    hasPoint = false;

    for (let i = 0; i < values.length; i++) {
      const frequency = spectrumBinToFrequency(i, values.length, meta);

      if (frequency > maxFrequency) {
        break;
      }

      const db = values[i];

      if (!Number.isFinite(db)) {
        continue;
      }

      const x = frequencyToX(frequency, width - 10);
      const y = dbToSpectrumY(db, height, meta);

      if (!hasPoint) {
        ctx.moveTo(x, y);
        hasPoint = true;
      } else {
        ctx.lineTo(x, y);
      }
    }

    ctx.strokeStyle = colors.accentMid;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  };

  const scheduleDraw = (buffer: SpectrumBuffer | null | undefined): void => {
    lastBuffer = buffer;

    if (rafScheduled) {
      return;
    }

    rafScheduled = true;
    requestFrame(() => {
      rafScheduled = false;
      drawSpectrum(lastBuffer);
    });
  };

  return {
    setMeta: (nextMeta) => {
      meta = { ...meta, ...nextMeta };
    },
    drawSpectrum,
    scheduleDraw,
  };
};
