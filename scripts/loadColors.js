let accentStart;
let accentMid;
let accentEnd;
let highpassFilterColor;
let lowpassFilterColor;
let panelBg;
let axis;

function loadColors() {
  const css = getComputedStyle(document.documentElement);
  accentStart = css.getPropertyValue("--accent-start").trim();
  accentMid = css.getPropertyValue("--accent-mid").trim();
  accentEnd = css.getPropertyValue("--accent-end").trim();
  highpassFilterColor = css.getPropertyValue("--highpass-filter").trim();
  lowpassFilterColor = css.getPropertyValue("--lowpass-filter").trim();
  panelBg = css.getPropertyValue("--panel-bg").trim();
  axis = css.getPropertyValue("--axis").trim();
}

loadColors();
