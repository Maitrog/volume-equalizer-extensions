let points = [];
const pointRadius = 3;

function drawPoints() {
  points.forEach((p) => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, pointRadius, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.strokeStyle = "#007bff";
    ctx.lineWidth = 2;
    ctx.stroke();
  });
  ctx.fillStyle = "#000";
}

function drawFilter() {
  drawPoints();

  if (points.length > 0) {
    const canvasWidth = canvas.width - 10;
    points.forEach((p) => {
      var freq = xToFrequency(p.x, canvasWidth);
      var db = yToDb(p.y);
      drawPeakingFilter(canvas, audioCtx, freq, 0.5, db);
    });
  }
}
