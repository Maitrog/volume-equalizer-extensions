let points = [];
let g_highpassPoint = null;
let g_lowpassPoint = null;
const pointRadius = 3;

function savePointCount(count) {
  return chrome.storage.local.set({ g_pointCount: clampPointCount(count) });
}

function createPeakingFilterPoint(index, count = g_pointCount) {
  const actualCount = clampPointCount(count);
  const centerY = canvas.height / 2;
  const pointStep = canvas.width / (actualCount + 1);
  return { x: pointStep * (index + 1), y: centerY, q: DEFAULT_FILTER_Q };
}

function createCrossoverPoint(freq, filter = {}) {
  return {
    x: Number.isFinite(Number(filter.x))
      ? Number(filter.x)
      : frequencyToX(Number(filter.freq ?? freq)),
    y: canvas.height / 2,
    q: ensureQFactor(filter.q),
  };
}

function createDefaultHighpassPoint(filter = {}) {
  return createCrossoverPoint(DEFAULT_HIGHPASS_FREQ, filter);
}

function createDefaultLowpassPoint(filter = {}) {
  return createCrossoverPoint(DEFAULT_LOWPASS_FREQ, filter);
}

function createPeakingFilterPoints(count = g_pointCount) {
  const actualCount = clampPointCount(count);
  return Array.from({ length: actualCount }, (_, i) => {
    return createPeakingFilterPoint(i, actualCount);
  });
}

function initPoints(count = g_pointCount) {
  g_pointCount = clampPointCount(count);
  points = createPeakingFilterPoints(g_pointCount);
  g_highpassPoint = createDefaultHighpassPoint();
  g_lowpassPoint = createDefaultLowpassPoint();
}

function setPoints(filters) {
  const peakingFilters = filters.filter((filter) => {
    return (filter.type ?? "peaking") === "peaking";
  });
  const highpassFilter = filters.find((filter) => filter.type === "highpass");
  const lowpassFilter = filters.find((filter) => filter.type === "lowpass");

  g_pointCount = clampPointCount(peakingFilters.length);
  savePointCount(g_pointCount);
  updatePointCountSelect(g_pointCount);
  g_highpassPoint = createDefaultHighpassPoint(highpassFilter);
  g_lowpassPoint = createDefaultLowpassPoint(lowpassFilter);
  points = peakingFilters.map((filter, index) => {
    const centeredPoint = createPeakingFilterPoint(index, g_pointCount);
    const freq = filter.freq;
    const gain = filter.gain;
    const x = Number.isFinite(Number(filter.x))
      ? Number(filter.x)
      : Number.isFinite(Number(freq))
      ? frequencyToX(Number(freq))
      : centeredPoint.x;
    const y = Number.isFinite(Number(filter.y))
      ? Number(filter.y)
      : Number.isFinite(Number(gain))
      ? canvas.height / 2 - (Number(gain) / 25) * (canvas.height / 2 - 20)
      : centeredPoint.y;

    return { x: x, y: y, q: ensureQFactor(filter.q) };
  });
}

function hasCrossoverFilters(filters) {
  return (
    filters.some((filter) => filter.type === "highpass") &&
    filters.some((filter) => filter.type === "lowpass")
  );
}

function pointsToFilters(points) {
  const filters = [];

  if (g_highpassPoint) {
    filters.push({
      type: "highpass",
      freq: xToFrequency(g_highpassPoint.x),
      gain: 0,
      q: ensureQFactor(g_highpassPoint.q),
      x: g_highpassPoint.x,
      y: g_highpassPoint.y,
    });
  }

  points.forEach((p) => {
    filters.push({
      type: "peaking",
      freq: xToFrequency(p.x),
      gain: yToDb(p.y),
      q: ensureQFactor(p.q),
      x: p.x,
      y: p.y,
    });
  });

  if (g_lowpassPoint) {
    filters.push({
      type: "lowpass",
      freq: xToFrequency(g_lowpassPoint.x),
      gain: 0,
      q: ensureQFactor(g_lowpassPoint.q),
      x: g_lowpassPoint.x,
      y: g_lowpassPoint.y,
    });
  }

  return filters;
}

function getDraggedPoint() {
  if (!g_dragIndex) return null;
  if (g_dragIndex.type === "highpass") return g_highpassPoint;
  if (g_dragIndex.type === "lowpass") return g_lowpassPoint;
  return points[g_dragIndex.index];
}

function setDraggedPoint(point) {
  if (!g_dragIndex) return;
  if (g_dragIndex.type === "highpass") {
    g_highpassPoint = point;
    return;
  }
  if (g_dragIndex.type === "lowpass") {
    g_lowpassPoint = point;
    return;
  }
  points[g_dragIndex.index] = point;
}

function getPointIndexAtPosition(x, y) {
  const peakingIndex = points.findIndex((p) => {
    return Math.hypot(p.x - x, p.y - y) < pointRadius + 2;
  });

  if (peakingIndex !== -1) {
    return {
      type: "peaking",
      index: peakingIndex,
    };
  }

  if (
    g_highpassPoint &&
    Math.hypot(g_highpassPoint.x - x, g_highpassPoint.y - y) < pointRadius + 2
  ) {
    return { type: "highpass" };
  }

  if (
    g_lowpassPoint &&
    Math.hypot(g_lowpassPoint.x - x, g_lowpassPoint.y - y) < pointRadius + 2
  ) {
    return { type: "lowpass" };
  }

  return null;
}
