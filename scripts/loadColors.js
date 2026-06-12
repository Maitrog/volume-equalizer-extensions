let g_accentStart;
let g_accentMid;
let g_accentEnd;
let g_highpassFilterColor;
let g_lowpassFilterColor;
let panelBg;
let axis;

function loadColors() {
  const css = getComputedStyle(document.documentElement);
  g_accentStart = css.getPropertyValue("--accent-start").trim();
  g_accentMid = css.getPropertyValue("--accent-mid").trim();
  g_accentEnd = css.getPropertyValue("--accent-end").trim();
  g_highpassFilterColor = css.getPropertyValue("--highpass-filter").trim();
  g_lowpassFilterColor = css.getPropertyValue("--lowpass-filter").trim();
  panelBg = css.getPropertyValue("--panel-bg").trim();
  axis = css.getPropertyValue("--axis").trim();
}

loadColors();
