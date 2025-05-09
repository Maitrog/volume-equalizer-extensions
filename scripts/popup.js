let dragIndex = null;
const canvas = document.getElementById("eq-canvas");
const ctx = canvas.getContext("2d");
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

const logMin = Math.log10(1);
const logMax = Math.log10(20000);
const pointCount = 5;

function xToFrequency(x, canvasWidth = null) {
  canvasWidth ??= canvas.width - 10;
  return Math.pow(10, (x / canvasWidth) * (logMax - logMin) + logMin);
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

function initPoints() {
  const centerY = canvas.height / 2;
  points = Array.from({ length: pointCount }, (_, i) => {
    const point = {
      x: (canvas.width / (pointCount + 1)) * (i + 1),
      y: centerY,
    };
    return point;
  });
}

function setPoints(filters) {
  points = filters.map((filter) => {
    return { x: filter.x, y: filter.y };
  });
}

function mainResize() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  resizeCanvas();
  drawFilter();
}

async function mainLoad() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  resizeCanvas();
  const result = await chrome.storage.local.get(["filters", "gain"]);
  if (
    result.filters == null ||
    result.filters == undefined ||
    result.filters.length == 0
  )
    initPoints();
  else setPoints(result.filters);

  if (result.gain != null && result.gain != undefined)
    document.getElementById("master-volume").value = result.gain;

  drawFilter();
}

window.addEventListener("resize", mainResize);
window.addEventListener("load", mainLoad);

canvas.addEventListener("mousedown", (e) => {
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  points.forEach((p, i) => {
    if (Math.hypot(p.x - mx, p.y - my) < pointRadius + 2) {
      dragIndex = i;
      return;
    }
  });
});

window.addEventListener("mouseup", () => {
  dragIndex = null;
});

function pointsToFilters(points) {
  const filters = points.map((p) => {
    return { freq: xToFrequency(p.x), gain: yToDb(p.y) / 2, x: p.x, y: p.y };
  });
  return filters;
}

canvas.addEventListener("mousemove", (e) => {
  if (dragIndex !== null) {
    const rect = canvas.getBoundingClientRect();
    let mx = e.clientX - rect.left;
    let my = e.clientY - rect.top;
    if (mx > 0) {
      mx = Math.max(0, Math.min(canvas.width, mx));
      my = Math.max(0, Math.min(canvas.height, my));
      points[dragIndex] = { x: mx, y: my };
      mainResize();
      chrome.storage.local.set({
        filters: pointsToFilters(points),
        enabled: true,
      });
    }
  }
});

document.getElementById("change-eq").addEventListener("click", () => {
  chrome.storage.local.get(["enabled"]).then((result) => {
    chrome.storage.local.set({ enabled: !result.enabled });
  });
});

chrome.storage.onChanged.addListener((ps) => {
  if (ps.enabled)
    if (!ps.enabled.newValue)
      document.getElementById("change-eq").textContent =
        "Enable eq on this tab";
    else
      document.getElementById("change-eq").textContent = "Stop eq on this tab";
});

document.getElementById("reset").addEventListener("click", () => {
  document.getElementById("master-volume").value = 0;
  initPoints();
  mainResize();
  pointsToFilters(points);
  chrome.storage.local.set({
    volume: 1,
    gain: 1,
    filters: pointsToFilters(points),
  });
});

const slider = document.getElementById("master-volume");
slider.oninput = () => {
  let volume = dbToGain(slider.value);
  chrome.storage.local.set({
    volume: volume,
    gain: slider.value,
    enabled: true,
  });
};
