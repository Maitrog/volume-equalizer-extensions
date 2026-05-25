function clampPointCount(value) {
  return Math.max(MIN_POINT_COUNT, Math.min(MAX_POINT_COUNT, value));
}

function ensureQFactor(value) {
  const q = Number(value);
  if (!Number.isFinite(q)) return DEFAULT_FILTER_Q;
  return Math.max(MIN_FILTER_Q, Math.min(MAX_FILTER_Q, q));
}

function xToFrequency(x, canvasWidth = null) {
  canvasWidth ??= canvas.width - 10;
  const freq = Math.pow(
    10,
    Math.sqrt(x / canvasWidth) * (logMax - logMin) + logMin
  );
  return freq > 24000 ? 24000 : freq;
}

function frequencyToX(freq, canvasWidth = null) {
  if (freq == 0) return 0;

  freq = freq > 24000 ? 24000 : freq;
  canvasWidth ??= canvas.width - 10;
  const x =
    Math.pow((Math.log10(freq) - logMin) / (logMax - logMin), 2) * canvasWidth;
  return x;
}

function yToDb(y, canvasHeight = null) {
  canvasHeight ??= canvas.height;
  return ((canvasHeight / 2 - y) / (canvasHeight / 2 - 20)) * 25;
}

function dbToGain(db) {
  let gain;
  if (db >= 0) {
    gain = 1 + db / 3;
  } else {
    gain = 1.5 / Math.abs(db);
  }

  return gain;
}
