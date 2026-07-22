import { readdirSync, readFileSync } from "node:fs";

const localesUrl = new URL("../../../_locales/", import.meta.url);
const requiredKeys = [
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
  "donation_reminder_title",
  "donation_reminder_message",
  "donation_reminder_link",
] as const;

test("every locale contains the required popup messages", () => {
  for (const entry of readdirSync(localesUrl, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const messages = JSON.parse(
      readFileSync(new URL(`${entry.name}/messages.json`, localesUrl), "utf8"),
    ) as Record<string, { message?: string }>;

    requiredKeys.forEach((key) => {
      expect(messages[key]?.message, `${entry.name}: ${key}`).toBeTruthy();
    });
  }
});
