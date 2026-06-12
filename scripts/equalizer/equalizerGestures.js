canvas.addEventListener("mousedown", (e) => {
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  const dragTarget = getPointIndexAtPosition(mx, my);
  if (!dragTarget) return;

  g_dragIndex = dragTarget;
  g_dragMode = e.shiftKey ? "q" : "point";
  g_qDragStartY = my;
  g_qDragStartValue = ensureQFactor(getDraggedPoint().q);
  updateInfoTooltip(getDraggedPoint());
});

window.addEventListener("mouseup", () => {
  g_dragIndex = null;
  g_dragMode = null;
  hideinfoTooltip();
});

canvas.addEventListener("mousemove", async (e) => {
  if (g_dragIndex !== null) {
    const rect = canvas.getBoundingClientRect();
    let mx = e.clientX - rect.left;
    let my = e.clientY - rect.top;
    const currentPoint = getDraggedPoint();
    if (!currentPoint) return;

    if (g_dragMode === "q") {
      const dy = g_qDragStartY - my;
      const nextQ = g_qDragStartValue * Math.pow(2, dy / 40);
      const nextPoint = { ...currentPoint, q: ensureQFactor(nextQ) };
      setDraggedPoint(nextPoint);
      updateInfoTooltip(nextPoint);
      mainResize();
      refreshToolkitCaptureFilters();
      await saveCurrentFilters();
    } else if (mx > 0) {
      mx = Math.max(0, Math.min(canvas.width, mx));
      my = Math.max(0, Math.min(canvas.height, my));
      const y = g_dragIndex.type === "peaking" ? my : canvas.height / 2;
      const nextPoint = { ...currentPoint, x: mx, y: y };
      setDraggedPoint(nextPoint);
      updateInfoTooltip(nextPoint);
      mainResize();
      refreshToolkitCaptureFilters();
      await saveCurrentFilters();
    }
  }
});

canvas.addEventListener("dblclick", (e) => {
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  const pointTarget = getPointIndexAtPosition(mx, my);
  if (!pointTarget) return;

  if (pointTarget.type === "highpass") {
    g_highpassPoint = createDefaultHighpassPoint();
  } else if (pointTarget.type === "lowpass") {
    g_lowpassPoint = createDefaultLowpassPoint();
  } else {
    points[pointTarget.index] = createPeakingFilterPoint(
      pointTarget.index,
      points.length
    );
  }
  mainResize();
  refreshToolkitCaptureFilters();
  saveCurrentFilters();
});
