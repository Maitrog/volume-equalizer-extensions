import type { EqualizerFilter } from "../../domains/equalizer/types";

export const RUNTIME_MESSAGES = {
  LOG: "log",
  GET_CAPTURED_TABS: "getCapturedTabs",
  SPECTRUM_FRAME: "spectrum-frame",
  GET_TAB_ID: "getTabId",
  IS_TOOLKIT_CAPTURED: "isToolkitCaptured",
  TOOLKIT_SHORTCUT: "toolkitShortcut",
  PAGE_STARTED: "pageStarted",
  CONNECTED: "connected",
  DISCONNECTED: "disconnected",
  CLEAR_STORAGE: "clearStorage",
  CONTENT_SCRIPT_PING: "contentScriptPing",
  SPECTRUM_READY: "spectrum-ready",
  SET_SPECTRUM_DEMAND: "set-spectrum-demand",
  CAPTURE_START: "capture-start",
  CAPTURE_STOP: "capture-stop",
  CAPTURE_SETTINGS: "capture-settings",
  CAPTURE_LIST: "capture-list",
  CAPTURE_SPECTRUM_DEMAND: "capture-spectrum-demand",
  CAPTURE_ENDED: "capture-ended",
  START_TAB_CAPTURE: "start-tab-capture",
  STOP_TAB_CAPTURE: "stop-tab-capture",
  TOGGLE_CAPTURE_ENABLED: "toggle-capture-enabled",
  CAPTURE_MODE_CHANGED: "capture-mode-changed",
} as const;

export type RuntimeMessageMethod = (typeof RUNTIME_MESSAGES)[keyof typeof RUNTIME_MESSAGES];

export interface RuntimeMessage {
  method: RuntimeMessageMethod;
  payload?: unknown;
}

export interface CaptureSettings {
  enabled: boolean;
  gainValue: number;
  muted: boolean;
  volumeCompensationEnabled: boolean;
  filterSettings: EqualizerFilter[];
}

export interface CaptureState {
  tabId: number;
  settings: CaptureSettings;
}

export type OffscreenCommand =
  | {
      target: "offscreen";
      method: "capture-start";
      tabId: number;
      streamId: string;
      settings: CaptureSettings;
    }
  | { target: "offscreen"; method: "capture-stop"; tabId: number }
  | { target: "offscreen"; method: "capture-settings"; tabId: number; settings: CaptureSettings }
  | { target: "offscreen"; method: "capture-list" }
  | { target: "offscreen"; method: "capture-spectrum-demand"; tabId: number; enabled: boolean };

export type CaptureReply = { ok: true; captures: CaptureState[] } | { ok: false; error: string };

export const SPECTRUM_PORT_NAME = "eq-spectrum";

export interface SpectrumMetaPayload {
  type: "meta";
  sampleRate: number;
  fftSize: number;
  minDb: number;
  maxDb: number;
  frequencyBinCount: number;
}

export interface SpectrumDataPayload {
  type: "spectrum";
  buffer: number[] | null;
  clipping: boolean;
}

export type SpectrumPayload = SpectrumMetaPayload | SpectrumDataPayload;

export interface SpectrumSubscribeMessage {
  type: "subscribe";
  tabId: number;
}

export type SpectrumSource = { kind: "content"; frameId: number } | { kind: "capture" };

export interface RelayedSpectrumMessage {
  tabId: number;
  source: SpectrumSource;
  payload: SpectrumPayload;
}

export const isSameSpectrumSource = (a: SpectrumSource, b: SpectrumSource): boolean =>
  a.kind === "capture" ? b.kind === "capture" : b.kind === "content" && a.frameId === b.frameId;

export const normalizeSpectrumPayload = (value: unknown): SpectrumPayload | null => {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  if (candidate.type === "meta") {
    const numbers = [
      candidate.sampleRate,
      candidate.fftSize,
      candidate.minDb,
      candidate.maxDb,
      candidate.frequencyBinCount,
    ];
    if (!numbers.every((number) => typeof number === "number" && Number.isFinite(number))) {
      return null;
    }
    if (
      !Number.isInteger(candidate.fftSize) ||
      (candidate.fftSize as number) <= 0 ||
      !Number.isInteger(candidate.frequencyBinCount) ||
      (candidate.frequencyBinCount as number) <= 0 ||
      (candidate.maxDb as number) <= (candidate.minDb as number)
    ) {
      return null;
    }
    return {
      type: "meta",
      sampleRate: candidate.sampleRate as number,
      fftSize: candidate.fftSize as number,
      minDb: candidate.minDb as number,
      maxDb: candidate.maxDb as number,
      frequencyBinCount: candidate.frequencyBinCount as number,
    };
  }

  if (candidate.type !== "spectrum" || typeof candidate.clipping !== "boolean") {
    return null;
  }
  if (candidate.buffer === null) {
    return { type: "spectrum", buffer: null, clipping: candidate.clipping };
  }
  const isTypedArray =
    ArrayBuffer.isView(candidate.buffer) &&
    typeof (candidate.buffer as { length?: unknown }).length === "number";
  if (!Array.isArray(candidate.buffer) && !isTypedArray) return null;
  const buffer = Array.from(candidate.buffer as ArrayLike<unknown>);
  if (!buffer.every((number) => typeof number === "number" && Number.isFinite(number))) {
    return null;
  }
  return {
    type: "spectrum",
    buffer: buffer as number[],
    clipping: candidate.clipping,
  };
};

export const TOOLKIT_SHORTCUT_ACTIONS = {
  MUTE: "mute",
  TOGGLE_EQ: "toggleEq",
} as const;

export type ToolkitShortcutAction =
  (typeof TOOLKIT_SHORTCUT_ACTIONS)[keyof typeof TOOLKIT_SHORTCUT_ACTIONS];
