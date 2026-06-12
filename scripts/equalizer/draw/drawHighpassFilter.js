function drawHighpassFilter(canvas, audioCtx, freq, Q = 0.5) {
  const gainMargin = 20;
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  const canvasWidth = width - 10;

  const filter = audioCtx.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.value = freq;
  filter.Q.value = Q;

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

  ctx.strokeStyle = g_highpassFilterColor;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < numPoints; i++) {
    const db = Math.max(
      -80,
      25 * Math.log10(magResponse[i] || Number.EPSILON)
    );
    const y = height / 2 - (db / 25) * (height / 2 - gainMargin * 2);
    const x = i;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}
