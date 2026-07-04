export interface ThemeColors {
  accentStart: string;
  accentMid: string;
  accentEnd: string;
  highpassFilterColor: string;
  lowpassFilterColor: string;
  panelBg: string;
  axis: string;
}

export const readThemeColors = (
  element: Element = document.documentElement,
): ThemeColors => {
  const css = getComputedStyle(element);

  return {
    accentStart: css.getPropertyValue("--accent-start").trim(),
    accentMid: css.getPropertyValue("--accent-mid").trim(),
    accentEnd: css.getPropertyValue("--accent-end").trim(),
    highpassFilterColor: css.getPropertyValue("--highpass-filter").trim(),
    lowpassFilterColor: css.getPropertyValue("--lowpass-filter").trim(),
    panelBg: css.getPropertyValue("--panel-bg").trim(),
    axis: css.getPropertyValue("--axis").trim(),
  };
};
