let g_dragIndex = null;
const canvas = document.getElementById("eq-canvas");
const ctx = canvas.getContext("2d", { alpha: true });
const infoTooltip = document.getElementById("info-tooltip");
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

const THEME_KEY = "theme";
const DEFAULT_THEME = "dark";
const SKIP_POINTS_CONFIRM_KEY = "skipPointsResetConfirm";
const POINT_COUNT_KEY = "pointCount";
const INSTALL_UPDATE_NOTICE_KEY = "installUpdateNotice";
const captureErrorElem = document.getElementById("capture-error");

const logMin = Math.log10(1);
const logMax = Math.log10(22000);
const MIN_POINT_COUNT = 5;
const MAX_POINT_COUNT = 9;
const DEFAULT_FILTER_Q = 0.5;
const MIN_FILTER_Q = 0.1;
const MAX_FILTER_Q = 10;
const DEFAULT_HIGHPASS_FREQ = 20;
const DEFAULT_LOWPASS_FREQ = 20000;

let g_pointCount = MIN_POINT_COUNT;
let g_currentTheme = DEFAULT_THEME;
let g_skipPointsResetConfirm = false;
let g_pendingPointCount = null;
let g_dragMode = null;
let g_qDragStartY = 0;
let g_qDragStartValue = DEFAULT_FILTER_Q;
