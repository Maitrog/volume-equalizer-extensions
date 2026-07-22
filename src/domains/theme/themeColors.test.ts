import { readThemeColors } from "./themeColors";

describe("readThemeColors", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("reads trimmed CSS custom properties from the provided element", () => {
    const values = new Map([
      ["--accent-start", " #111111 "],
      ["--accent-mid", " #222222 "],
      ["--accent-end", " #333333 "],
      ["--highpass-filter", " #444444 "],
      ["--lowpass-filter", " #555555 "],
      ["--panel-bg", " #666666 "],
      ["--axis", " #777777 "],
    ]);

    vi.stubGlobal(
      "getComputedStyle",
      vi.fn(() => ({
        getPropertyValue: (propertyName: string) =>
          values.get(propertyName) ?? "",
      })),
    );

    expect(readThemeColors({} as Element)).toEqual({
      accentStart: "#111111",
      accentMid: "#222222",
      accentEnd: "#333333",
      highpassFilterColor: "#444444",
      lowpassFilterColor: "#555555",
      panelBg: "#666666",
      axis: "#777777",
    });
  });
});
