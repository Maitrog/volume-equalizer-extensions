export const POPUP_SHORTCUT_ACTION_MUTE_NAME = "mute";
export const POPUP_SHORTCUT_ACTION_TOGGLE_EQ_NAME = "toggleEq";

export interface PopupShortcut {
  alt: boolean;
  ctrl: boolean;
  shift: boolean;
  meta: boolean;
  key: string;
}

export type PopupShortcutActionName =
  | typeof POPUP_SHORTCUT_ACTION_MUTE_NAME
  | typeof POPUP_SHORTCUT_ACTION_TOGGLE_EQ_NAME;

export type PopupShortcutMap = Record<PopupShortcutActionName, PopupShortcut | null>;
export type PopupShortcutValidationError = "invalid" | "duplicate";

export const POPUP_DEFAULT_SHORTCUTS = Object.freeze({
  [POPUP_SHORTCUT_ACTION_MUTE_NAME]: Object.freeze({
    alt: true,
    ctrl: false,
    shift: false,
    meta: false,
    key: "M",
  }),
  [POPUP_SHORTCUT_ACTION_TOGGLE_EQ_NAME]: Object.freeze({
    alt: true,
    ctrl: false,
    shift: false,
    meta: false,
    key: "K",
  }),
}) as PopupShortcutMap;

interface PopupShortcutLike {
  alt?: unknown;
  ctrl?: unknown;
  shift?: unknown;
  meta?: unknown;
  key?: unknown;
}

export const normalizePopupShortcutKey = (key: unknown): string | null => {
  if (typeof key !== "string") return null;

  const value = key.trim();
  if (/^[a-z0-9]$/i.test(value)) return value.toUpperCase();

  return null;
};

export const normalizePopupShortcutCode = (code: unknown): string | null => {
  if (typeof code !== "string") return null;

  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);

  return null;
};

export const isPopupModifierShortcutKey = (key: string): boolean => {
  return ["Alt", "Control", "Shift", "Meta"].includes(key);
};

export const isPopupEditableShortcutTarget = (
  target: EventTarget | null,
): boolean => {
  if (!target) return false;

  const element =
    typeof Element !== "undefined" && target instanceof Element
      ? target
      : typeof Element !== "undefined" &&
          "parentElement" in target &&
          target.parentElement instanceof Element
        ? target.parentElement
        : null;
  if (!element) return false;

  return Boolean(
    element.closest(
      "input, textarea, select, [contenteditable=''], [contenteditable='true']",
    ),
  );
};

export const formatPopupShortcut = (shortcut: PopupShortcut | null): string => {
  if (!shortcut) return "";

  const parts = [];
  if (shortcut.ctrl) parts.push("Ctrl");
  if (shortcut.alt) parts.push("Alt");
  if (shortcut.shift) parts.push("Shift");
  if (shortcut.meta) parts.push("Meta");
  parts.push(shortcut.key);
  return parts.join("+");
};

export const arePopupShortcutsEqual = (
  first: PopupShortcut | null | undefined,
  second: PopupShortcut | null | undefined,
): boolean => {
  return (
    first?.ctrl === second?.ctrl &&
    first?.alt === second?.alt &&
    first?.shift === second?.shift &&
    first?.meta === second?.meta &&
    first?.key === second?.key
  );
};

export const normalizePopupShortcut = (value: unknown): PopupShortcut | null => {
  if (!value || typeof value !== "object") return null;

  const shortcutValue = value as PopupShortcutLike;
  const shortcut = {
    ctrl: shortcutValue.ctrl === true,
    alt: shortcutValue.alt === true,
    shift: shortcutValue.shift === true,
    meta: shortcutValue.meta === true,
    key: typeof shortcutValue.key === "string" ? shortcutValue.key : "",
  };

  if (!shortcut.key) return null;
  if (!shortcut.ctrl && !shortcut.alt && !shortcut.shift && !shortcut.meta) {
    return null;
  }

  return shortcut;
};

export const normalizePopupShortcutFromKeyboardEvent = (
  event: KeyboardEvent | null | undefined,
): PopupShortcut | null => {
  if (!event || event.isComposing) return null;
  const key =
    normalizePopupShortcutCode(event.code) ?? normalizePopupShortcutKey(event.key);

  return normalizePopupShortcut({
    ctrl: event.ctrlKey,
    alt: event.altKey,
    shift: event.shiftKey,
    meta: event.metaKey,
    key,
  });
};

export const resolvePopupShortcuts = (
  storedShortcuts: Partial<PopupShortcutMap> | null | undefined,
): PopupShortcutMap => {
  const shortcuts = storedShortcuts ?? POPUP_DEFAULT_SHORTCUTS;
  return {
    [POPUP_SHORTCUT_ACTION_MUTE_NAME]: normalizePopupShortcut(
      shortcuts[POPUP_SHORTCUT_ACTION_MUTE_NAME],
    ),
    [POPUP_SHORTCUT_ACTION_TOGGLE_EQ_NAME]: normalizePopupShortcut(
      shortcuts[POPUP_SHORTCUT_ACTION_TOGGLE_EQ_NAME],
    ),
  };
};

export const validatePopupShortcutConfig = (
  shortcuts: Partial<PopupShortcutMap> | null | undefined,
): PopupShortcutValidationError | null => {
  const muteShortcut = normalizePopupShortcut(
    shortcuts?.[POPUP_SHORTCUT_ACTION_MUTE_NAME],
  );
  const toggleEqShortcut = normalizePopupShortcut(
    shortcuts?.[POPUP_SHORTCUT_ACTION_TOGGLE_EQ_NAME],
  );

  if (!muteShortcut || !toggleEqShortcut) return "invalid";
  if (arePopupShortcutsEqual(muteShortcut, toggleEqShortcut)) return "duplicate";

  return null;
};

export const matchesPopupShortcut = (
  event: KeyboardEvent,
  shortcut: PopupShortcut | null,
): boolean => {
  const normalized = normalizePopupShortcutFromKeyboardEvent(event);
  if (!normalized) return false;

  return arePopupShortcutsEqual(normalized, shortcut);
};
