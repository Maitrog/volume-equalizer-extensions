function drawPoints() {
  points.forEach((p) => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, pointRadius, 0, Math.PI * 2);
    ctx.fillStyle = panelBg;
    ctx.fill();
    ctx.strokeStyle = g_accentMid;
    ctx.lineWidth = 2;
    ctx.stroke();
  });

  drawTypedPoint(g_highpassPoint, g_highpassFilterColor);
  drawTypedPoint(g_lowpassPoint, g_lowpassFilterColor);
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

  if (g_highpassPoint) {
    const canvasWidth = canvas.width - 10;
    const freq = xToFrequency(g_highpassPoint.x, canvasWidth);
    drawHighpassFilter(canvas, audioCtx, freq, ensureQFactor(g_highpassPoint.q));
  }

  if (points.length > 0) {
    const canvasWidth = canvas.width - 10;
    points.forEach((p) => {
      const freq = xToFrequency(p.x, canvasWidth);
      const db = yToDb(p.y);
      drawPeakingFilter(canvas, audioCtx, freq, ensureQFactor(p.q), db);
    });
  }

  if (g_lowpassPoint) {
    const canvasWidth = canvas.width - 10;
    const freq = xToFrequency(g_lowpassPoint.x, canvasWidth);
    drawLowpassFilter(canvas, audioCtx, freq, ensureQFactor(g_lowpassPoint.q));
  }
}
