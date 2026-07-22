export const SHORTCUT_ACTION_MUTE_NAME = "mute";
export const SHORTCUT_ACTION_TOGGLE_EQ_NAME = "toggleEq";

export interface Shortcut {
  alt: boolean;
  ctrl: boolean;
  shift: boolean;
  meta: boolean;
  key: string;
}

export type ShortcutActionName =
  | typeof SHORTCUT_ACTION_MUTE_NAME
  | typeof SHORTCUT_ACTION_TOGGLE_EQ_NAME;
export type ShortcutMap = Record<ShortcutActionName, Shortcut | null>;
export type ShortcutValidationError = "invalid" | "duplicate";

export const DEFAULT_SHORTCUTS = Object.freeze({
  [SHORTCUT_ACTION_MUTE_NAME]: Object.freeze({
    alt: true,
    ctrl: false,
    shift: false,
    meta: false,
    key: "M",
  }),
  [SHORTCUT_ACTION_TOGGLE_EQ_NAME]: Object.freeze({
    alt: true,
    ctrl: false,
    shift: false,
    meta: false,
    key: "K",
  }),
}) as ShortcutMap;

interface ShortcutLike {
  alt?: unknown;
  ctrl?: unknown;
  shift?: unknown;
  meta?: unknown;
  key?: unknown;
}

export const normalizeShortcutKey = (key: unknown): string | null => {
  if (typeof key !== "string") return null;

  const value = key.trim();
  if (/^[a-z0-9]$/i.test(value)) return value.toUpperCase();

  return null;
};

export const normalizeShortcutCode = (code: unknown): string | null => {
  if (typeof code !== "string") return null;

  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);

  return null;
};

export const isModifierShortcutKey = (key: string): boolean => {
  return ["Alt", "Control", "Shift", "Meta"].includes(key);
};

export const isEditableShortcutTarget = (target: EventTarget | null): boolean => {
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
      "input, textarea, select, [contenteditable=''], [contenteditable='true']"
    )
  );
};

export const formatShortcut = (shortcut: Shortcut | null): string => {
  if (!shortcut) return "";

  const parts = [];
  if (shortcut.ctrl) parts.push("Ctrl");
  if (shortcut.alt) parts.push("Alt");
  if (shortcut.shift) parts.push("Shift");
  if (shortcut.meta) parts.push("Meta");
  parts.push(shortcut.key);
  return parts.join("+");
};

export const areShortcutsEqual = (
  first: Shortcut | null | undefined,
  second: Shortcut | null | undefined
): boolean => {
  return (
    first?.ctrl === second?.ctrl &&
    first?.alt === second?.alt &&
    first?.shift === second?.shift &&
    first?.meta === second?.meta &&
    first?.key === second?.key
  );
};

export const normalizeShortcut = (value: unknown): Shortcut | null => {
  if (!value || typeof value !== "object") return null;

  const shortcutValue = value as ShortcutLike;
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

export const normalizeShortcutFromKeyboardEvent = (
  event: KeyboardEvent | null | undefined
): Shortcut | null => {
  if (!event || event.isComposing) return null;
  const key =
    normalizeShortcutCode(event.code) ?? normalizeShortcutKey(event.key);

  return normalizeShortcut({
    ctrl: event.ctrlKey,
    alt: event.altKey,
    shift: event.shiftKey,
    meta: event.metaKey,
    key,
  });
};

export const resolveShortcuts = (
  storedShortcuts: Partial<ShortcutMap> | null | undefined
): ShortcutMap => {
  const shortcuts = storedShortcuts ?? DEFAULT_SHORTCUTS;
  return {
    [SHORTCUT_ACTION_MUTE_NAME]: normalizeShortcut(
      shortcuts[SHORTCUT_ACTION_MUTE_NAME]
    ),
    [SHORTCUT_ACTION_TOGGLE_EQ_NAME]: normalizeShortcut(
      shortcuts[SHORTCUT_ACTION_TOGGLE_EQ_NAME]
    ),
  };
};

export const validateShortcutConfig = (
  shortcuts: Partial<ShortcutMap> | null | undefined
): ShortcutValidationError | null => {
  const muteShortcut = normalizeShortcut(
    shortcuts?.[SHORTCUT_ACTION_MUTE_NAME]
  );
  const toggleEqShortcut = normalizeShortcut(
    shortcuts?.[SHORTCUT_ACTION_TOGGLE_EQ_NAME]
  );

  if (!muteShortcut || !toggleEqShortcut) return "invalid";
  if (areShortcutsEqual(muteShortcut, toggleEqShortcut)) return "duplicate";

  return null;
};

export const matchesShortcut = (
  event: KeyboardEvent,
  shortcut: Shortcut | null
): boolean => {
  const normalized = normalizeShortcutFromKeyboardEvent(event);
  if (!normalized) return false;

  return areShortcutsEqual(normalized, shortcut);
};
