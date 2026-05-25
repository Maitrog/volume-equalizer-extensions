let dragIndex = null;
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
const captureErrorPrefix = chrome.i18n.getMessage("capture_error_prefix");

const logMin = Math.log10(1);
const logMax = Math.log10(22000);
const MIN_POINT_COUNT = 5;
const MAX_POINT_COUNT = 9;
const DEFAULT_FILTER_Q = 0.5;
const MIN_FILTER_Q = 0.1;
const MAX_FILTER_Q = 10;
const DEFAULT_HIGHPASS_FREQ = 20;
const DEFAULT_LOWPASS_FREQ = 20000;

let pointCount = MIN_POINT_COUNT;
let currentTheme = DEFAULT_THEME;
let skipPointsResetConfirm = false;
let pendingPointCount = null;
let dragMode = null;
let qDragStartY = 0;
let qDragStartValue = DEFAULT_FILTER_Q;
