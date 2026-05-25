let points = [];
let highpassPoint = null;
let lowpassPoint = null;
const pointRadius = 3;

function savePointCount(count) {
  return chrome.storage.local.set({ pointCount: clampPointCount(count) });
}

function createPeakingFilterPoint(index, count = pointCount) {
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

function createPeakingFilterPoints(count = pointCount) {
  const actualCount = clampPointCount(count);
  return Array.from({ length: actualCount }, (_, i) => {
    return createPeakingFilterPoint(i, actualCount);
  });
}

function initPoints(count = pointCount) {
  pointCount = clampPointCount(count);
  points = createPeakingFilterPoints(pointCount);
  highpassPoint = createDefaultHighpassPoint();
  lowpassPoint = createDefaultLowpassPoint();
}

function setPoints(filters) {
  const peakingFilters = filters.filter((filter) => {
    return (filter.type ?? "peaking") === "peaking";
  });
  const highpassFilter = filters.find((filter) => filter.type === "highpass");
  const lowpassFilter = filters.find((filter) => filter.type === "lowpass");

  pointCount = clampPointCount(peakingFilters.length);
  savePointCount(pointCount);
  updatePointCountSelect(pointCount);
  highpassPoint = createDefaultHighpassPoint(highpassFilter);
  lowpassPoint = createDefaultLowpassPoint(lowpassFilter);
  points = peakingFilters.map((filter, index) => {
    const centeredPoint = createPeakingFilterPoint(index, pointCount);
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

  if (highpassPoint) {
    filters.push({
      type: "highpass",
      freq: xToFrequency(highpassPoint.x),
      gain: 0,
      q: ensureQFactor(highpassPoint.q),
      x: highpassPoint.x,
      y: highpassPoint.y,
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

  if (lowpassPoint) {
    filters.push({
      type: "lowpass",
      freq: xToFrequency(lowpassPoint.x),
      gain: 0,
      q: ensureQFactor(lowpassPoint.q),
      x: lowpassPoint.x,
      y: lowpassPoint.y,
    });
  }

  return filters;
}

function getDraggedPoint() {
  if (!dragIndex) return null;
  if (dragIndex.type === "highpass") return highpassPoint;
  if (dragIndex.type === "lowpass") return lowpassPoint;
  return points[dragIndex.index];
}

function setDraggedPoint(point) {
  if (!dragIndex) return;
  if (dragIndex.type === "highpass") {
    highpassPoint = point;
    return;
  }
  if (dragIndex.type === "lowpass") {
    lowpassPoint = point;
    return;
  }
  points[dragIndex.index] = point;
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
    highpassPoint &&
    Math.hypot(highpassPoint.x - x, highpassPoint.y - y) < pointRadius + 2
  ) {
    return { type: "highpass" };
  }

  if (
    lowpassPoint &&
    Math.hypot(lowpassPoint.x - x, lowpassPoint.y - y) < pointRadius + 2
  ) {
    return { type: "lowpass" };
  }

  return null;
}
