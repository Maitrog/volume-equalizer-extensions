import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

describe("preset save modal markup", () => {
  test("contains all modal controls", () => {
    const markup = readFileSync(new URL("../../../popup.html", import.meta.url), "utf8");

    expect(markup).toContain('id="preset-save-modal"');
    expect(markup).toContain('id="preset-save-form"');
    expect(markup).toContain('id="preset-name"');
    expect(markup).toContain('id="preset-save-error"');
    expect(markup).toContain('id="preset-save-confirm"');
  });
});
