import { readFileSync } from "node:fs";

test("contains the accessible onboarding overlay", () => {
  const markup = readFileSync(
    new URL("../../../popup.html", import.meta.url),
    "utf8",
  );

  expect(markup).toContain('id="onboarding-guide"');
  expect(markup).toContain('role="dialog"');
  expect(markup).toContain('aria-modal="true"');
  expect(markup).toContain('data-guide-action="skip"');
  expect(markup).toMatch(
    /<section id="preset-controls-card" class="control-card">\s*<h2 id="preset-controls-title">/,
  );
});
