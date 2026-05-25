function drawPoints() {
  points.forEach((p) => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, pointRadius, 0, Math.PI * 2);
    ctx.fillStyle = panelBg;
    ctx.fill();
    ctx.strokeStyle = accentMid;
    ctx.lineWidth = 2;
    ctx.stroke();
  });

  drawTypedPoint(highpassPoint, highpassFilterColor);
  drawTypedPoint(lowpassPoint, lowpassFilterColor);
}

function drawTypedPoint(point, color) {
  if (!point) return;

  ctx.beginPath();
  ctx.arc(point.x, point.y, pointRadius, 0, Math.PI * 2);
  ctx.fillStyle = panelBg;
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.stroke();
}

function drawFilter() {
  drawPoints();

  if (highpassPoint) {
    const canvasWidth = canvas.width - 10;
    const freq = xToFrequency(highpassPoint.x, canvasWidth);
    drawHighpassFilter(canvas, audioCtx, freq, ensureQFactor(highpassPoint.q));
  }

  if (points.length > 0) {
    const canvasWidth = canvas.width - 10;
    points.forEach((p) => {
      const freq = xToFrequency(p.x, canvasWidth);
      const db = yToDb(p.y);
      drawPeakingFilter(canvas, audioCtx, freq, ensureQFactor(p.q), db);
    });
  }

  if (lowpassPoint) {
    const canvasWidth = canvas.width - 10;
    const freq = xToFrequency(lowpassPoint.x, canvasWidth);
    drawLowpassFilter(canvas, audioCtx, freq, ensureQFactor(lowpassPoint.q));
  }
}
