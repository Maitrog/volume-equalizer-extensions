function drawPeakingFilter(canvas, audioCtx, freq, Q = 1, gainDb = 0) {
  const gainMargin = 20;
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;

  const filter = audioCtx.createBiquadFilter();
  filter.type = "peaking";
  filter.frequency.value = freq;
  filter.Q.value = Q;
  filter.gain.value = gainDb;

  const numPoints = width;
  const frequencies = new Float32Array(numPoints);
  const magResponse = new Float32Array(numPoints);
  const phaseResponse = new Float32Array(numPoints);
  const fMin = 1;
  const fMax = audioCtx.sampleRate / 2;

  for (let i = 0; i < numPoints; i++) {
    const logF = Math.log(fMin) + (i / (numPoints - 1)) * Math.log(fMax / fMin);
    frequencies[i] = Math.exp(logF);
  }

  filter.getFrequencyResponse(frequencies, magResponse, phaseResponse);

  ctx.strokeStyle = "#007acc";
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
