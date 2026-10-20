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
  const css = fs.readFileSync(path.join(ROOT_DIR, "resources", "styles", "popup.css"), "utf8");

  return html
    .replace('<link rel="stylesheet" href="resources/styles/popup.css">', `<style>${css}</style>`)
    .replace(/<script src="scripts\/popup.js"><\/script>/, "");
};

const readMessages = (locale) =>
  JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, locale, "messages.json"), "utf8"));

const validateLocale = async (page, locale) => {
  const messages = readMessages(locale);
  const errors = [];
  const values = [];

  for (const target of TARGETS) {
    const message = messages[target.key]?.message;

    if (typeof message !== "string") {
      errors.push(`${locale}: ${target.key} must exist and contain a string message.`);
      continue;
    }

    values.push({ ...target, message });
  }

  const measurements = await page.evaluate(
    async ({ locale, values }) => {
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
          : result,
      );
    },
    { locale, values },
  );

  for (const result of measurements) {
    if (result.missing) {
      errors.push(`${locale}: ${result.key} target ${result.selector} does not exist.`);
      continue;
    }

    if (result.scrollWidth > result.clientWidth || result.scrollHeight > result.clientHeight) {
      errors.push(
        [
          `${locale}: ${result.key} (${result.selector}) overflows:`,
          `  message: ${JSON.stringify(result.message)}`,
          `  width: ${result.scrollWidth}px scroll / ${result.clientWidth}px client`,
          `  height: ${result.scrollHeight}px scroll / ${result.clientHeight}px client`,
        ].join("\n"),
      );
    }
  }

  return errors;
};

// Render the production wizard and planner; only the browser-storage boundary is in memory.
const validateWizard = async (page, locale, theme) => {
  const messages = readMessages(locale);
  const keys = Object.keys(readMessages("en")).filter((key) =>
    key.startsWith("settings_transfer_"),
  );
  const errors = keys
    .filter((key) => !messages[key]?.message?.trim())
    .map((key) => `${locale}: missing ${key}`);
  if (errors.length) return errors;
  await page.evaluate(
    async ({ locale, theme, messages }) => {
      window.layoutView?.dispose();
      document.documentElement.lang = locale;
      document.documentElement.dataset.theme = theme;
      const { createSettingsImportView } = await import("/src/ui/popup/settingsImportView.ts");
      const { applyLocalization } = await import("/src/ui/popup/applyLocalization.ts");
      applyLocalization(document, (key) => messages[key]?.message ?? key);
      document.getElementById("settings-modal").style.display = "block";
      const { createSettingsTransferActions } =
        await import("/src/app/popup/settingsTransferActions.ts");
      const get = (id) => document.getElementById(id);
      const name = "Very long imported preset ".repeat(12);
      const filters = [
        { freq: 1234.56789, gain: -12.345, q: 0.707106, type: "peaking", enabled: true },
      ];
      const shortcut = (key) => ({ alt: true, ctrl: false, shift: false, meta: false, key });
      const store = { presets: { [name]: filters }, presetNames: [name], whitelist: [] };
      const actions = createSettingsTransferActions({
        localStorage: {
          get: async () => structuredClone(store),
          set: async (patch) => Object.assign(store, patch),
        },
        browserLocale: locale,
        waitForPendingChanges: async () => {},
        readTarget: async () => ({
          tabId: 7,
          selectionGeneration: 1,
          title: "Long selected tab title ".repeat(12),
          captured: false,
          enabled: false,
          filters,
        }),
        getDimensions: () => ({ canvasWidth: 400, canvasHeight: 200 }),
      });
      const elements = Object.fromEntries(
        [
          "modal",
          "title",
          "groups",
          "conflicts",
          "summary",
          "status",
          "back",
          "next",
          "apply",
          "cancel",
          "close",
        ].map((key) => [key, get(`settings-import-${key}`)]),
      );
      Object.assign(elements, {
        resetConfirm: get("settings-import-reset-confirm"),
        fileInput: get("settings-import-input"),
        importButton: get("import-settings"),
        exportButton: get("export-settings"),
      });
      window.layoutView = createSettingsImportView({
        elements,
        actions,
        getMessage: (key) => messages[key]?.message ?? key,
        applyCommitted: async () => {},
      });
      const presets = { [name]: [{ ...filters[0], gain: 6 }], Empty: [] };
      const presetNames = [name, "Empty"];
      for (let i = 0; i < 30; i++) {
        const key = `${i} ${name}`;
        presets[key] = filters;
        presetNames.push(key);
      }
      window.layoutFile = JSON.stringify({
        format: "eq-toolkit-settings",
        version: 1,
        settings: {
          general: {
            theme,
            uiLanguage: locale,
            pointCount: 7,
            enableSpectrum: false,
            enableVolumeCompensation: true,
            skipPointsResetConfirm: true,
          },
          shortcuts: { mute: shortcut("U"), toggleEq: shortcut("E") },
          presets: { presets, presetNames, hideDefaultPresets: true },
          autostartRules: [
            {
              type: "url",
              value: `https://example.com/${"long-path".repeat(30)}`,
              presetName: "Missing",
            },
            { type: "domain", value: "empty.example.com", presetName: "Empty" },
          ],
        },
      });
    },
    { locale, theme, messages },
  );
  const disclosure = page.locator(
    '#export-settings >> xpath=ancestor::div[contains(@class,"settings-section")]//p[@data-i18n="settings_transfer_privacy"]',
  );
  if (
    !(await disclosure.isVisible()) ||
    (await disclosure.textContent()) !== messages.settings_transfer_privacy.message
  )
    errors.push(`${locale}/${theme}: export address disclosure missing or untranslated`);
  else if (await disclosure.evaluate((element) => element.scrollWidth > element.clientWidth + 1))
    errors.push(`${locale}/${theme}: export disclosure overflows`);
  await page.locator("#settings-import-input").setInputFiles({
    name: "settings.json",
    mimeType: "application/json",
    buffer: Buffer.from(await page.evaluate(() => window.layoutFile)),
  });
  await page.locator("#settings-import-groups input").first().waitFor({ state: "visible" });
  const checkState = async (state) => {
    const issues = await page.evaluate(
      ({ state, messages }) => {
        const modal = document.getElementById("settings-import-modal");
        const failures = [];
        if (
          modal.getAttribute("role") !== "dialog" ||
          modal.getAttribute("aria-modal") !== "true" ||
          !document.getElementById(modal.getAttribute("aria-labelledby"))?.textContent.trim()
        )
          failures.push("dialog role/name missing");
        for (const element of modal.querySelectorAll(
          "section, div, p, fieldset, legend, table, th, td, label, button",
        )) {
          if (!element.getClientRects().length) continue;
          if (element.scrollWidth > element.clientWidth + 1)
            failures.push(
              `horizontal overflow: ${element.tagName}#${element.id} (${element.scrollWidth}/${element.clientWidth})`,
            );
        }
        for (const element of modal.querySelectorAll("button, input")) {
          if (!element.getClientRects().length || element.disabled) continue;
          const label =
            element.getAttribute("aria-label") ||
            element.textContent ||
            Array.from(element.labels ?? [])
              .map((label) => label.textContent)
              .join("");
          if (!label.trim() || label.includes("settings_transfer_"))
            failures.push(`unlabeled control: ${element.id || element.name}`);
        }
        const dialog = modal.querySelector("section");
        const close = document.getElementById("settings-import-close");
        if (
          close.textContent.trim() !== "×" ||
          close.getAttribute("aria-label") !== messages.close.message
        )
          failures.push("close icon or localized accessible label missing");
        const actions = modal.querySelector(".settings-import-actions");
        const buttons = Array.from(actions.children).filter(
          (button) => button.getClientRects().length,
        );
        const expected = state.startsWith("summary")
          ? ["cancel", "back", "apply"]
          : state === "groups"
            ? ["cancel", "next"]
            : state === "conflicts"
              ? ["cancel", "back", "next"]
              : ["cancel"];
        if (
          buttons.map((button) => button.id.replace("settings-import-", "")).join() !==
          expected.join()
        )
          failures.push("actions are not in the expected DOM/keyboard order");
        if (
          getComputedStyle(actions).justifyContent !== "flex-end" ||
          Math.abs(
            buttons.at(-1).getBoundingClientRect().right - actions.getBoundingClientRect().right,
          ) > 1
        )
          failures.push("actions are not aligned to the right");
        if (
          getComputedStyle(dialog).scrollbarColor !==
            getComputedStyle(document.querySelector("#settings-modal .modal-content"))
              .scrollbarColor ||
          getComputedStyle(dialog, "::-webkit-scrollbar-track").backgroundColor !==
            "rgba(0, 0, 0, 0)"
        )
          failures.push("scrollbar does not match the transparent settings scrollbar");
        if (
          dialog.scrollHeight > dialog.clientHeight &&
          getComputedStyle(dialog).overflowY === "visible"
        )
          failures.push("long list is not scrollable");
        return failures;
      },
      { state, messages },
    );
    errors.push(...issues.map((issue) => `${locale}/${theme}/${state}: ${issue}`));
    // Visit every available control in both directions and verify the modal traps focus.
    const count = await page.locator("#settings-import-modal").evaluate(
      (modal) =>
        new Set(
          Array.from(modal.querySelectorAll("button, input"))
            .filter((element) => !element.disabled && element.getClientRects().length)
            .map((element) => (element.type === "radio" ? element.name : element)),
        ).size,
    );
    await page.locator("#settings-import-close").focus();
    for (const key of ["Tab", "Shift+Tab"]) {
      const visited = new Set();
      for (let i = 0; i < count + 1; i++) {
        visited.add(
          await page.evaluate(() => {
            const element = document.activeElement;
            if (!document.getElementById("settings-import-modal").contains(element))
              return "outside";
            return element.type === "radio" ? element.name : element.id || element.dataset.focusKey;
          }),
        );
        await page.keyboard.press(key);
      }
      if (visited.has("outside") || visited.size !== count)
        errors.push(
          `${locale}/${theme}/${state}: ${key} reached ${visited.size}/${count} controls`,
        );
    }
  };
  await checkState("groups");
  for (const [group, count] of [
    ["presets", 32],
    ["autostartRules", 2],
  ]) {
    const label = await page
      .locator(`#settings-import-groups input[value="${group}"]`)
      .evaluate((input) => input.labels[0].textContent);
    if (label !== `${messages[`settings_transfer_${group}`].message}: ${count}`)
      errors.push(`${locale}/${theme}: ${group} selection count missing`);
  }
  await page.locator("#settings-import-next").focus();
  await page.keyboard.press("Enter");
  await page.locator("#settings-import-conflicts table").first().waitFor({ state: "visible" });
  if ((await page.locator("#settings-import-conflicts table").count()) !== 2)
    errors.push(`${locale}: preset conflict must show both tables`);
  await checkState("conflicts");
  await page.locator('#settings-import-conflicts input[value="current"]').focus();
  await page.keyboard.press("Space");
  await page.keyboard.press("ArrowDown");
  if (!(await page.locator('#settings-import-conflicts input[value="incoming"]').isChecked()))
    errors.push(`${locale}: conflict radio arrow keys failed`);
  await page.locator("#settings-import-next").focus();
  await page.keyboard.press("Enter");
  await page.locator("#settings-import-summary").waitFor({ state: "visible" });
  await checkState("summary");
  const summary = await page.locator("#settings-import-summary").textContent();
  for (const key of ["missing_preset", "reset_warning"])
    if (!summary.includes(messages[`settings_transfer_${key}`].message))
      errors.push(`${locale}: summary missing ${key}`);
  if (!(await page.locator("#settings-import-apply").isDisabled()))
    errors.push(`${locale}: reset acknowledgement is required`);
  await page.locator("#settings-import-reset-confirm").focus();
  await page.keyboard.press("Space");
  if (await page.locator("#settings-import-apply").isDisabled())
    errors.push(`${locale}: keyboard acknowledgement did not enable Apply`);
  await checkState("summary acknowledged");
  await page.locator("#settings-import-apply").click();
  await page.waitForFunction(
    (text) => document.getElementById("settings-import-status").textContent === text,
    messages.settings_transfer_saved.message,
  );
  const checkResult = async (state) => {
    await page.evaluate(async (messages) => {
      const { applyLocalization } = await import("/src/ui/popup/applyLocalization.ts");
      applyLocalization(document, (key) => messages[key]?.message ?? key);
    }, messages);
    await checkState(state);
    if ((await page.locator("#settings-import-cancel").textContent()) !== messages.ok.message)
      errors.push(`${locale}/${theme}/${state}: result acknowledgement is not localized OK`);
    const hasSpacing = await page.evaluate(() => {
      const blocks = document.querySelectorAll(
        "#settings-import-summary > section + section, #settings-import-status",
      );
      return Array.from(blocks).every((block) => {
        const style = getComputedStyle(block);
        return parseFloat(style.marginTop) >= parseFloat(style.fontSize);
      });
    });
    if (!hasSpacing)
      errors.push(`${locale}/${theme}/${state}: result blocks lack blank-line spacing`);
    const text = await page.locator("#settings-import-summary").textContent();
    for (const expected of [
      `${messages.settings_transfer_skipped.message}: 2`,
      messages.settings_transfer_missing_preset.message,
      "empty.example.com",
      "https://example.com/",
    ])
      if (!text.includes(expected)) errors.push(`${locale}/${theme}/${state}: missing ${expected}`);
    for (const id of ["groups", "conflicts", "back", "apply", "reset-confirm"])
      if (await page.locator(`#settings-import-${id}`).isVisible())
        errors.push(`${locale}/${theme}/${state}: editable ${id} still visible`);
    if (!(await page.locator("#settings-import-summary").isVisible()))
      errors.push(`${locale}/${theme}/${state}: result details hidden`);
  };
  await checkResult("saved result");
  await page.keyboard.press("Escape");
  const skippedFile = await page.evaluate(() => {
    const file = JSON.parse(window.layoutFile);
    file.settings = { autostartRules: file.settings.autostartRules };
    return JSON.stringify(file);
  });
  await page.locator("#settings-import-input").setInputFiles({
    name: "skipped.json",
    mimeType: "application/json",
    buffer: Buffer.from(skippedFile),
  });
  if (
    (await page.locator("#settings-import-cancel").textContent()) !==
    messages.settings_transfer_cancel.message
  )
    errors.push(`${locale}/${theme}: reopening did not restore Cancel`);
  await page.locator("#settings-import-next").click();
  await page.locator("#settings-import-apply").click();
  await page.waitForFunction(
    (text) => document.getElementById("settings-import-status").textContent === text,
    messages.settings_transfer_unchanged.message,
  );
  await checkResult("unchanged result with skips");
  await page.keyboard.press("Escape");
  if (await page.locator("#settings-import-modal").isVisible())
    errors.push(`${locale}: Escape did not close wizard`);
  return errors;
};

const main = async () => {
  const locales = fs
    .readdirSync(LOCALES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const { createServer } = await import("vite");
  const server = await createServer({
    configFile: false,
    root: ROOT_DIR,
    server: { host: "127.0.0.1", port: 0 },
    appType: "custom",
  });
  server.middlewares.use("/__layout-check", (_request, response) => {
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.end(getPopupMarkup());
  });
  await server.listen();
  let browser;
  try {
    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 500, height: 650 } });
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/__layout-check`);
    const errors = [];
    for (const locale of locales) {
      errors.push(...(await validateLocale(page, locale)));
      for (const theme of ["dark", "light"])
        errors.push(...(await validateWizard(page, locale, theme)));
    }
    if (errors.length) {
      console.error("Localization layout validation failed.\n" + errors.join("\n"));
      process.exitCode = 1;
    } else
      console.log(
        `Localization layout validation passed for ${locales.length} locales: export disclosure and real groups/conflicts/summary/results, dark/light, counts, labels and keyboard focus.`,
      );
  } finally {
    await browser?.close();
    await server.close();
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
