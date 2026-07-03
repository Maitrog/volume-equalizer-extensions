export const RUNTIME_MESSAGES = {
  LOG: "log",
  ENABLE_WINDOW_MODE: "enableWindowMode",
  GET_CAPTURED_TABS: "getCapturedTabs",
  SPECTRUM_FRAME: "spectrum-frame",
  GET_TAB_ID: "getTabId",
  PAGE_STARTED: "pageStarted",
  CONNECTED: "connected",
  DISCONNECTED: "disconnected",
  CLEAR_STORAGE: "clearStorage",
} as const;

export type RuntimeMessageMethod =
  (typeof RUNTIME_MESSAGES)[keyof typeof RUNTIME_MESSAGES];

export interface RuntimeMessage {
  method: RuntimeMessageMethod;
  payload?: unknown;
}
