# Repository Guidelines

## Project Structure & Module Organization

- Core browser extension manifest lives in `manifest.json`; popup markup is in `popup.html` and pulls styles from `resources/styles/popup.css` plus icons/images in `resources/icons` and `resources/images`.

- All runtime logic is TypeScript modules in `src/`.

- Localized strings sit in `_locales/<lang>/messages.json`; keep keys consistent across languages and match `__MSG_*__` tokens in markup and scripts.

## Build, Test, and Development Commands

- `npm ci` (or `npm install`): installs dev dependencies; there is no bundler or transpile step.

- `npm build`: runs build using vite with custom script (`tools/buildExtension.mjs`)

- `lint:locales`: validates length of strings and lines count for some buttons

- `npm test`: runs unit tests using vitest

- Packaging: zip `dist/` for store uploads after build; avoid including `node_modules/`.

## Do not patch symptoms

- When fixing bugs, do not add quick workarounds whose only purpose is to make the current case pass.

- Treat such changes as a temporary stub, not a real solution.

- Your goal is to find and fix the actual root cause of the error. Before changing code, investigate why the failure happens, where the incorrect assumption is, and what part of the system is responsible.

Avoid fixes like:

- swallowing errors without understanding them

- adding special cases just to satisfy one scenario

- forcing values into a valid shape without knowing why they are invalid

- retrying, ignoring, or bypassing failing logic

- making the code “just work” while leaving the underlying issue unresolved

A correct fix should explain and address the real cause of the bug, not merely hide its effects.

## Avoid redundant validation layers

- Normalize and validate external input once at the boundary where it enters the system, then pass the resolved value through internal functions.

- Do not call the same fallback/validation helper repeatedly through nested helper chains unless the value can be modified or become invalid between calls.

## Coding Style & Naming Conventions

- Use 2-space indentation, semicolons, and `const`/`let` over `var`; prefer arrow functions and early returns to mirror existing files.

- File names are camel case (`drawSpectrum.ts` style); functions and variables use `camelCase`. Keep DOM ids/classes in `kebab-case` as seen in `popup.html`.

- Favor double quotes in TS/JS/JSON to stay consistent with current code and locale files.

## Testing Guidelines

- No automated test suite yet; run manual checks after changes: reload the unpacked extension, open the popup, tweak bands, toggle mute/reset, and confirm spectrum drawing updates without console errors.

- Verify localization by switching the browser language and checking visible strings against `_locales` entries; default locale is `en`.

- When touching audio logic, test across multiple tabs and sites to confirm content scripts register via `background.js` and settings persist in `chrome.storage`.

## Localization

- When adding UI text, create English copy first at the end of `_locales/en/messages.json`, then mirror keys across other locales and translate values; avoid hardcoded strings in markup or scripts.
