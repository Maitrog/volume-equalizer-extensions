const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const ROOT_DIR = path.join(__dirname, "..");
const LOCALES_DIR = path.join(ROOT_DIR, "_locales");
const TARGETS = [
  { key: "empty_preset_name", selector: "#presets-toggle" },
  { key: "save_preset_button_label", selector: "#save-preset" },
  { key: "reset_button_label", selector: "#reset" },
];

const getPopupMarkup = () => {
  const html = fs.readFileSync(path.join(ROOT_DIR, "popup.html"), "utf8");
  const css = fs.readFileSync(
    path.join(ROOT_DIR, "resources", "styles", "popup.css"),
    "utf8"
  );

  return html
    .replace(
      '<link rel="stylesheet" href="resources/styles/popup.css">',
      `<style>${css}</style>`
    )
    .replace('  <script src="scripts/popup.js"></script>', "");
};

const readMessages = (locale) =>
  JSON.parse(
    fs.readFileSync(
      path.join(LOCALES_DIR, locale, "messages.json"),
      "utf8"
    )
  );

const validateLocale = async (page, locale) => {
  const messages = readMessages(locale);
  const errors = [];
  const values = [];

  for (const target of TARGETS) {
    const message = messages[target.key]?.message;

    if (typeof message !== "string") {
      errors.push(
        `${locale}: ${target.key} must exist and contain a string message.`
      );
      continue;
    }

    values.push({ ...target, message });
  }

  const measurements = await page.evaluate(async ({ locale, values }) => {
    document.documentElement.lang = locale;
    const results = [];

    for (const value of values) {
      const element = document.querySelector(value.selector);

      if (!element) {
        results.push({ ...value, missing: true });
        continue;
      }

      element.textContent = value.message;
      results.push({ ...value, element });
    }

    await document.fonts.ready;

    return results.map(({ element, ...result }) =>
      element
        ? {
            ...result,
            scrollWidth: element.scrollWidth,
            clientWidth: element.clientWidth,
            scrollHeight: element.scrollHeight,
            clientHeight: element.clientHeight,
          }
        : result
    );
  }, { locale, values });

  for (const result of measurements) {
    if (result.missing) {
      errors.push(
        `${locale}: ${result.key} target ${result.selector} does not exist.`
      );
      continue;
    }

    if (
      result.scrollWidth > result.clientWidth ||
      result.scrollHeight > result.clientHeight
    ) {
      errors.push([
        `${locale}: ${result.key} (${result.selector}) overflows:`,
        `  message: ${JSON.stringify(result.message)}`,
        `  width: ${result.scrollWidth}px scroll / ${result.clientWidth}px client`,
        `  height: ${result.scrollHeight}px scroll / ${result.clientHeight}px client`,
      ].join("\n"));
    }
  }

  return errors;
};

const main = async () => {
  const locales = fs
    .readdirSync(LOCALES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const browser = await chromium.launch();

  try {
    const page = await browser.newPage();
    await page.setContent(getPopupMarkup());
    const errors = [];

    for (const locale of locales) {
      errors.push(...await validateLocale(page, locale));
    }

    if (errors.length > 0) {
      console.error("Localization layout validation failed.\n");
      console.error(errors.join("\n\n"));
      process.exitCode = 1;
      return;
    }

    console.log(
      `Localization layout validation passed for ${locales.length} locales.`
    );
  } finally {
    await browser.close();
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
