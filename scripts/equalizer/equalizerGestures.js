canvas.addEventListener("mousedown", (e) => {
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  const dragTarget = getPointIndexAtPosition(mx, my);
  if (!dragTarget) return;

  dragIndex = dragTarget;
  dragMode = e.shiftKey ? "q" : "point";
  qDragStartY = my;
  qDragStartValue = ensureQFactor(getDraggedPoint().q);
  updateInfoTooltip(getDraggedPoint());
});

window.addEventListener("mouseup", () => {
  dragIndex = null;
  dragMode = null;
  hideinfoTooltip();
});

canvas.addEventListener("mousemove", async (e) => {
  if (dragIndex !== null) {
    const rect = canvas.getBoundingClientRect();
    let mx = e.clientX - rect.left;
    let my = e.clientY - rect.top;
    const currentPoint = getDraggedPoint();
    if (!currentPoint) return;

    if (dragMode === "q") {
      const dy = qDragStartY - my;
      const nextQ = qDragStartValue * Math.pow(2, dy / 40);
      const nextPoint = { ...currentPoint, q: ensureQFactor(nextQ) };
      setDraggedPoint(nextPoint);
      updateInfoTooltip(nextPoint);
      mainResize();
      refreshToolkitCaptureFilters();
      await saveCurrentFilters();
    } else if (mx > 0) {
      mx = Math.max(0, Math.min(canvas.width, mx));
      my = Math.max(0, Math.min(canvas.height, my));
      const y = dragIndex.type === "peaking" ? my : canvas.height / 2;
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
    highpassPoint = createDefaultHighpassPoint();
  } else if (pointTarget.type === "lowpass") {
    lowpassPoint = createDefaultLowpassPoint();
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
