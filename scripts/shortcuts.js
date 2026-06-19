const SHORTCUT_ACTION_MUTE_NAME = "mute";
const SHORTCUT_ACTION_TOGGLE_EQ_NAME = "toggleEq";

const DEFAULT_SHORTCUTS = Object.freeze({
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
});

function normalizeShortcutKey(key) {
  if (typeof key !== "string") return null;

  const value = key.trim();
  if (/^[a-z0-9]$/i.test(value)) return value.toUpperCase();

  return null;
}

function normalizeShortcutCode(code) {
  if (typeof code !== "string") return null;

  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);

  return null;
}

function isModifierShortcutKey(key) {
  return ["Alt", "Control", "Shift", "Meta"].includes(key);
}

function isEditableShortcutTarget(target) {
  if (!target) return false;

  const element = target instanceof Element ? target : target.parentElement;
  if (!element) return false;

  return Boolean(
    element.closest(
      "input, textarea, select, [contenteditable=''], [contenteditable='true']"
    )
  );
}

function formatShortcut(shortcut) {
  if (!shortcut) return "";

  const parts = [];
  if (shortcut.ctrl) parts.push("Ctrl");
  if (shortcut.alt) parts.push("Alt");
  if (shortcut.shift) parts.push("Shift");
  if (shortcut.meta) parts.push("Meta");
  parts.push(shortcut.key);
  return parts.join("+");
}

function areShortcutsEqual(first, second) {
  return (
    first?.ctrl === second?.ctrl &&
    first?.alt === second?.alt &&
    first?.shift === second?.shift &&
    first?.meta === second?.meta &&
    first?.key === second?.key
  );
}

function normalizeShortcut(value) {
  if (!value) return null;

  const shortcut = {
    ctrl: value.ctrl === true,
    alt: value.alt === true,
    shift: value.shift === true,
    meta: value.meta === true,
    key: value.key,
  };

  if (!shortcut.key) return null;
  if (!shortcut.ctrl && !shortcut.alt && !shortcut.shift && !shortcut.meta) {
    return null;
  }

  return shortcut;
}

function normalizeShortcutFromKeyboardEvent(event) {
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
}

function resolveShortcuts(storedShortcuts) {
  const shortcuts = storedShortcuts ?? DEFAULT_SHORTCUTS;
  return {
    [SHORTCUT_ACTION_MUTE_NAME]: normalizeShortcut(
      shortcuts[SHORTCUT_ACTION_MUTE_NAME]
    ),
    [SHORTCUT_ACTION_TOGGLE_EQ_NAME]: normalizeShortcut(
      shortcuts[SHORTCUT_ACTION_TOGGLE_EQ_NAME]
    ),
  };
}

function validateShortcutConfig(shortcuts) {
  const muteShortcut = normalizeShortcut(
    shortcuts?.[SHORTCUT_ACTION_MUTE_NAME]
  );
  const toggleEqShortcut = normalizeShortcut(
    shortcuts?.[SHORTCUT_ACTION_TOGGLE_EQ_NAME]
  );

  if (!muteShortcut || !toggleEqShortcut) return "invalid";
  if (areShortcutsEqual(muteShortcut, toggleEqShortcut)) return "duplicate";

  return null;
}

function matchesShortcut(event, shortcut) {
  const normalized = normalizeShortcutFromKeyboardEvent(event);
  if (!normalized) return false;

  return areShortcutsEqual(normalized, shortcut);
}
