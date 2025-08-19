const spectrumCanvas = document.getElementById("spectrum-canvas");
const spectrumCtx = spectrumCanvas.getContext("2d");
spectrumCtx.imageSmoothingEnabled = true;
spectrumCtx.imageSmoothingQuality = "high";

let meta = {
  sampleRate: 48000,
  fftSize: 4096,
  minDb: -100,
  maxDb: -30,
  frequencyBinCount: 512,
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

function drawSpectrum(buffer) {
  if (!buffer || buffer.length == 0) return;
  const bufferLength = meta.frequencyBinCount;

  const H = spectrumCanvas.height;
  const W = spectrumCanvas.width;
  const points = [];
  for (let i = 0; i < bufferLength; i++) {
    const hz = (i * meta.sampleRate) / meta.fftSize;
    const x = frequencyToX(hz);
    const barHeight = (buffer[i] + 100) * 2 + 100;
    const y = H - barHeight / 2;
    if (i == 0) {
      points.push({ x: 0, y });
    }
    points.push({ x, y });
  }

  spectrumCtx.clearRect(0, 0, spectrumCanvas.width, spectrumCanvas.height);

  spectrumCtx.beginPath();
  spectrumCtx.moveTo(0, H);
  spectrumCtx.lineTo(points[0].x, points[0].y);

  for (let i = 1; i < points.length - 1; i++) {
    const xc = (points[i].x + points[i + 1].x) / 2;
    const yc = (points[i].y + points[i + 1].y) / 2;
    spectrumCtx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
  }

  spectrumCtx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
  spectrumCtx.lineTo(W, H);
  spectrumCtx.closePath();

  spectrumCtx.fillStyle = "#555566";
  spectrumCtx.fill();

  spectrumCtx.strokeStyle = "#aaaaaa";
  spectrumCtx.lineWidth = 0.1;
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
