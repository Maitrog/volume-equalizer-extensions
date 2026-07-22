export const MIN_POINT_COUNT = 5;
export const MAX_POINT_COUNT = 9;
export const MIN_FILTER_Q = 0.1;
export const MAX_FILTER_Q = 10;
export const DEFAULT_FILTER_Q = 0.5;
export const LOG_MIN = Math.log10(1);
export const LOG_MAX = Math.log10(22000);

export const clampPointCount = (value: number): number => {
  if (Number.isNaN(value)) {
    return MIN_POINT_COUNT;
  }

  return Math.max(MIN_POINT_COUNT, Math.min(MAX_POINT_COUNT, value));
};

export const ensureQFactor = (value: unknown): number => {
  const q = Number(value);

  if (!Number.isFinite(q)) {
    return DEFAULT_FILTER_Q;
  }

  return Math.max(MIN_FILTER_Q, Math.min(MAX_FILTER_Q, q));
};

export const xToFrequency = (x: number, canvasWidth: number): number => {
  const freq = Math.pow(
    10,
    Math.sqrt(x / canvasWidth) * (LOG_MAX - LOG_MIN) + LOG_MIN
  );

  return freq > 24000 ? 24000 : freq;
};

export const frequencyToX = (freq: number, canvasWidth: number): number => {
  if (freq === 0) {
    return 0;
  }

  const normalizedFreq = freq > 24000 ? 24000 : freq;

  return (
    Math.pow((Math.log10(normalizedFreq) - LOG_MIN) / (LOG_MAX - LOG_MIN), 2) *
    canvasWidth
  );
};

export const yToDb = (y: number, canvasHeight: number): number => {
  return ((canvasHeight / 2 - y) / (canvasHeight / 2 - 20)) * 25;
};

export const dbToGain = (db: number): number => {
  if (db >= 0) {
    return 1 * Math.pow(1.12, db);
  }

  return 1 / Math.pow(1.12, Math.abs(db));
};
