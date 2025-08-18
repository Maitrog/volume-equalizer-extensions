const spectrumCanvas = document.getElementById("spectrum-canvas");
const spectrumCtx = spectrumCanvas.getContext("2d");
spectrumCtx.imageSmoothingEnabled = true;
spectrumCtx.imageSmoothingQuality = "high";

let meta = {
  sampleRate: 48000,
  fftSize: 4096,
  minDb: -100,
  maxDb: -30,
  frequencyBinCount: 4096,
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

  const sp = smoothPoints(points, 5);

  spectrumCtx.clearRect(0, 0, spectrumCanvas.width, spectrumCanvas.height);

  spectrumCtx.beginPath();
  spectrumCtx.moveTo(0, H);
  spectrumCtx.lineTo(sp[0].x, sp[0].y);

  for (let i = 1; i < sp.length - 1; i++) {
    const xc = (sp[i].x + sp[i + 1].x) / 2;
    const yc = (sp[i].y + sp[i + 1].y) / 2;
    spectrumCtx.quadraticCurveTo(sp[i].x, sp[i].y, xc, yc);
  }

  spectrumCtx.lineTo(sp[sp.length - 1].x, sp[sp.length - 1].y);
  spectrumCtx.lineTo(spectrumCanvas.width, H);
  spectrumCtx.closePath();

  spectrumCtx.fillStyle = "#555566";
  spectrumCtx.fill();

  spectrumCtx.strokeStyle = "#aaaaaa";
  spectrumCtx.lineWidth = 0.1;
  spectrumCtx.stroke();
}

function smoothPoints(pts, win = 5) {
  const half = (win - 1) / 2;
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    let sum = 0,
      cnt = 0;
    for (let j = i - half; j <= i + half; j++) {
      const k = Math.min(pts.length - 1, Math.max(0, j));
      sum += pts[k].y;
      cnt++;
    }
    out.push({ x: pts[i].x, y: sum / cnt });
  }
  return out;
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

      columnToBin = null;
      return;
    }
    if (msg.type === "spectrum" && msg.buffer) {
      lastBuffer = msg.buffer;
      scheduleDraw();
      return;
    }
  }
});
