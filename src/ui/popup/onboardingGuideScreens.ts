export type GuideTarget =
  | "volumeMute"
  | "changeEq"
  | "settings"
  | "autostart"
  | "tabCapture"
  | "equalizer"
  | "volume"
  | "presets";

export interface GuideScreen {
  stage: number;
  kind: "language" | "appearance" | "shortcuts" | "spotlight";
  titleKey: string;
  messageKey?: string;
  additionalMessageKeys?: readonly string[];
  target?: GuideTarget;
  substep?: readonly [number, number];
}

export const GUIDE_SHORTCUTS = [
  ["shortcut_mute_label", "Alt+M"],
  ["shortcut_toggle_eq_label", "Alt+K"],
  ["shortcut_q_factor_label", "Shift+Drag"],
  ["shortcut_reset_point_label", "Double-click"],
] as const;

export const GUIDE_SCREENS: readonly GuideScreen[] = [
  { stage: 1, kind: "language", titleKey: "language_setting_option" },
  { stage: 2, kind: "appearance", titleKey: "settings_title" },
  {
    stage: 3,
    kind: "shortcuts",
    titleKey: "shortcuts_settings_title",
    messageKey: "guide_shortcuts_hint",
  },
  {
    stage: 4,
    kind: "spotlight",
    target: "volumeMute",
    titleKey: "volume_mute_button_tooltip",
    substep: [1, 2],
  },
  {
    stage: 4,
    kind: "spotlight",
    target: "changeEq",
    titleKey: "enable_eq_button_label",
    substep: [2, 2],
  },
  {
    stage: 5,
    kind: "spotlight",
    target: "settings",
    titleKey: "settings_button_tooltip",
    substep: [1, 3],
  },
  {
    stage: 5,
    kind: "spotlight",
    target: "autostart",
    titleKey: "add_to_autostart_tooltip",
    substep: [2, 3],
  },
  {
    stage: 5,
    kind: "spotlight",
    target: "tabCapture",
    titleKey: "tab_capture_mode_label",
    messageKey: "tab_capture_help",
    substep: [3, 3],
  },
  {
    stage: 6,
    kind: "spotlight",
    target: "equalizer",
    titleKey: "extName",
    messageKey: "guide_canvas_hint",
    additionalMessageKeys: [
      "q_factor_shift_hint",
      "point_double_click_hint",
      "guide_spectrum_visualization_hint",
    ],
  },
  {
    stage: 7,
    kind: "spotlight",
    target: "volume",
    titleKey: "global_controls_title",
    messageKey: "guide_volume_hint",
  },
  {
    stage: 8,
    kind: "spotlight",
    target: "presets",
    titleKey: "preset_controls_title",
    messageKey: "guide_presets_hint",
  },
];

export const getGuideNavigation = (index: number) => ({
  canGoBack: index > 0,
  canSkip: GUIDE_SCREENS[index].stage >= 4,
  isLast: index === GUIDE_SCREENS.length - 1,
});

export type GuideExitAction = "close" | "next" | "skip";

export const shouldCompleteGuide = (action: GuideExitAction, index: number): boolean =>
  action === "skip" || (action === "next" && getGuideNavigation(index).isLast);
