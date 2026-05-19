const spectrumCanvas = document.getElementById("spectrum-canvas");
const spectrumCtx = spectrumCanvas.getContext("2d");
spectrumCtx.imageSmoothingEnabled = true;
spectrumCtx.imageSmoothingQuality = "high";

let meta = {
  sampleRate: 48000,
  fftSize: 2048,
  minDb: -100,
  maxDb: -30,
  frequencyBinCount: 2048,
};
let lastBuffer = null;
let rafScheduled = false;

function scheduleDraw() {
  if (rafScheduled) return;
  rafScheduled = true;
  requestAnimationFrame(() => {
    rafScheduled = false;
    if (lastBuffer) drawSpectrum(lastBuffer);
  });
}

function getSpectrumValues(buffer) {
  if (!buffer) return [];
  if (typeof buffer.length === "number") return buffer;

  return Object.keys(buffer)
    .filter((key) => !Number.isNaN(Number(key)))
    .sort((a, b) => Number(a) - Number(b))
    .map((key) => buffer[key]);
}

function dbToSpectrumY(db, height) {
  const minDb = Number.isFinite(meta.minDb) ? meta.minDb : -100;
  const maxDb = Number.isFinite(meta.maxDb) ? meta.maxDb : -30;
  const range = maxDb - minDb || 1;
  const normalized = (Math.max(minDb, Math.min(maxDb, db)) - minDb) / range;
  return height - normalized * height;
}

function syncSpectrumCanvasSize() {
  const width = spectrumCanvas.clientWidth;
  const height = spectrumCanvas.clientHeight;

  if (spectrumCanvas.width !== width) spectrumCanvas.width = width;
  if (spectrumCanvas.height !== height) spectrumCanvas.height = height;
}

function spectrumBinToFrequency(index, binCount) {
  const sampleRate = meta.sampleRate || 48000;
  const nyquist = sampleRate / 2;

  return (index * nyquist) / binCount;
}

function drawSpectrum(buffer) {
  syncSpectrumCanvasSize();

  const values = getSpectrumValues(buffer);
  const width = spectrumCanvas.width;
  const height = spectrumCanvas.height;

  spectrumCtx.clearRect(0, 0, width, height);
  if (!values.length || width <= 0 || height <= 0) return;

  const sampleRate = meta.sampleRate || 48000;
  const maxFrequency = Math.min(24000, sampleRate / 2);
  const lineColor = accentMid;
  const fillStart = accentStart;
  const fillEnd = accentEnd;

  const fill = spectrumCtx.createLinearGradient(0, 0, 0, height);
  fill.addColorStop(0, fillStart);
  fill.addColorStop(1, fillEnd);

  spectrumCtx.beginPath();
  spectrumCtx.moveTo(0, height);

  let hasPoint = false;
  for (let i = 0; i < values.length; i++) {
    const frequency = spectrumBinToFrequency(i, values.length);
    if (frequency > maxFrequency) break;

    const db = values[i];
    if (!Number.isFinite(db)) continue;

    const x = frequencyToX(frequency, width - 10);
    const y = dbToSpectrumY(db, height);

    if (!hasPoint) {
      spectrumCtx.lineTo(x, y);
      hasPoint = true;
    } else {
      spectrumCtx.lineTo(x, y);
    }
  }

  if (!hasPoint) return;

  spectrumCtx.lineTo(width, height);
  spectrumCtx.closePath();
  spectrumCtx.fillStyle = fill;
  spectrumCtx.globalAlpha = 0.18;
  spectrumCtx.fill();
  spectrumCtx.globalAlpha = 1;

  spectrumCtx.beginPath();
  hasPoint = false;
  for (let i = 0; i < values.length; i++) {
    const frequency = spectrumBinToFrequency(i, values.length);
    if (frequency > maxFrequency) break;

    const db = values[i];
    if (!Number.isFinite(db)) continue;

    const x = frequencyToX(frequency, width - 10);
    const y = dbToSpectrumY(db, height);

    if (!hasPoint) {
      spectrumCtx.moveTo(x, y);
      hasPoint = true;
    } else {
      spectrumCtx.lineTo(x, y);
    }
  }

  spectrumCtx.strokeStyle = lineColor;
  spectrumCtx.lineWidth = 1.5;
  spectrumCtx.stroke();
}

chrome.storage.onChanged.addListener(async (ps) => {
  const tabId = await getCurrentTabId();
  if (tabId == null || tabId == undefined) return;
  if (ps["spectrum." + tabId]) {
    const msg = ps["spectrum." + tabId].newValue;

    if (!msg || !msg.type) return;

    if (msg.type === "meta") {
      meta.sampleRate = msg.sampleRate;
      meta.fftSize = msg.fftSize;
      meta.minDb = msg.minDb;
      meta.maxDb = msg.maxDb;
      meta.frequencyBinCount = msg.frequencyBinCount;
      return;
    }
    if (msg.type === "spectrum" && msg.buffer) {
      lastBuffer = msg.buffer;
      scheduleDraw();
      return;
    }
  }
});
