export type StorageKey = string;

type DynamicStorageKeyPart = number | string;

export const STORAGE_KEYS = {
  PRESETS: "presets",
  PRESET_NAMES: "presetNames",
  HIDE_DEFAULT_PRESETS: "hideDefaultPresets",
  AUTOSTART_RULES: "whitelist",
  GAIN: "gain",
  FILTERS: "filters",
  ENABLE_SPECTRUM: "enableSpectrum",
  THEME: "theme",
  UI_LANGUAGE: "uiLanguage",
  SHORTCUTS: "shortcuts",
  INSTALL_UPDATE_NOTICE: "installUpdateNotice",
  DONATION_REMINDER_AT: "donationReminderAt",
  TOOLKIT_WINDOW_ID: "toolkitWindowId",
  TOOLKIT_WINDOW_TAB_IDS: "toolkitWindowTabIds",
  TOOLKIT_WINDOW_ACTIVE_TAB_ID: "toolkitWindowActiveTabId",
  TOOLKIT_WINDOW_CAPTURE_STREAM_IDS: "toolkitWindowCaptureStreamIds",
  REGISTERED_TAB_IDS: "tabs",
  POINT_COUNT: "pointCount",
  SKIP_POINTS_CONFIRM: "skipPointsResetConfirm",
  tabFilters: (tabId: DynamicStorageKeyPart) => `filters.${tabId}`,
  tabEnabled: (tabId: DynamicStorageKeyPart) => `enabled.${tabId}`,
  tabMute: (tabId: DynamicStorageKeyPart) => `mute.${tabId}`,
  tabGain: (tabId: DynamicStorageKeyPart) => `gain.${tabId}`,
  tabVolume: (tabId: DynamicStorageKeyPart) => `volume.${tabId}`,
  tabPan: (tabId: DynamicStorageKeyPart) => `pan.${tabId}`,
  tabCaptureError: (tabId: DynamicStorageKeyPart) => `captureError.${tabId}`,
  tabSpectrum: (tabId: DynamicStorageKeyPart) => `spectrum.${tabId}`,
} as const;
