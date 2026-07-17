import { readdirSync, readFileSync } from "node:fs";

const localesUrl = new URL("../../../_locales/", import.meta.url);
const guideKeys = [
  "guide_back",
  "guide_next",
  "guide_skip",
  "guide_finish",
  "guide_theme_dark",
  "guide_theme_light",
  "guide_shortcuts_hint",
  "guide_canvas_hint",
  "guide_volume_hint",
  "guide_presets_hint",
] as const;

test("every locale contains the onboarding guide messages", () => {
  for (const entry of readdirSync(localesUrl, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const messages = JSON.parse(
      readFileSync(new URL(`${entry.name}/messages.json`, localesUrl), "utf8"),
    ) as Record<string, { message?: string }>;

    guideKeys.forEach((key) => {
      expect(messages[key]?.message, `${entry.name}: ${key}`).toBeTruthy();
    });
  }
});
