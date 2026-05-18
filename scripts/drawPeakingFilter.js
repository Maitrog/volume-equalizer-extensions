let accentStart;
let accentMid;
let accentEnd;
let panelBg;
let axis;

function loadColors() {
  const css = getComputedStyle(document.documentElement);
  accentStart = css.getPropertyValue("--accent-start").trim();
  accentMid = css.getPropertyValue("--accent-mid").trim();
  accentEnd = css.getPropertyValue("--accent-end").trim();
  panelBg = css.getPropertyValue("--panel-bg").trim();
  axis = css.getPropertyValue("--axis").trim();
}

loadColors();

function drawPeakingFilter(canvas, audioCtx, freq, Q = 1, gainDb = 0) {
  const gainMargin = 20;
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  const canvasWidth = width - 10;

  const filter = audioCtx.createBiquadFilter();
  filter.type = "peaking";
  filter.frequency.value = freq;
  filter.Q.value = Q;
  filter.gain.value = gainDb;

  const numPoints = width;
  const frequencies = new Float32Array(numPoints);
  const magResponse = new Float32Array(numPoints);
  const phaseResponse = new Float32Array(numPoints);
  const maxResponseFrequency = audioCtx.sampleRate / 2;

  for (let i = 0; i < numPoints; i++) {
    frequencies[i] = Math.min(
      xToFrequency(i, canvasWidth),
      maxResponseFrequency
    );
  }

  filter.getFrequencyResponse(frequencies, magResponse, phaseResponse);

  const grad = ctx.createLinearGradient(0, 0, canvas.width, 0);
  grad.addColorStop(0, accentStart);
  grad.addColorStop(0.5, accentMid);
  grad.addColorStop(1, accentEnd);
  ctx.strokeStyle = grad;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < numPoints; i++) {
    const db = 25 * Math.log10(magResponse[i]);
    const y = height / 2 - (db / 25) * (height / 2 - gainMargin * 2);
    const x = i;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}
