import { readFileSync } from "node:fs";

test("contains the accessible donation reminder", () => {
  const markup = readFileSync(
    new URL("../../../popup.html", import.meta.url),
    "utf8",
  );

  expect(markup).toContain('id="donation-reminder-modal"');
  expect(markup).toContain('role="dialog"');
  expect(markup).toContain('aria-labelledby="donation-reminder-title"');
  expect(markup).toContain('id="donation-reminder-link"');
  expect(markup).toContain('id="donation-reminder-close"');
});
