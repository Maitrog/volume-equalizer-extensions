function hideinfoTooltip() {
  if (!infoTooltip) return;
  infoTooltip.style.display = "none";
}

function getPointTooltipText(point) {
  if (dragMode === "q") return `Q ${ensureQFactor(point.q).toFixed(2)}`;
  return `${Math.round(xToFrequency(point.x))} Hz`;
}

function updateInfoTooltip(point) {
  if (!infoTooltip || !point) return;

  infoTooltip.textContent = getPointTooltipText(point);
  infoTooltip.style.display = "block";

  const tooltipWidth = infoTooltip.offsetWidth;
  const tooltipHeight = infoTooltip.offsetHeight;
  const margin = 6;
  const offset = 12;
  const maxLeft = canvas.clientWidth - tooltipWidth - margin;
  const maxTop = canvas.clientHeight - tooltipHeight - margin;
  const left = Math.max(margin, Math.min(maxLeft, point.x + offset));
  const top = Math.max(
    margin,
    Math.min(maxTop, point.y - tooltipHeight - offset)
  );

  infoTooltip.style.transform = `translate(${left}px, ${top}px)`;
}
