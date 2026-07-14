const fs = require("fs");
const path = require("path");

const LOCALES_DIR = path.join(__dirname, "..", "_locales");
const FONT_SIZE_PX = 14;
const TAMIL_CLUSTER_WIDTH_PX = 12;
const TAMIL_WIDE_CLUSTER_WIDTH_PX = 16;
const TAMIL_ZERO_CLUSTER_WIDTH_PX = 0;
const NARROW_LATIN_WIDTH_PX = 3;
const NARROW_LATIN_T_WIDTH_PX = 4;

const MESSAGE_LIMITS = {
  empty_preset_name: {
    maxWidthPx: 125,
    maxLines: 1,
    target: "#presets-toggle",
  },
  save_preset_button_label: {
    maxWidthPx: 124,
    maxLines: 1,
    target: "#save-preset",
  },
  reset_button_label: {
    maxWidthPx: 86,
    maxLines: 1,
    target: "#reset",
  },
};

const CJK_OR_THAI_PATTERN =
  /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af\u0e00-\u0e7f]/u;
const TAMIL_WIDE_VOWEL_SIGNS_PATTERN =
  /[\u0b8a\u0b94\u0ba3\u0ba9\u0bb7-\u0bb9\u0bc6-\u0bc8\u0bca-\u0bcc\u0bf5-\u0bf8]/u;
const TAMIL_ZERO_VOWEL_SIGNS_PATTERN = /[\u0b82\u0bc0\u0bcd]/u;

const SCRIPT_PATTERNS = {
  arabic: /\p{Script=Arabic}/u,
  bengali: /\p{Script=Bengali}/u,
  cyrillic: /\p{Script=Cyrillic}/u,
  devanagari: /\p{Script=Devanagari}/u,
  ethiopic: /\p{Script=Ethiopic}/u,
  greek: /\p{Script=Greek}/u,
  gujarati: /\p{Script=Gujarati}/u,
  han: /\p{Script=Han}/u,
  hangul: /\p{Script=Hangul}/u,
  hebrew: /\p{Script=Hebrew}/u,
  hiragana: /\p{Script=Hiragana}/u,
  kannada: /\p{Script=Kannada}/u,
  katakana: /\p{Script=Katakana}/u,
  latin: /\p{Script=Latin}/u,
  malayalam: /\p{Script=Malayalam}/u,
  tamil: /\p{Script=Tamil}/u,
  telugu: /\p{Script=Telugu}/u,
  thai: /\p{Script=Thai}/u,
};

const isScript = (char, script) => SCRIPT_PATTERNS[script].test(char);

const canBreakAnywhere = (text) =>
  SCRIPT_PATTERNS.han.test(text) || SCRIPT_PATTERNS.hangul.test(text);

const getTextUnits = (text) => Array.from(text);

const getCharWidth = (char) => {
  if (/\p{Mark}/u.test(char)) return 0;
  if (/\s/u.test(char)) return 4;

  if (isScript(char, "han")) return FONT_SIZE_PX;
  if (isScript(char, "hiragana") || isScript(char, "katakana")) return 12;
  if (isScript(char, "hangul")) return 12;

  if (isScript(char, "arabic")) return 7;
  if (isScript(char, "hebrew")) return 7;
  if (isScript(char, "ethiopic")) return 9;

  if (isScript(char, "devanagari")) return 8;
  if (isScript(char, "bengali")) return 8;
  if (isScript(char, "gujarati")) return 8;
  if (isScript(char, "kannada")) return 9;
  if (isScript(char, "malayalam")) return 9;
  if (isScript(char, "tamil")) return TAMIL_CLUSTER_WIDTH_PX;
  if (isScript(char, "telugu")) return 9;
  if (isScript(char, "thai")) return 8;

  if (isScript(char, "latin") && /[iljI]/u.test(char)) {
    return NARROW_LATIN_WIDTH_PX;
  }
  if (isScript(char, "latin") && char === "t") {
    return NARROW_LATIN_T_WIDTH_PX;
  }

  if (isScript(char, "cyrillic")) return /[А-ЯЁ]/u.test(char) ? 9.5 : 7.5;
  if (isScript(char, "greek")) return /[Α-Ω]/u.test(char) ? 8 : 7;
  if (isScript(char, "latin")) return /[A-ZÀ-Þ]/u.test(char) ? 9 : 7;

  if (/\p{Number}/u.test(char)) return 7;
  if (/\p{Punctuation}/u.test(char) || /\p{Symbol}/u.test(char)) return 5;

  return 8;
};

const getTextUnitWidth = (unit) => {
  if (SCRIPT_PATTERNS.tamil.test(unit)) {
    const baseWidth = Array.from(unit).reduce(
      (sum, char) => sum + getCharWidth(char),
      0
    );

    return TAMIL_WIDE_VOWEL_SIGNS_PATTERN.test(unit)
      ? Math.max(baseWidth, TAMIL_WIDE_CLUSTER_WIDTH_PX)
      : TAMIL_ZERO_VOWEL_SIGNS_PATTERN.test(unit)
      ? TAMIL_ZERO_CLUSTER_WIDTH_PX
      : Math.max(baseWidth, TAMIL_CLUSTER_WIDTH_PX);
  }

  if (unit.length === 1) return getCharWidth(unit);

  return Array.from(unit).reduce((sum, char) => sum + getCharWidth(char), 0);
};

const measureText = (text) =>
  getTextUnits(text).reduce((sum, unit) => sum + getTextUnitWidth(unit), 0);

const canBreakInside = (text) => CJK_OR_THAI_PATTERN.test(text);

const getLinesForBreakableText = (text, maxWidthPx) => {
  const lines = [];
  let currentWidth = 0;

  for (const unit of getTextUnits(text)) {
    const unitWidth = getTextUnitWidth(unit);

    if (currentWidth === 0 && /\s/u.test(unit)) continue;

    if (currentWidth > 0 && currentWidth + unitWidth > maxWidthPx) {
      lines.push(currentWidth);
      currentWidth = 0;
      if (/\s/u.test(unit)) continue;
    }

    currentWidth += unitWidth;
  }

  if (currentWidth > 0) lines.push(currentWidth);

  return lines;
};

const getWrappedLineWidths = (message, maxWidthPx) => {
  const trimmedMessage = message.trim();
  if (trimmedMessage.length === 0) return [0];

  if (canBreakAnywhere(trimmedMessage)) {
    return getLinesForBreakableText(trimmedMessage, maxWidthPx);
  }

  if (!/\s/u.test(trimmedMessage)) {
    return canBreakInside(trimmedMessage)
      ? getLinesForBreakableText(trimmedMessage, maxWidthPx)
      : [measureText(trimmedMessage)];
  }

  const words = trimmedMessage.split(/\s+/u);
  const lines = [];
  let currentWidth = 0;

  for (const word of words) {
    const wordWidth = measureText(word);
    const separatorWidth = currentWidth === 0 ? 0 : getCharWidth(" ");
    const nextWidth = currentWidth + separatorWidth + wordWidth;

    if (nextWidth <= maxWidthPx) {
      currentWidth = nextWidth;
      continue;
    }

    if (currentWidth > 0) {
      lines.push(currentWidth);
      currentWidth = 0;
    }

    if (wordWidth <= maxWidthPx || !canBreakInside(word)) {
      currentWidth = wordWidth;
      continue;
    }

    lines.push(...getLinesForBreakableText(word, maxWidthPx));
  }

  if (currentWidth > 0) lines.push(currentWidth);

  return lines;
};

const validateMessage = (locale, key, message, limit) => {
  const lineWidths = getWrappedLineWidths(message, limit.maxWidthPx);
  const widestLine = Math.max(...lineWidths);

  if (lineWidths.length > limit.maxLines || widestLine > limit.maxWidthPx) {
    return [
      `${locale}: ${key} (${limit.target}) is too wide:`,
      `  message: ${JSON.stringify(message)}`,
      `  estimated lines: ${lineWidths.length}/${limit.maxLines}`,
      `  widest line: ${widestLine}px/${limit.maxWidthPx}px`,
    ].join("\n");
  }

  return null;
};

const readLocaleMessages = (locale) => {
  const localePath = path.join(LOCALES_DIR, locale, "messages.json");
  return JSON.parse(fs.readFileSync(localePath, "utf8"));
};

const validateLocale = (locale) => {
  const messages = readLocaleMessages(locale);
  const errors = [];

  for (const [key, limit] of Object.entries(MESSAGE_LIMITS)) {
    const entry = messages[key];

    if (!entry || typeof entry.message !== "string") {
      errors.push(`${locale}: ${key} must exist and contain a string message.`);
      continue;
    }

    const error = validateMessage(locale, key, entry.message, limit);
    if (error) errors.push(error);
  }

  return errors;
};

const main = () => {
  const locales = fs
    .readdirSync(LOCALES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  const errors = locales.flatMap(validateLocale);

  if (errors.length > 0) {
    console.error("Localization length validation failed.\n");
    console.error(errors.join("\n\n"));
    process.exitCode = 1;
    return;
  }

  console.log(
    `Localization length validation passed for ${locales.length} locales.`
  );
};

main();
